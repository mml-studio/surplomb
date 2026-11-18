/**
 * Audience measurement: how many visits the site gets and which pages they
 * read — and, for a visitor who accepts the banner, what they do there.
 * PostHog, EU Cloud.
 *
 * OFF UNLESS THE BUILD CARRIES A PROJECT TOKEN. `POSTHOG_PROJECT_TOKEN` is
 * inlined at build time (the `define` block in vite.config.js), like the
 * ArcGIS key: a clone, a QA run and a self-hosted copy have none and send
 * nothing. The same variable, read at request time, is what makes
 * `/confidentialite` describe this measurement (`audience` in
 * src/legalNotice.js), so a deployment that sets it in one `.env` gets both.
 *
 * TWO LEVELS, chosen by the visitor (src/consentBanner.js asks,
 * src/analyticsConsent.js keeps the answer six months):
 *
 *   - NO ANSWER YET, OR « REFUSER »: the measurement exempt from consent
 *     (article 82 of the French data protection act, CNIL audience-measurement
 *     guidelines). Nothing is written in the browser (`cookieless_mode:
 *     'on_reject'`, opted out by default: PostHog counts a visitor from a hash
 *     of the day, the IP address, the user agent and the host, salted with a
 *     secret it renews every day — the project's « Cookieless server hash
 *     mode » must be on, or PostHog discards every event). Page views and page
 *     leaves only: `before_send` drops everything else, and cleans the URL —
 *     no `#` (the camera, src/shareLink.js), no query parameter but `utm_*`
 *     (`?q=` is the address the visitor typed), no page title (`fiche.html`
 *     writes the address into it).
 *   - « ACCEPTER »: clicks (autocapture, rage and dead clicks), heatmaps, a
 *     replay of the visit with every input masked, the named actions of
 *     src/analyticsEvents.js, whole URLs; a random id kept in a first-party
 *     cookie and localStorage (`ph_…`). The recorder and the dead-click
 *     extension are bundled chunks fetched only then: the `no-external` build
 *     never loads a script from PostHog.
 *
 * The refusal of ALL measurement (the « Ne pas être mesuré » button on
 * /confidentialite, the Global Privacy Control signal, src/firstRunOptOut.js)
 * still wins: such a browser never sees the banner nor downloads the SDK.
 *
 * The previews and the invite-only map served beside the site (`/apercu/…`,
 * `/permis/…`, not in this repository) run the same two levels from their own
 * script and read the same consent key.
 *
 * WHY THE `no-external` BUILD, NOT THE SLIM ONE. The slim build (53 KB
 * gzipped) has no autocapture and no heatmaps; `module.no-external.js` (111 KB)
 * has both and still loads nothing from PostHog's CDN. It leaves out the
 * history watcher we need — the showcase hands over to the globe by rewriting
 * `/` into `/globe` in place (src/vitrine/vitrine.js, `rewriteAddress`) — so
 * `watchPathname()` below does that job. The version is pinned in
 * package.json: what this SDK sends is described word for word on a legal page.
 *
 * @module audienceMeasure
 */

import { firstRunMeasureRefused } from './firstRunOptOut.js';
import { readAnalyticsConsent, writeAnalyticsConsent } from './analyticsConsent.js';
import { setTrackSink } from './analyticsEvents.js';
import { showConsentBanner } from './consentBanner.js';

/** PostHog EU Cloud (Frankfurt). Not configurable: /confidentialite names it. */
export const POSTHOG_API_HOST = 'https://eu.i.posthog.com';

/** Where PostHog's own links point (the toolbar, a replay). */
export const POSTHOG_UI_HOST = 'https://eu.posthog.com';

/** What a visitor counted without a cookie may send. */
export const ANONYMOUS_EVENTS = Object.freeze(['$pageview', '$pageleave']);

/** The event that records the « Accepter » click itself. */
export const CONSENT_EVENT = 'analytics_consent_granted';

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
 * PostHog's `before_send` for this visit. Until the visitor accepts: page
 * views and page leaves only, cleaned by `cleanMeasuredEvent`. Once they
 * accept: everything, untouched — the typed address and the camera are what
 * the replay is for.
 * @param {() => boolean} isGranted read on every event, so « Accepter » takes effect at once
 * @returns {(event: object|null) => object|null}
 */
export function makeBeforeSend(isGranted) {
  return (event) => {
    if (!event) return event;
    if (isGranted()) return event;
    if (!ANONYMOUS_EVENTS.includes(event.event)) return null;
    return cleanMeasuredEvent(event);
  };
}

/** Switches the detailed measurement turns on; also applied in place on « Accepter ». */
export const DETAILED_SETTINGS = Object.freeze({
  persistence: 'localStorage+cookie',
  autocapture: true,
  rageclick: true,
  capture_dead_clicks: true,
  capture_heatmaps: true,
  enable_heatmaps: true,
  disable_session_recording: false,
  disable_capture_url_hashes: false,
});

