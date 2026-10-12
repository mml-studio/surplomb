/**
 * Audience measurement: how many visits the site gets, and which pages they
 * read. PostHog, EU Cloud, without a cookie.
 *
 * OFF UNLESS THE BUILD CARRIES A PROJECT TOKEN. `POSTHOG_PROJECT_TOKEN` is
 * inlined at build time (the `define` block in vite.config.js), like the
 * ArcGIS key: a clone, a QA run and a self-hosted copy have none and send
 * nothing. The same variable, read at request time, is what makes
 * `/confidentialite` describe this measurement (`audience` in
 * src/legalNotice.js), so a deployment that sets it in one `.env` gets both.
 *
 * WHAT KEEPS IT EXEMPT FROM CONSENT (article 82 of the French data protection
 * act, CNIL audience-measurement guidelines), and must not be loosened without
 * a consent banner:
 *
 *   - `cookieless_mode: 'always'`: nothing is written in the browser — no
 *     cookie, no localStorage, no sessionStorage. PostHog counts a visitor
 *     from a hash of the day, the IP address, the user agent and the host,
 *     salted with a secret it renews every day, then drops the IP and the
 *     user agent. The project's « Cookieless server hash mode » must be on,
 *     or PostHog discards every event;
 *   - page views and page leaves only: no autocapture, no heatmaps, no dead
 *     clicks, no web vitals, no session replay, no surveys, no feature flags,
 *     no script loaded from PostHog (the `no-external` build cannot);
 *   - the URL loses its `#` (the camera, src/shareLink.js) and every query
 *     parameter but `utm_*` (`?q=` is the address the visitor typed), and the
 *     page title goes (`fiche.html` writes the address into it);
 *   - the refusal already offered for the first-run test covers this too:
 *     the « Ne pas être mesuré » button on /confidentialite and the Global
 *     Privacy Control signal (src/firstRunOptOut.js). A refused browser never
 *     downloads the SDK.
 *
 * WHY THE SLIM BUILD. `dist/module.slim.no-external.js` is 53 KB gzipped
 * against 111 KB for the default one: it leaves out every extension, the
 * history watcher included. That watcher is the one we need — the showcase
 * hands over to the globe by rewriting `/` into `/globe` in place
 * (src/vitrine/vitrine.js, `rewriteAddress`) — so `watchPathname()` below does
 * its job in twenty lines. The version is pinned in package.json: what this
 * SDK sends is described word for word on a legal page.
 *
 * @module audienceMeasure
 */

import { firstRunMeasureRefused } from './firstRunOptOut.js';

/** PostHog EU Cloud (Frankfurt). Not configurable: /confidentialite names it. */
export const POSTHOG_API_HOST = 'https://eu.i.posthog.com';

/** Query parameters that survive into the URL PostHog receives. */
const KEPT_PARAMS = /^utm_(source|medium|campaign|content|term)$/;

/** Event and person properties that hold a URL. */
const URL_PROPERTY = /(url|referrer)$/i;

/** Properties dropped outright: the page title can carry a typed address. */
const DROPPED_PROPERTIES = ['title'];

/**
 * The project token inlined by the build, or '' under `node --test` and in a
 * build without one.
 * @returns {string}
 */
export function audienceTokenFromBuild() {
  return typeof import.meta.env === 'undefined'
    ? ''
    : String(import.meta.env.POSTHOG_PROJECT_TOKEN || '').trim();
}

/** What posthog-js writes as the referrer of a visit that has none. */
const DIRECT = '$direct';

/**
 * A URL as PostHog may see it: no fragment, no query but `utm_*`.
 * @param {unknown} value
 * @returns {unknown} the cleaned URL, `null` for one that does not parse, and
 *   `$direct` or anything that is not a non-empty string unchanged.
 */
