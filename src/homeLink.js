/**
 * The mark in the corner of the globe leads back to the landing page — after
 * asking.
 *
 * WHY IT ASKS. The globe is a working surface: layers switched on, a camera
 * placed, a card open. The mark is also the one thing on screen that looks
 * like decoration, and a reader who presses it by accident would lose all of
 * that to a page they had already read. So a plain press opens `#home-confirm`
 * (index.html) and the page leaves only on « Confirmer ».
 *
 * WHAT IT DOES NOT ASK. A press that opens a new tab or window (middle button,
 * Ctrl, ⌘, Shift) leaves the globe where it is: the link's own `href="/"`
 * does the work and nothing is lost. Without JavaScript the link is a link.
 *
 * WHAT LEAVING KEEPS. The share hash trails the screen by its debounce, so it
 * is flushed first: the address the browser's Back button returns to then
 * holds this camera and these layers, which is what the dialog promises.
 *
 * @module homeLink
 */

/** The dialog's value that means « leave ». Anything else — Cancel, Escape, a
 * press on the backdrop — stays. */
export const HOME_CONFIRM_VALUE = 'confirm';

/** The landing page's address (src/vitrine/gate.js shows the showcase there). */
export const HOME_PATH = '/';

/**
 * Is this a press that navigates in place? A new-tab gesture is not.
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function isPlainClick(event) {
  return (event?.button ?? 0) === 0
    && !event?.metaKey && !event?.ctrlKey && !event?.shiftKey && !event?.altKey;
}

/**
 * Wire the mark. Safe to call twice and safe to call without the markup.
 *
 * @param {object} [options]
 * @param {Document} [options.documentRef]
 * @param {{flushHash?: Function}|null} [options.shareLink] `ui.shareLinkManager`.
 * @param {(href: string) => void} [options.navigate] Injected in tests.
 * @returns {{link: HTMLElement, dialog: HTMLElement, destroy: () => void}|null}
 */
export function initHomeLink({
  documentRef = globalThis.document,
  shareLink = null,
  navigate = (href) => globalThis.location.assign(href),
} = {}) {
  const link = documentRef?.querySelector?.('[data-home-link]');
  const dialog = documentRef?.getElementById?.('home-confirm');
  if (!link || !dialog || link.dataset.homeLinkReady === 'true') return null;
  link.dataset.homeLinkReady = 'true';
  const href = link.getAttribute('href') || HOME_PATH;

  const leave = () => {
    shareLink?.flushHash?.();
    navigate(href);
  };

  const onClick = (event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (typeof dialog.showModal !== 'function') {
      // A browser without <dialog> (Safari before 15.4): the same question,
      // in the browser's own words box.
      const question = dialog.querySelector('#home-confirm-body')?.textContent || '';
      if (documentRef.defaultView?.confirm?.(question)) leave();
      return;
    }
    if (dialog.open) return;
    dialog.returnValue = '';
    dialog.showModal();
  };
  const onClose = () => {
    if (dialog.returnValue === HOME_CONFIRM_VALUE) leave();
  };
  // A press on the dimmed page around the card is a « no ».
  const onBackdrop = (event) => {
    if (event.target === dialog) dialog.close('cancel');
  };

  link.addEventListener('click', onClick);
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('click', onBackdrop);
  return {
    link,
    dialog,
    destroy: () => {
      link.removeEventListener('click', onClick);
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('click', onBackdrop);
      delete link.dataset.homeLinkReady;
    },
  };
}
