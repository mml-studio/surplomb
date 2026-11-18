/**
 * The visitor's answer to the measurement banner: may Surplomb record the
 * visit in detail (clicks, scrolling, a replay of the screen), or only count
 * it without a cookie?
 *
 * One key in this browser, shared by every page of the origin: the globe, the
 * fiche, the privacy page, and the private previews and invite-only map served
 * beside them (`/apercu/…`, `/permis/…`, which read the same key). Its value is
 * `{"choice":"granted"|"denied","at":"<ISO date>"}`.
 *
 * An answer lasts six months, the length the CNIL recommends for keeping a
 * choice before asking again; after that the banner comes back. Storing the
 * answer itself needs no consent: it is what makes refusing possible.
 *
 * Not to be confused with src/firstRunOptOut.js, the refusal of ALL
 * measurement (the button on /confidentialite, Global Privacy Control): a
 * browser that refused that never sees the banner and sends nothing.
 *
 * @module analyticsConsent
 */

export const ANALYTICS_CONSENT_KEY = 'gev:analytics-consent:v1';

/** Six months, after which the banner asks again. */
export const ANALYTICS_CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

/** Resolve localStorage inside a try: Safari's private-mode getter throws. */
function resolveStore(injected) {
  if (injected !== undefined) return injected;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored answer, if it is still fresh.
 * @param {{storage?: Storage|null, now?: number}} [options]
 * @returns {'granted'|'denied'|null}
 */
export function readAnalyticsConsent({ storage, now = Date.now() } = {}) {
  let value;
  try {
    value = JSON.parse(resolveStore(storage)?.getItem?.(ANALYTICS_CONSENT_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!value || (value.choice !== 'granted' && value.choice !== 'denied')) return null;
  const at = Date.parse(value.at);
  if (!Number.isFinite(at) || now - at >= ANALYTICS_CONSENT_MAX_AGE_MS || at - now > 60_000) return null;
  return value.choice;
}

/**
 * Store the answer.
 * @param {'granted'|'denied'} choice
 * @param {{storage?: Storage|null, now?: number}} [options]
 * @returns {boolean} true only if the browser kept it.
 */
export function writeAnalyticsConsent(choice, { storage, now = Date.now() } = {}) {
  if (choice !== 'granted' && choice !== 'denied') return false;
  try {
    const store = resolveStore(storage);
    if (!store) return false;
    store.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, at: new Date(now).toISOString() }));
    return true;
  } catch {
    return false;
  }
}

/** What PostHog writes once a visitor accepts: `ph_<token>_posthog`, `__ph_opt_in_out_<token>`, … */
const POSTHOG_KEY = /^(__)?ph_/;

/**
 * Withdraw consent from a page that does not run PostHog (the privacy page):
 * store the refusal and erase what PostHog wrote in this browser, so the next
 * page starts counted without a cookie again.
 * @param {{storage?: Storage|null, doc?: Document|null, now?: number}} [options]
 * @returns {boolean} Whether the refusal was stored.
 */
export function withdrawAnalyticsConsent({ storage, doc = globalThis.document, now = Date.now() } = {}) {
  const kept = writeAnalyticsConsent('denied', { storage, now });
  try {
    const store = resolveStore(storage);
    for (let i = (store?.length ?? 0) - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && POSTHOG_KEY.test(key)) store.removeItem(key);
    }
  } catch {
    // Nothing more this browser lets us erase.
  }
  try {
    const host = doc?.location?.hostname ?? '';
    const domains = ['', host, host && `.${host.split('.').slice(-2).join('.')}`].filter((d, i, all) => all.indexOf(d) === i);
    for (const part of String(doc?.cookie ?? '').split(';')) {
      const name = part.split('=')[0].trim();
      if (!POSTHOG_KEY.test(name)) continue;
      for (const domain of domains) {
        doc.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
      }
    }
  } catch {
    // Same.
  }
  return kept;
}
