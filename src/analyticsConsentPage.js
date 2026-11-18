/**
 * The consent button on /confidentialite: says whether this browser accepted
 * the detailed analysis (src/consentBanner.js), and lets the visitor change
 * their mind in one click, as easily as they answered.
 *
 * Withdrawing also erases what PostHog wrote here (src/analyticsConsent.js),
 * since this page does not run PostHog. A browser that refused all
 * measurement (the other button, Global Privacy Control) is not measured at
 * all: the button hides.
 *
 * @module analyticsConsentPage
 */

import messages from './analyticsConsentPage.i18n.js';
import { readAnalyticsConsent, withdrawAnalyticsConsent, writeAnalyticsConsent } from './analyticsConsent.js';
import { firstRunMeasureRefused } from './firstRunOptOut.js';

/**
 * @param {Document} [doc]
 * @param {{storage?: Storage|null, nav?: object|null}} [options]
 * @returns {boolean} Whether a button was found and wired.
 */
export function wireAnalyticsConsent(doc = globalThis.document, { storage, nav = globalThis.navigator } = {}) {
  const button = doc?.querySelector?.('[data-analytics-consent]');
  const status = doc?.querySelector?.('[data-analytics-consent-status]');
  if (!button) return false;
  const paint = (note = '') => {
    const m = messages();
    const off = firstRunMeasureRefused({ storage, nav });
    const granted = readAnalyticsConsent({ storage }) === 'granted';
    button.hidden = off;
    button.textContent = granted ? m.withdraw : m.grant;
    button.setAttribute('aria-pressed', String(granted));
    if (status) status.textContent = note || (off ? m.notMeasured : granted ? m.granted : m.notGranted);
  };
  button.addEventListener('click', () => {
    const granted = readAnalyticsConsent({ storage }) === 'granted';
    const kept = granted ? withdrawAnalyticsConsent({ storage, doc }) : writeAnalyticsConsent('granted', { storage });
    paint(kept ? '' : messages().notStored);
  });
  // The other button (« Ne pas être mesuré ») changes what this one may offer.
  doc.querySelector?.('[data-first-run-optout]')?.addEventListener('click', () => paint());
  paint();
  return true;
}
