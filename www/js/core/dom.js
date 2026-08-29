// Minimal element builder, and the reconciler that puts what it builds on
// screen without throwing away what is already there.
//
// Screens describe their markup as nested el() calls rather than as HTML
// strings, so nothing user-entered is ever parsed as markup.
//
// A screen still describes the whole of itself on every pass - that is what
// keeps the screens simple. What changed is what the shell does with the
// result: `patch()` walks the new tree against the live one and writes only
// the differences, so a node that has not changed is not touched, let alone
// replaced. Nothing is destroyed and re-created, so nothing re-enters: CSS
// animations do not replay, scroll offsets do not reset, focus and caret stay
// where they were, and a transition that was mid-flight carries on.

/* The live value of a form control is a property, not an attribute: once the
   user has typed, the `value` attribute no longer describes what is on screen
   and writing it alone changes nothing. These tags get the property too. */
const FORM = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/* Event handlers live in a map on the node and are dispatched through one
   listener per event type. A rebind then costs an assignment, so patching can
   swap a closure over stale state for a fresh one without the listener churn
   - and without leaking a listener per render onto a node that survives. */
function bind(node, type, fn) {
  const on = node.__on || (node.__on = {});
  const had = type in on;
  on[type] = fn;
  if (had) return;
  node.addEventListener(type, (ev) => {
    const handler = node.__on && node.__on[type];
    if (handler) handler(ev);
  });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') bind(node, k.slice(2).toLowerCase(), v);
    else {
      node.setAttribute(k, v);
      // A textarea has no value attribute at all and an input's only seeds the
      // property. Writing both keeps the attribute as the record of what the
      // state says, which is what the reconciler compares against.
      if (k === 'value' && FORM.has(node.nodeName)) node.value = v;
    }
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

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

/* ------------------------------------------------------------------ *
 * Reconciler
 * ------------------------------------------------------------------ */

const ELEMENT = 1;
const TEXT = 3;

/**
 * A node that runs itself.
 *
 * `data-keep` marks a subtree the reconciler must not touch: the date picker
 * draws its own month grid and remembers which month you paged to, and that
 * memory lives in the live node's closures, not in the store. Patching a
 * freshly built picker over it would swap in handlers that talk to a detached
 * copy - and snap the view back to the selected month on every tap elsewhere
 * in the sheet. Matched by value, so the picker in one sheet is never mistaken
 * for the one in another.
 */
const keepOf = (n) =>
  (n.nodeType === ELEMENT && n.getAttribute) ? n.getAttribute('data-keep') : null;

/**
 * Whether the live node can be re-used for the wanted one, or has to be
 * replaced outright. Tag and namespace, so an `svg > path` is never patched
 * into an HTML `<path>` and a `<div>` never becomes a `<span>` in place.
 */
function reusable(have, want) {
  return have.nodeType === want.nodeType
    && have.nodeName === want.nodeName
    && have.namespaceURI === want.namespaceURI;
}

function syncAttrs(have, want) {
  const wanted = want.attributes;
  for (let i = 0; i < wanted.length; i++) {
    const { name, value } = wanted[i];
    if (have.getAttribute(name) !== value) have.setAttribute(name, value);
  }
  // Walk backwards: removeAttribute shortens the live collection underneath us.
  const held = have.attributes;
  for (let i = held.length - 1; i >= 0; i--) {
    const name = held[i].name;
    if (!want.hasAttribute(name)) have.removeAttribute(name);
  }

  if (FORM.has(have.nodeName) && want.hasAttribute('value')) {
    const v = want.getAttribute('value');
    // Only when it actually differs: assigning to `value` collapses the
    // selection, which would eat the caret of the field being typed into.
    if (have.value !== v) have.value = v;
  }
}

/**
 * Point the live node at the new closures.
 *
 * Every handler is rebound, because a handler built this pass has closed over
 * this pass's state - the row that was transaction #4 last render may be #5
 * now, and its old onClick would open the wrong one. Types the new node does
 * not have are blanked rather than deleted, so the dispatcher installed for
 * them stays harmless and is there again if the type comes back.
 */
function syncHandlers(have, want) {
  const next = want.__on;
  const live = have.__on;
  if (!next && !live) return;
  if (live) for (const type in live) live[type] = null;
  if (next) for (const type in next) bind(have, type, next[type]);
}

function patchNode(have, want) {
  if (have.nodeType === TEXT) {
    if (have.nodeValue !== want.nodeValue) have.nodeValue = want.nodeValue;
    return;
  }
  if (have.nodeType !== ELEMENT) return;
  syncAttrs(have, want);
  syncHandlers(have, want);
  patch(have, Array.from(want.childNodes));
}

/**
 * Make `parent`'s children match `next`, in place.
 *
 * Matching is by position. The screens draw the same rows in the same order
 * from one pass to the next, so position is a good enough identity: a list
 * that gained a row patches the tail and appends one, rather than replacing
 * every node in it. Where position lies - a row was inserted at the top - the
 * result is still correct, it just rewrites more text than it had to.
 *
 * `next` holds real nodes, so a mismatch does not need a builder: the wanted
 * node is simply moved into place.
 */
export function patch(parent, next) {
  const list = [];
  for (const c of [].concat(next)) {
    if (c === null || c === undefined || c === false) continue;
    list.push(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c))
      : c);
  }

  for (let i = 0; i < list.length; i++) {
    const want = list[i];
    const have = parent.childNodes[i];
    if (!have) parent.appendChild(want);
    else if (have === want) continue;
    else if (!reusable(have, want)) parent.replaceChild(want, have);
    else if (keepOf(want) !== null && keepOf(want) === keepOf(have)) continue;
    else patchNode(have, want);
  }

  while (parent.childNodes.length > list.length) parent.removeChild(parent.lastChild);
}
