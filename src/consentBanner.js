/**
 * The measurement banner: one sentence about cookies, a link to the privacy
 * page (where the purposes are spelled out), two
 * buttons of the same size and weight (the CNIL wants refusing to be as easy
 * as accepting). No cross, no « continue without accepting »: closing it is
 * answering it.
 *
 * It only asks. What each answer does is src/audienceMeasure.js's business;
 * where the answer is kept, src/analyticsConsent.js's.
 *
 * Styles live here rather than in a stylesheet because the banner shows on
 * three pages with three stylesheets (the showcase, the globe, the fiche).
 *
 * @module consentBanner
 */

import messages from './consentBanner.i18n.js';

export const CONSENT_BANNER_CLASS = 'gev-consent';

const STYLE_ID = 'gev-consent-style';
/*
 * The site's own grammar (landing.css): ivory, green, DM Sans, square panels,
 * hairlines instead of shadows. A strip along the bottom edge, like a footer,
 * rather than a floating card: it covers the least, and never the search form.
 */
const CSS = /* i18n-ignore-line — CSS, not prose */ `
.${CONSENT_BANNER_CLASS}{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;box-sizing:border-box;
  background:#F7F4EA;color:#24473C;border-top:1px solid rgba(36,71,60,.2);
  font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.4;
  padding:10px max(24px,env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));
  animation:gev-consent-in .36s cubic-bezier(.16,1,.3,1) both}
.${CONSENT_BANNER_CLASS} .gev-consent-inner{display:flex;align-items:center;gap:24px;max-width:1360px;margin:0 auto}
.${CONSENT_BANNER_CLASS} p{margin:0;flex:1;min-width:0}
.${CONSENT_BANNER_CLASS} a{color:inherit;margin-left:6px;white-space:nowrap;text-decoration:underline;
  text-decoration-color:rgba(36,71,60,.45);text-underline-offset:3px}
.${CONSENT_BANNER_CLASS} .gev-consent-row{display:flex;gap:8px;flex:none}
.${CONSENT_BANNER_CLASS} button{font:inherit;font-weight:600;min-width:112px;height:36px;padding:0 18px;margin:0;
  border:1px solid #24473C;border-radius:0;background:transparent;color:#24473C;cursor:pointer;
  transition:background-color .15s,color .15s}
.${CONSENT_BANNER_CLASS} button:hover{background:#24473C;color:#F7F4EA}
.${CONSENT_BANNER_CLASS} button:focus-visible{outline:2px solid #F7AB7C;outline-offset:2px}
/* The globe (no showcase, the cockpit's dark glass, style.css --glass-bg): the same strip, inverted. */
html:not([data-vitrine]) body:has(#cesiumContainer) .${CONSENT_BANNER_CLASS}{background:rgba(16,31,26,.94);color:#F7F4EA;
  border-top-color:rgba(247,244,234,.14);-webkit-backdrop-filter:blur(24px) saturate(1.4);backdrop-filter:blur(24px) saturate(1.4)}
html:not([data-vitrine]) body:has(#cesiumContainer) .${CONSENT_BANNER_CLASS} a{text-decoration-color:rgba(247,244,234,.45)}
html:not([data-vitrine]) body:has(#cesiumContainer) .${CONSENT_BANNER_CLASS} button{border-color:rgba(247,244,234,.55);color:#F7F4EA}
html:not([data-vitrine]) body:has(#cesiumContainer) .${CONSENT_BANNER_CLASS} button:hover{background:#F7F4EA;color:#24473C}
@keyframes gev-consent-in{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.${CONSENT_BANNER_CLASS}{animation:none}}
@media (max-width:760px){
  .${CONSENT_BANNER_CLASS}{padding:14px 18px calc(14px + env(safe-area-inset-bottom))}
  .${CONSENT_BANNER_CLASS} .gev-consent-inner{flex-direction:column;align-items:stretch;gap:12px}
  .${CONSENT_BANNER_CLASS} .gev-consent-row button{flex:1;height:44px}
}
`;

/**
 * Show the banner, once per page.
 * @param {{
 *   onAccept: () => void,
 *   onRefuse: () => void,
 *   doc?: Document,
 *   privacyHref?: string,
 * }} options
 * @returns {HTMLElement|null} The banner, or null when there is no document or one is already shown.
 */
export function showConsentBanner({ onAccept, onRefuse, doc = globalThis.document, privacyHref = '/confidentialite' }) {
  if (!doc?.body || doc.querySelector?.(`.${CONSENT_BANNER_CLASS}`)) return null;
  if (!doc.getElementById?.(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head?.appendChild(style);
  }
  const m = messages();
  const banner = doc.createElement('div');
  // `ph-no-capture`: the answer itself is not a click PostHog records.
  banner.className = `${CONSENT_BANNER_CLASS} ph-no-capture`;
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', m.label);

  const inner = doc.createElement('div');
  inner.className = 'gev-consent-inner';
  const text = doc.createElement('p');
  text.append(m.text);
  const more = doc.createElement('a');
  more.href = privacyHref;
  more.textContent = m.more;
  text.append(more);

  const row = doc.createElement('div');
  row.className = 'gev-consent-row';
  const button = (label, choice) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.consent = choice;
    return b;
  };
  row.append(button(m.refuse, 'refuse'), button(m.accept, 'accept'));
  inner.append(text, row);
  banner.append(inner);

  banner.addEventListener('click', (event) => {
    const choice = event.target?.closest?.('[data-consent]')?.dataset?.consent;
    if (!choice) return;
    banner.remove();
    try {
      if (choice === 'accept') onAccept();
      else onRefuse();
    } catch {
      // The answer is stored by the callers; a failure there must not keep the banner up.
    }
  });
  doc.body.appendChild(banner);
  return banner;
}
