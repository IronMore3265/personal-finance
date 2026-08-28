// Minimal element builder. Screens describe their markup as nested el() calls
// rather than as HTML strings, so nothing user-entered is ever parsed as markup.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  }

  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c))
      : c);
  }
  return node;
}

export const frag = (children) => {
  const f = document.createDocumentFragment();
  for (const c of [].concat(children)) if (c) f.appendChild(c);
  return f;
};

/** Section header: label, hairline rule, optional trailing meta or link. */
export function section(label, trailing) {
  return el('div', { class: 'section' }, [
    el('div', { class: 'section__label', text: label }),
    el('div', { class: 'section__fill' }),
    trailing || null
  ]);
}

export function sectionMeta(text) {
  return el('div', { class: 'section__meta', text });
}

export function sectionLink(text, onClick) {
  return el('div', { class: 'section__link tappable', text, onClick });
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
