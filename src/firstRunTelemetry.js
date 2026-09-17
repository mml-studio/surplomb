// What the first-run A/B test sends home, and when.
//
// The card (src/firstRunExperience.js) hands `record()` its contract events;
// `attachFirstRunMilestones()` adds three facts about what happened AFTER the
// card closed — a layer the visitor switched on themselves, a search, the
// waitlist opened. Everything is reduced here to the schema the server
// rebuilds (`sanitizeFirstRunReport`, src/firstRunAb.js): the typed text becomes
// a length bucket, the layer ids an exclusion list that is never sent.
//
// AT MOST TWO REQUESTS A VISIT. The edge in front of the hosted origin counts
// `/api` calls per address, so nothing is sent per event:
//
//   seq 1  the first action or close, plus whatever happens in the same tick
//          (a found address is an action and a close at once);
//   seq 2  when the page is hidden or left: the WHOLE story again, cumulative,
//          with the time spent — the report keeps the highest seq per visit.
//
// A returning visitor, who no longer sees the card, sends one seq 2 with no
// events and `returnVisit: true`: that is what makes "did they come back"
// countable without showing anything.
//
// Transport is the voice debug log's (sendBeacon, then `fetch` keepalive); a
// lost beacon is lost, and the report prints how many visits have a seq 2.

import {
  FIRST_RUN_EXPERIMENT_ID,
  FIRST_RUN_MAX_EVENTS,
  FIRST_RUN_REPORT_VERSION,
  newVisitorId,
} from './firstRunAb.js';
import { WAITLIST_OPEN_EVENT } from './trialRefusal.js';

export const FIRST_RUN_EVENTS_URL = '/api/first-run/events';
const DAY_MS = 24 * 60 * 60 * 1000;
const BOOT_MS_MAX = 600_000;

/**
 * The typed text, as the only thing the report may know about it.
 * @param {unknown} length
 * @returns {'0'|'1-3'|'4-10'|'11-30'|'31+'}
 */
export function bucketQueryLength(length) {
  const n = Number(length);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n <= 3) return '1-3';
  if (n <= 10) return '4-10';
  if (n <= 30) return '11-30';
  return '31+';
}

/**
 * The screen, as a family: the smaller side, in CSS pixels.
 * @param {unknown} minPx
 * @returns {'xs'|'s'|'m'|'l'|'xl'}
 */
export function bucketViewport(minPx) {
  const n = Number(minPx);
  if (!Number.isFinite(n) || n < 400) return 'xs';
  if (n < 600) return 's';
  if (n < 800) return 'm';
  if (n < 1080) return 'l';
  return 'xl';
}

/**
 * Fire one report and forget it.
 * @param {object} payload
 * @param {{url?: string, nav?: Navigator|object|null, fetchImpl?: typeof fetch|null}} [options]
 * @returns {boolean} Whether a transport accepted it.
 */
export function sendFirstRunReport(payload, {
  url = FIRST_RUN_EVENTS_URL,
  nav = globalThis.navigator,
  fetchImpl = globalThis.fetch ? (...args) => globalThis.fetch(...args) : null,
} = {}) {
  try {
    const body = JSON.stringify(payload);
    if (typeof nav?.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (nav.sendBeacon(url, blob)) return true;
    }
    if (typeof fetchImpl !== 'function') return false;
    fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length < 60000,
      credentials: 'omit',
    })?.catch?.(() => {});
    return true;
  } catch {
    // Measurement must never affect the page.
    return false;
  }
}

/**
 * @param {object} input
 * @param {boolean} input.enabled `assignFirstRunVariant().telemetry`.
 * @param {string} input.variant
 * @param {boolean} [input.forced]
 * @param {boolean} [input.newVisitor]
 * @param {string|null} input.visitorId
 * @param {boolean} [input.returnVisit]
 * @param {'phone'|'desktop'} [input.shell]
 * @param {'coarse'|'fine'} [input.input]
 * @param {string} [input.viewport] A `bucketViewport` value.
 * @param {boolean} [input.reducedMotion]
 * @param {number} [input.bootMs]
 * @param {() => number} [input.now]
 * @param {() => number} [input.random]
 * @param {Function} [input.setTimer]
 * @param {(payload: object) => boolean} [input.send]
 */
