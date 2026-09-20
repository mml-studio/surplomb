/**
 * What is selected on the globe, as DOM a reader can actually read.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * It is the one piece of the phone shell that NO browser harness can reach.
 * Nothing in this app selects anything under Puppeteer: Cesium entities do not
 * paint headless, `scene.pick` finds nothing on a canvas that never rendered,
 * and the selected card itself is painted rather than built. So the only honest
 * way to prove these cards are right is to hand the renderer a list and read
 * the nodes back — which requires the renderer to take its host as an argument
 * and know nothing else. Same shape, and the same reason, as
 * `renderZoomPrompt` in `src/zoomPrompt.js`.
 *
 * ── WHY A MIRROR AT ALL ─────────────────────────────────────────────────────
 *
 * The selected card is drawn on `#world-overlay-canvas` at 12 px for the title
 * and 10.5 px for each detail line (`worldOverlayTokens.js`). On a desktop it
 * sits beside the cursor. On a phone it sits under the finger that selected it,
 * at a size nobody reads standing up. These are the same words at 16 and 14 px,
 * in the sheet, where the finger is not.
 *
 * @module phoneSelection
 */

import messages from './phoneSelection.i18n.js';

/**
 * What the empty tab says. One sentence, and it names the verb.
 *
 * A function and no longer a constant: the words are read when the tab is
 * painted, so the same loaded module answers in whichever language the page
 * is in (ratchet R5, and CONVENTIONS § 2).
 * @returns {string}
 */
export const phoneSelectionEmptyText = () => messages().empty;

/**
 * A stable string for a selection list, so an unchanged selection is not
 * rebuilt under the reader's finger.
 *
 * @param {Array<object>} items
 * @returns {string}
 */
export function phoneSelectionSignature(items) {
  if (!Array.isArray(items)) return '';
  // ESCAPES, not the characters themselves. The separators are U+0000/1/2 —
  // bytes no title or detail line can contain — and typed literally they turn
  // this file into something Git reports as binary and no reviewer can read.
  return items
    .map((item) => [item?.key ?? item?.id ?? '', item?.title ?? '', (item?.details || []).join('\u0002')].join('\u0000'))
    .join('\u0001');
}

/**
 * Paint the selection into `host`.
 *
 * @param {object} host - Element with `replaceChildren`/`appendChild` and an
 *   `ownerDocument` that can `createElement`. Null is a no-op.
 * @param {Array<object>} items - `{key, title, details, accent, activate}`.
 * @param {{onDismiss?: Function}} [handlers]
 * @returns {number} Cards rendered, or -1 when nothing was rebuilt.
 */
export function renderPhoneSelection(host, items, { onDismiss = null } = {}) {
  if (!host || typeof host.appendChild !== 'function') return -1;
  const list = Array.isArray(items) ? items : [];
  const signature = phoneSelectionSignature(list);
  // Rebuilding identical nodes would cancel a scroll and drop a press in
  // progress, and a tracked contact re-publishes its entry on every tick.
  if (host.dataset && host.dataset.phoneSelectionSignature === signature) return -1;
  if (host.dataset) host.dataset.phoneSelectionSignature = signature;

  const doc = host.ownerDocument;
  const make = (tag, className) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  };
  if (typeof host.replaceChildren === 'function') host.replaceChildren();
  else while (host.firstChild) host.removeChild(host.firstChild);

  if (!list.length) {
    const empty = make('p', 'phone-selection-empty');
    empty.textContent = phoneSelectionEmptyText();
    host.appendChild(empty);
    return 0;
  }

  for (const item of list) {
    const activatable = typeof item?.activate === 'function';
    // A `<div>` when there is nothing to activate: a button that does nothing
    // is a promise, and a reader who presses it twice concludes the app is
    // broken rather than that this object has no camera to fly to.
    const card = make(activatable ? 'button' : 'div', 'phone-selection-card');
    if (activatable) card.type = 'button';
    // `setProperty`, never interpolated into markup: the accent is a string the
    // layer supplied, and it is the only value here that comes from outside.
    if (typeof item?.accent === 'string') card.style?.setProperty?.('--phone-card-accent', item.accent);
    if (item?.tracked) card.dataset.tracked = 'true';

    const title = make('span', 'phone-selection-title');
    title.textContent = item?.title || item?.id || '—';
    card.appendChild(title);

    for (const line of item?.details || []) {
      const detail = make('span', 'phone-selection-detail');
      detail.textContent = line;
      card.appendChild(detail);
    }
    if (activatable) card.addEventListener?.('click', () => { item.activate(); });
    host.appendChild(card);
  }

  const dismiss = make('button', 'phone-selection-dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute?.('aria-label', messages().dismiss);
  dismiss.textContent = '×';
  // It lowers the SHEET and does not deselect. What is selected belongs to the
  // layer that selected it; a mirror that could clear it would be a second
  // owner of the same state, and the two would disagree the first time a layer
  // refused to let go.
  if (onDismiss) dismiss.addEventListener?.('click', () => { onDismiss(); });
  host.appendChild(dismiss);
  return list.length;
}
