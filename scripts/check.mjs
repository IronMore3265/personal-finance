// Static sanity check for a codebase with no build step.
//
// Nothing compiles www/, so a typo in an import path or a name that is not
// actually exported is invisible until the app opens to a blank screen. This
// walks the module graph from app.js and reports both.
//
//   node scripts/check.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www', 'js');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(www);
const problems = [];

const IMPORT_RE = /^\s*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/gm;
const EXPORT_RE = /^\s*export\s+(?:(?:async\s+)?function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|class\s+(\w+))/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\}/gm;

const exportsOf = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const names = new Set();
  let m;
  while ((m = EXPORT_RE.exec(src))) names.add(m[1] || m[2] || m[3] || m[4]);
  while ((m = EXPORT_LIST_RE.exec(src))) {
    m[1].split(',').forEach(part => {
      const bits = part.trim().split(/\s+as\s+/);
      if (bits.length) names.add((bits[1] || bits[0]).trim());
    });
  }
  exportsOf.set(f, names);
}

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(root, f).replace(/\\/g, '/');
  let m;
  IMPORT_RE.lastIndex = 0;

  while ((m = IMPORT_RE.exec(src))) {
    const [, clause, spec] = m;
    if (!spec.startsWith('.')) continue;

    const target = resolve(dirname(f), spec);
    if (!existsSync(target)) {
      problems.push(rel + ': imports missing file ' + spec);
      continue;
    }
    if (!clause || clause.trim().startsWith('*')) continue;

    const named = clause.match(/\{([^}]*)\}/);
    if (!named) continue;

    const have = exportsOf.get(target) || new Set();
    for (const part of named[1].split(',')) {
      const want = part.trim().split(/\s+as\s+/)[0].trim();
      if (!want) continue;
      if (!have.has(want)) {
        problems.push(rel + ': ' + spec + ' does not export "' + want + '"');
      }
    }
  }
}

// Parse every module for real. Screens only touch the DOM inside functions,
// so importing them is safe as long as the shell entry point is left alone.
const skip = new Set([join(www, 'app.js')]);
for (const f of files) {
  if (skip.has(f)) continue;
  try {
    await import(pathToFileURL(f).href);
  } catch (err) {
    problems.push(relative(root, f).replace(/\\/g, '/') + ': ' + err.message.split('\n')[0]);
  }
}

if (problems.length) {
  console.error(problems.length + ' problem(s):\n');
  problems.forEach(p => console.error('  ' + p));
  process.exit(1);
}
console.log(files.length + ' modules, imports and exports all resolve');
