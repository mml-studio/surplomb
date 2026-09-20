/**
 * The two legal links, at the end of the globe's credit line.
 *
 * The credit line is the only footer the globe has: bottom-left on a desktop,
 * the last row of the sheet on a phone (`phoneSheet.js` moves the whole
 * `#cesium-credits` there), and visible in clean view and recording mode
 * because Google's terms require it. A link placed anywhere else would vanish
 * in exactly the modes a visitor records.
 *
 * Appended to the element Cesium actually lays out — `.cesium-widget-credits`,
 * which the widget creates INSIDE `#cesium-credits` and positions absolutely.
 * A sibling of it starts at the container's corner, over the Cesium logo
 * (measured 2026-09-17). Inside it, the span goes AFTER Cesium's own children,
 * never inside them: `CreditDisplay` rewrites its text container on every
 * frame and would drop anything foreign. `style.css` puts it on its own
 * line, under the attribution.
 *
 * `target="_blank"` because leaving the globe loses the camera and every
 * layer that is not in the share-link yet.
 *
 * The LABELS are translated and the PAGES are not: the two legal pages are
 * French and the French text governs (CONTRIBUTING.md, "Language"), so an
 * English reader gets *Legal notice* and *Privacy* on links that open the
 * same French documents.
 */

import messages from './legalLinks.i18n.js';

/**
 * The two links, in order. `label` is a GETTER: the row is built when this
 * module loads and read when the credit line is written, so the words follow
 * the page's language rather than the import (ratchet R5).
 */
export const LEGAL_LINKS = Object.freeze([
  Object.freeze({ href: '/mentions-legales', get label() { return messages().notice; } }),
  Object.freeze({ href: '/confidentialite', get label() { return messages().privacy; } }),
]);

export const LEGAL_LINKS_CLASS = 'gev-legal-links';

/** The box `CesiumWidget` creates inside the credit container, and lays out. */
export const CESIUM_CREDITS_CLASS = 'cesium-widget-credits';

/** The markup, as one string so it can be asserted without a DOM. */
export function legalLinksMarkup() {
  return LEGAL_LINKS
    .map(({ href, label }) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`)
    .join(' • ');
}

/**
 * @param {HTMLElement|null|undefined} container - `#cesium-credits`.
 * @returns {HTMLElement|null} The links' element, or null without a container.
 */
export function installLegalLinks(container) {
  if (!container) return null;
  const existing = container.querySelector(`.${LEGAL_LINKS_CLASS}`);
  if (existing) return existing;
  const host = container.querySelector(`.${CESIUM_CREDITS_CLASS}`) || container;
  const span = container.ownerDocument.createElement('span');
  span.className = LEGAL_LINKS_CLASS;
  span.innerHTML = legalLinksMarkup();
  host.appendChild(span);
  return span;
}