/** The same switches for a visitor counted without a cookie. */
export const ANONYMOUS_SETTINGS = Object.freeze({
  persistence: 'memory',
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  enable_heatmaps: false,
  disable_session_recording: true,
  disable_capture_url_hashes: true,
});

/**
 * The SDK configuration. Every switch is spelled out rather than left to a
 * default, because the project's own settings turn some of them on remotely
 * (session replay, heatmaps and web vitals are on in the PostHog project), and
 * a default that moves in a later SDK must not move what the page promises.
 * @param {{granted?: boolean, beforeSend?: Function}} [options]
 * @returns {object}
 */
export function posthogConfig({ granted = false, beforeSend = makeBeforeSend(() => granted) } = {}) {
  return {
    api_host: POSTHOG_API_HOST,
    ui_host: POSTHOG_UI_HOST,
    cookieless_mode: 'on_reject',
    opt_out_capturing_by_default: !granted,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    ...(granted ? DETAILED_SETTINGS : ANONYMOUS_SETTINGS),
    session_recording: { maskAllInputs: true },
    capture_performance: false,
    capture_exceptions: false,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    // Flags stay off, but the remote configuration still loads: the replay
    // starts only once it says recording is on for the project.
    advanced_disable_feature_flags: true,
    disable_external_dependency_loading: true,
    mask_personal_data_properties: true,
    before_send: beforeSend,
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

/** The SDK, fetched on its own chunk only when a visit is measured. */
const loadPosthog = () => import('posthog-js/dist/module.no-external.js')
  .then((module) => module.default ?? module.posthog);

/**
 * The replay recorder and the dead-click detector, bundled (the `no-external`
 * SDK will not fetch them from PostHog) and downloaded only for a visitor who
 * accepted. Each registers itself on `window.__PosthogExtensions__`.
 */
const loadDetailedExtensions = () => Promise.all([
  import('posthog-js/dist/posthog-recorder.js'),
  import('posthog-js/dist/dead-clicks-autocapture.js'),
]);

/** Run `fn` once the page has painted and the main thread is free. */
function whenIdle(fn, win = globalThis.window) {
  if (typeof win?.requestIdleCallback === 'function') win.requestIdleCallback(fn, { timeout: 1500 });
  else globalThis.setTimeout(fn, 1);
}

/**
 * Start measuring this visit, unless the build has no token or the browser
 * refused all measurement; ask the banner's question if it has no answer yet.
 * @param {{
 *   token?: string,
 *   refused?: boolean,
 *   consent?: 'granted'|'denied'|null,
 *   load?: () => Promise<object>,
 *   loadExtensions?: () => Promise<unknown>,
 *   schedule?: (fn: Function) => void,
 *   askConsent?: (handlers: {onAccept: Function, onRefuse: Function}) => unknown,
 *   storeConsent?: (choice: 'granted'|'denied') => boolean,
 *   win?: Window,
 * }} [options]
 * @returns {Promise<boolean>} Whether PostHog was started.
 */
export function startAudienceMeasure({
  token = audienceTokenFromBuild(),
  refused = firstRunMeasureRefused(),
  consent = readAnalyticsConsent(),
  load = loadPosthog,
  loadExtensions = loadDetailedExtensions,
  schedule = whenIdle,
  askConsent = showConsentBanner,
  storeConsent = writeAnalyticsConsent,
  win = globalThis.window,
} = {}) {
  if (!token || refused) return Promise.resolve(false);
  let granted = consent === 'granted';
  let acceptedNow = false;
  let posthog = null;

  const goDetailed = (ph, fresh) => {
    if (fresh) ph.set_config?.({ ...DETAILED_SETTINGS });
    ph.opt_in_capturing?.({ captureEventName: fresh ? CONSENT_EVENT : false });
    ph.startSessionRecording?.();
  };

  if (consent === null) {
    try {
      askConsent({
        onAccept: () => {
          storeConsent('granted');
          granted = true;
          acceptedNow = true;
          // Before the SDK arrives, the start below picks the answer up.
          if (posthog) loadExtensions().catch(() => {}).then(() => goDetailed(posthog, true));
        },
        onRefuse: () => {
          storeConsent('denied');
        },
      });
    } catch {
      // No banner, no detailed measurement: the anonymous count goes on.
    }
  }

  return new Promise((resolve) => {
    schedule(() => {
      const ready = granted
        ? Promise.all([load(), loadExtensions().catch(() => null)]).then(([ph]) => ph)
        : load();
      ready
        .then((ph) => {
          ph.init(token, posthogConfig({ granted, beforeSend: makeBeforeSend(() => granted) }));
          posthog = ph;
          if (granted) goDetailed(ph, acceptedNow);
          setTrackSink((event, properties) => ph.capture(event, properties));
          watchPathname(() => ph.capture('$pageview'), win);
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