export function cleanMeasuredUrl(value) {
  if (typeof value !== 'string' || !value || value === DIRECT) return value;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [key, val] of url.searchParams) {
    if (KEPT_PARAMS.test(key)) kept.append(key, val);
  }
  url.search = kept.toString();
  url.hash = '';
  return url.toString();
}

/** @param {Record<string, unknown>|undefined} bag */
function cleanBag(bag) {
  if (!bag || typeof bag !== 'object') return;
  for (const key of Object.keys(bag)) {
    if (DROPPED_PROPERTIES.includes(key)) delete bag[key];
    else if (URL_PROPERTY.test(key)) bag[key] = cleanMeasuredUrl(bag[key]);
  }
}

/**
 * PostHog's `before_send`: the last look at every event before it leaves.
 * @param {{properties?: object, $set?: object, $set_once?: object}|null} event
 * @returns {object|null}
 */
export function cleanMeasuredEvent(event) {
  if (!event) return event;
  cleanBag(event.properties);
  cleanBag(event.$set);
  cleanBag(event.$set_once);
  return event;
}

/**
 * The SDK configuration. Every switch is spelled out rather than left to a
 * default, because the project's own settings turn some of them on remotely
 * (session replay, heatmaps and web vitals are on in the PostHog project), and
 * a default that moves in a later SDK must not move what the page promises.
 * @returns {object}
 */
export function posthogConfig() {
  return {
    api_host: POSTHOG_API_HOST,
    cookieless_mode: 'always',
    persistence: 'memory',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    enable_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    before_send: cleanMeasuredEvent,
  };
}

/**
 * Call `onChange(pathname)` whenever the address's path changes in place.
 * Hash and query rewrites (the camera, a fiche's `?q=`) are not page changes.
 * @param {(pathname: string) => void} onChange
 * @param {Window} [win]
 * @returns {boolean} Whether a history was found to watch.
 */
export function watchPathname(onChange, win = globalThis.window) {
  const history = win?.history;
  if (!history || !win.location) return false;
  let last = win.location.pathname;
  const check = () => {
    const now = win.location.pathname;
    if (now === last) return;
    last = now;
    try {
      onChange(now);
    } catch {
      // Measurement must never affect the page.
    }
  };
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    if (typeof original !== 'function') continue;
    history[name] = function patched(...args) {
      const result = original.apply(this, args);
      check();
      return result;
    };
  }
  win.addEventListener?.('popstate', check);
  return true;
}

/** The slim SDK, fetched on its own chunk only when a visit is measured. */
const loadPosthog = () => import('posthog-js/dist/module.slim.no-external.js')
  .then((module) => module.default ?? module.posthog);

/** Run `fn` once the page has painted and the main thread is free. */
function whenIdle(fn, win = globalThis.window) {
  if (typeof win?.requestIdleCallback === 'function') win.requestIdleCallback(fn, { timeout: 1500 });
  else globalThis.setTimeout(fn, 1);
}

/**
 * Start measuring this visit, unless the build has no token or the browser
 * refused.
 * @param {{
 *   token?: string,
 *   refused?: boolean,
 *   load?: () => Promise<{init: Function, capture: Function}>,
 *   schedule?: (fn: Function) => void,
 *   win?: Window,
 * }} [options]
 * @returns {Promise<boolean>} Whether PostHog was started.
 */
export function startAudienceMeasure({
  token = audienceTokenFromBuild(),
  refused = firstRunMeasureRefused(),
  load = loadPosthog,
  schedule = whenIdle,
  win = globalThis.window,
} = {}) {
  if (!token || refused) return Promise.resolve(false);
  return new Promise((resolve) => {
    schedule(() => {
      load()
        .then((posthog) => {
          posthog.init(token, posthogConfig());
          watchPathname(() => posthog.capture('$pageview'), win);
          resolve(true);
        })
        .catch((error) => {
          // An ad blocker refusing the chunk, or the network: no measurement,
          // and the page goes on.
          console.warn('[audience] PostHog could not start:', error?.message || error);
          resolve(false);
        });
    });
  });
}