export function createFirstRunTelemetry({
  enabled = false,
  variant,
  forced = false,
  newVisitor = false,
  visitorId = null,
  returnVisit = false,
  shell = 'desktop',
  input = 'fine',
  viewport = 'l',
  reducedMotion = false,
  bootMs = 0,
  now = () => Date.now(),
  random = Math.random,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  send = (payload) => sendFirstRunReport(payload),
} = {}) {
  const active = Boolean(enabled && variant && visitorId);
  const sessionId = newVisitorId(random);
  const startedAt = now();
  const events = [];
  const sent = [];
  const cardLayerIds = new Set();
  const milestones = new Set();
  let impressionAt = null;
  let closed = false;
  let terminalScheduled = false;
  let terminalSent = false;
  let hideSent = false;

  const since = () => Math.min(DAY_MS, Math.max(0, Math.round(now() - impressionAt)));
  const push = (event) => {
    if (events.length < FIRST_RUN_MAX_EVENTS) events.push(event);
  };

  const payload = (seq) => ({
    v: FIRST_RUN_REPORT_VERSION,
    exp: FIRST_RUN_EXPERIMENT_ID,
    variant,
    forced: Boolean(forced),
    visitorId,
    sessionId,
    seq,
    newVisitor: Boolean(newVisitor),
    returnVisit: Boolean(returnVisit),
    shell,
    input,
    viewport,
    reducedMotion: Boolean(reducedMotion),
    bootMs: Math.min(BOOT_MS_MAX, Math.max(0, Math.round((Number(bootMs) || 0) / 100) * 100)),
    dwellMs: seq === 2
      ? Math.min(DAY_MS, Math.max(0, Math.round(now() - (impressionAt ?? startedAt))))
      : null,
    events: events.map((event) => ({ ...event })),
  });

  const transmit = (body) => {
    sent.push(body);
    try {
      send(body);
    } catch {
      // A failed send is a lost report, never a broken page.
    }
    return true;
  };

  /**
   * @param {'terminal'|'hide'} reason
   * @returns {boolean} Whether a report went out.
   */
  const flush = (reason) => {
    if (!active) return false;
    if (reason === 'terminal') {
      if (terminalSent || hideSent || impressionAt === null) return false;
      terminalSent = true;
      return transmit(payload(1));
    }
    if (hideSent) return false;
    if (impressionAt === null && !returnVisit) return false;
    hideSent = true;
    return transmit(payload(2));
  };

  const scheduleTerminal = () => {
    if (terminalScheduled) return;
    terminalScheduled = true;
    // Same tick: a found address emits its action and its close together.
    setTimer(() => flush('terminal'), 0);
  };

  /** The card's `onEvent`. */
  const record = (event) => {
    if (!active || returnVisit || !event || typeof event !== 'object') return;
    if (event.type === 'impression') {
      if (impressionAt !== null) return;
      impressionAt = now();
      push({ t: 0, type: 'impression' });
      return;
    }
    if (impressionAt === null) return;
    if (event.type === 'action') {
      for (const layerId of Array.isArray(event.layerIds) ? event.layerIds : []) cardLayerIds.add(String(layerId));
      const entry = { t: since(), type: 'action', kind: String(event.kind), outcome: String(event.outcome) };
      if (event.queryLength !== undefined) entry.qLen = bucketQueryLength(event.queryLength);
      push(entry);
      scheduleTerminal();
    } else if (event.type === 'dismiss') {
      push({ t: since(), type: 'dismiss', via: String(event.via) });
      closed = true;
      scheduleTerminal();
    }
  };

  /**
   * Something the visitor did AFTER the card closed. Once per kind. A layer the
   * card itself switched on is not the visitor's doing, and is not counted.
   * @param {'layer'|'search'|'waitlist'} kind
   * @param {{layerId?: string|null}} [options]
   */
  const milestone = (kind, { layerId = null } = {}) => {
    if (!active || !closed || hideSent) return;
    if (kind === 'layer' && layerId !== null && cardLayerIds.has(String(layerId))) return;
    if (milestones.has(kind)) return;
    milestones.add(kind);
    push({ t: since(), type: 'milestone', kind });
  };

  return {
    record,
    milestone,
    flush,
    /** Every payload handed to the transport, for tests and harnesses. */
    sent: () => sent.map((body) => ({ ...body, events: body.events.map((event) => ({ ...event })) })),
    get active() { return active; },
  };
}

/**
 * Wire the milestones and the hide flush to the page.
 * @param {ReturnType<typeof createFirstRunTelemetry>} telemetry
 * @param {{dataManager?: object, documentRef?: Document, windowRef?: Window}} [deps]
 * @returns {() => void} Detach.
 */
export function attachFirstRunMilestones(telemetry, {
  dataManager = null,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  if (!telemetry?.active) return () => {};
  const undo = [];
  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    undo.push(() => target.removeEventListener(type, handler, options));
  };

  const unsubscribe = dataManager?.subscribeVisibilityRequests?.((change) => {
    if (change?.enabled === true && change.origin === 'user') {
      telemetry.milestone('layer', { layerId: change.layerId });
    }
  });
  if (typeof unsubscribe === 'function') undo.push(unsubscribe);

  // Capture phase: the form's own handler prevents the default and runs the
  // search; this only notes that one was asked for — never what.
  listen(documentRef?.getElementById?.('location-search-form'), 'submit', () => {
    if (!String(documentRef.getElementById('location-search')?.value || '').trim()) return;
    telemetry.milestone('search');
  }, true);
  listen(windowRef, WAITLIST_OPEN_EVENT, () => telemetry.milestone('waitlist'));

  const onHidden = () => {
    if (documentRef?.visibilityState === 'hidden') telemetry.flush('hide');
  };
  listen(documentRef, 'visibilitychange', onHidden);
  listen(windowRef, 'pagehide', () => telemetry.flush('hide'));

  return () => { for (const step of undo.splice(0)) step(); };
}
