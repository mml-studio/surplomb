// Variant C of the first-run experience: no card, a bubble on the search field.
//
// "Première visite ? Tapez une adresse ici." pointing at LOCATION on a desktop
// and at the search bar at the top of a phone. It never takes the screen:
//
//   - it is NOT a dialog and holds no keyboard handler, so Échap and every
//     hotkey go where they always went;
//   - the first pointerdown anywhere else closes it, and so do twelve seconds
//     of nothing;
//   - a screen-claiming surface (cockpit, scene, recording, clean view) closes
//     it too, and one already up means it never opens — a 12-second bubble has
//     nothing to wait for;
//   - so does the tray it points at: on a desktop, hovering LOCATION opens its
//     popover in exactly the space the bubble occupies.
//
// It lives in its own element, `#first-run-hint`, and never in
// `#first-run-launcher`: on a phone, phone.css hides the whole sheet while the
// launcher is visible, and the sheet is what this bubble points at.
//
// Closing is reported through `onClose` (the show policy's two keys, written by
// src/firstRunExperience.js) and `emit` (the event contract). Nothing here reads
// or writes storage.

export const FIRST_RUN_HINT_TIMEOUT_MS = 12000;
/** Matches the leave transition in style.css; a timer, not `transitionend`. */
export const FIRST_RUN_HINT_LEAVE_MS = 140;

/** Viewport margin the bubble keeps while it follows its anchor. */
const EDGE_PX = 12;

/**
 * Open the bubble.
 * @param {object} input
 * @param {HTMLElement|null} input.host `#first-run-hint`.
 * @param {HTMLTemplateElement|null} input.template `template[data-first-run-variant="C"]`.
 * @param {Element|null} [input.anchor] What the caret points at.
 * @param {boolean} [input.phoneShell]
 * @param {() => void} [input.openSearch] Opens the search field it advertises.
 * @param {(event: object) => void} [input.emit]
 * @param {() => void} [input.onClose]
 * @param {() => boolean} [input.isBlocked] Is a screen-claiming surface up?
 * @param {Element|null} [input.tray] The collapsible panel the anchor belongs
 *   to (`#location-bar`); losing `collapsed` means it opened over the bubble.
 * @param {Document} [input.documentRef]
 * @param {object} [input.windowRef]
 * @param {Function} [input.setTimer]
 * @param {Function} [input.clearTimer]
 * @returns {{close: (reason: string) => void, isOpen: () => boolean}|null}
 */
export function initFirstRunHint({
  host,
  template,
  anchor = null,
  phoneShell = false,
  openSearch = () => {},
  emit = () => {},
  onClose = () => {},
  isBlocked = () => false,
  tray = null,
  documentRef = globalThis.document,
  windowRef = globalThis,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
} = {}) {
  if (!host || !template?.content) return null;
  const trayOpen = () => Boolean(tray?.classList && !tray.classList.contains('collapsed'));
  // Nothing written: the visitor never saw it, so the next visit may.
  if (isBlocked() || trayOpen()) return null;

  host.replaceChildren(template.content.cloneNode(true));
  host.dataset.firstRunVariant = 'C';
  host.hidden = false;
  let open = true;

  const place = () => {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || !(rect.width > 0 && rect.height > 0)) return;
    const viewportWidth = Number(windowRef.innerWidth) || 0;
    const anchorX = rect.left + rect.width / 2;
    const half = (host.getBoundingClientRect?.().width || 0) / 2;
    // Follow the anchor, but never past the viewport edge: LOCATION sits at
    // the dock's left end, closer to the edge than half a bubble. The caret
    // then carries the difference, so it still points at the anchor.
    const x = viewportWidth > 0
      ? Math.min(Math.max(anchorX, half + EDGE_PX), Math.max(half + EDGE_PX, viewportWidth - half - EDGE_PX))
      : anchorX;
    host.style.setProperty('--first-run-hint-x', `${Math.round(x)}px`);
    host.style.setProperty('--first-run-hint-caret', `${Math.round(anchorX - x)}px`);
    // A phone's search bar is at the TOP of the screen, so the bubble hangs
    // under it with the caret turned up (phone.css); a desktop's sits above
    // LOCATION, at the bottom.
    if (phoneShell) {
      host.style.setProperty('--first-run-hint-top', `${Math.round(rect.bottom + 10)}px`);
    } else {
      const viewportHeight = Number(windowRef.innerHeight) || 0;
      host.style.setProperty('--first-run-hint-bottom', `${Math.round(viewportHeight - rect.top + 10)}px`);
    }
  };

  const cleanups = [];
  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  let timer = null;
  let observer = null;
  let trayObserver = null;

  const close = (reason) => {
    if (!open) return;
    open = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
    observer?.disconnect();
    trayObserver?.disconnect();
    for (const undo of cleanups.splice(0)) undo();
    try {
      onClose();
    } catch (error) {
      console.warn('[First run] Could not record the close:', error);
    }
    emit({ type: 'dismiss', via: reason });
    host.classList.remove('visible');
    host.classList.add('first-run-hint-leaving');
    setTimer(() => host.remove(), FIRST_RUN_HINT_LEAVE_MS);
  };

  // Capture phase: a control that stops propagation still counts as "the
  // visitor is doing something else now".
  listen(documentRef, 'pointerdown', (event) => {
    if (host.contains(event.target)) return;
    close('click-away');
  }, true);
  listen(host.querySelector('[data-first-run-hint-open]'), 'click', () => {
    if (!open) return;
    emit({ type: 'action', kind: 'hint-click', outcome: 'found' });
    // Closed FIRST: the search opens onto a clean screen, and on a phone the
    // tab selection is not raced by the bubble's own teardown.
    close('choice');
    openSearch();
  });
  listen(windowRef, 'resize', place);

  if (typeof globalThis.MutationObserver === 'function' && documentRef?.body) {
    observer = new globalThis.MutationObserver(() => {
      if (isBlocked()) close('yield');
    });
    observer.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });
    if (tray) {
      trayObserver = new globalThis.MutationObserver(() => {
        if (trayOpen()) close('yield');
      });
      trayObserver.observe(tray, { attributes: true, attributeFilter: ['class'] });
    }
  }
  timer = setTimer(() => close('timeout'), FIRST_RUN_HINT_TIMEOUT_MS) ?? null;

  // The entry is a CSS animation on `.visible`, so the class lands now: no
  // frame callback to wait for on a globe that may be parked.
  host.classList.add('visible');
  place();
  emit({ type: 'impression', shell: phoneShell ? 'phone' : 'desktop' });

  return { close, isOpen: () => open };
}
