// Entry for /confidentialite: wires the « Ne pas être mesuré » button, which
// exists only while something is measured — the first-run A/B test or the
// audience measurement (`measure` in src/legalNotice.js) — and the consent
// button of the detailed analysis (`audience`, src/analyticsConsentPage.js).
import { wireFirstRunOptOut } from './firstRunOptOut.js';
import { wireAnalyticsConsent } from './analyticsConsentPage.js';

wireFirstRunOptOut(document);
wireAnalyticsConsent(document);
