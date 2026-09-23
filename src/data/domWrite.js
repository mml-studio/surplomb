// src/data/domWrite.js
/**
 * DOM writes that happen only when the value changes.
 *
 * WHY A WRITE OF THE SAME VALUE IS NOT FREE. Setting `textContent` replaces the
 * text node even when the string is identical, and setting an attribute or a
 * reflected property (`title`, `hidden`, `className`) queues a mutation record
 * whatever the old value was. The panel refresh runs on every layer's stats
 * tick — twice a second for the submarine cables alone — and rewrote every row
 * of the panel each time, lit or not: 7 500 mutation records per 10 s with
 * « Infrastructure numérique » on and the camera still (ThinkCentre, CPU ×4,
 * 2026-09-23). Both side rails watch their subtree with a `MutationObserver`
 * and answer each batch with a measuring layout pass (`src/ui.js`), and the
 * globe's own per-frame size check then paid for the layout those passes
 * dirtied: 92 to 110 layouts and 1,1 s of style recalculation per 10 s, for
 * a panel that looked exactly the same before and after.
 *
 * Each helper reads first and writes only on a difference, and says whether
 * it wrote. A node that cannot be read back (the element doubles of the unit
 * tests have no `getAttribute`) is written, as before.
 */

/**
 * @param {?{textContent: string}} node
 * @param {string} text
 * @returns {boolean} Whether the node was written.
 */
export function writeText(node, text) {
  if (!node) return false;
  const next = String(text ?? '');
  if (node.textContent === next) return false;
  node.textContent = next;
  return true;
}

/**
 * A plain or reflected property — `hidden`, `disabled`, `title`, `className`,
 * or a key of `dataset`.
 * @param {?object} node
 * @param {string} key
 * @param {*} value
 * @returns {boolean} Whether the node was written.
 */
export function writeProperty(node, key, value) {
  if (!node) return false;
  if (node[key] === value) return false;
  node[key] = value;
  return true;
}

/**
 * @param {?{setAttribute: Function, getAttribute?: Function}} node
 * @param {string} name
 * @param {*} value Stringified, as `setAttribute` would.
 * @returns {boolean} Whether the node was written.
 */
export function writeAttribute(node, name, value) {
  if (!node) return false;
  const next = String(value);
  if (typeof node.getAttribute === 'function' && node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}
