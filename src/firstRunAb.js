// The first-run card's A/B/C test: who sees which variant, and what a report
// about it may contain.
//
// ISOMORPHIC. The page draws the variant (`assignFirstRunVariant`), the server
// reads the switch and validates the reports (`firstRunExperimentFromEnv`,
// `sanitizeFirstRunReport`), and `src/legalNotice.js` asks whether the privacy
// page must describe the test. One module, so the three can never disagree.
//
// THE SWITCH IS ONE VARIABLE. `GEV_FIRST_RUN_AB=A,B,C` on the hosted instance;
// absent (or naming fewer than two variants) means no test: every visitor gets
// A, nothing is measured, and a browser that drew a variant while the test ran
// forgets it on its next boot.
//
// WHY THE DRAW IS CLIENT-SIDE. A server cookie would be a tracker under the same
// rules and would make `/` per-visitor, so no longer cacheable. localStorage
// keeps `index.html` static, and removing the variable removes everything.
//
// WHAT A REPORT MAY SAY (CNIL audience-measurement exemption, decided
// 2026-09-17): a random id per browser kept at most thirteen months, which
// card, what was done with it and when, the family of screen. Never the typed
// text (its length, bucketed), never a position, never a layer id, never the
// IP, the user agent, the referrer or the URL. The server REBUILDS every record
// field by field from the lists below and drops anything else.

import {
  FIRST_RUN_VARIANT_IDS,
  clearFirstRunVariantRecord,
  forcedFirstRunVariant,
  readFirstRunVariantRecord,
  writeFirstRunVariantRecord,
} from './firstRunExperience.js';
import { firstRunMeasureRefused } from './firstRunOptOut.js';

export const FIRST_RUN_EXPERIMENT_ID = 'first-run';
export const FIRST_RUN_DEFAULT_VARIANT = 'A';
/** Thirteen months: the CNIL ceiling for an audience-measurement identifier. */
export const FIRST_RUN_ASSIGNMENT_TTL_DAYS = 395;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A draw younger than this is a visitor still in their first visit. */
export const FIRST_RUN_NEW_VISITOR_WINDOW_MS = 30 * 60 * 1000;
/** A draw dated further ahead than this is a clock we do not believe. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
export const FIRST_RUN_REPORT_VERSION = 1;
export const FIRST_RUN_MAX_EVENTS = 64;
const ID_RE = /^[0-9a-z]{16}$/;
const MAX_T_MS = DAY_MS;

/** Top-level fields of a report, in the order the server writes them. */
export const FIRST_RUN_REPORT_FIELDS = Object.freeze([
  'v', 'exp', 'variant', 'forced', 'visitorId', 'sessionId', 'seq', 'newVisitor', 'returnVisit',
  'shell', 'input', 'viewport', 'reducedMotion', 'bootMs', 'dwellMs', 'events',
]);
/** Fields an event may carry. */
export const FIRST_RUN_EVENT_FIELDS = Object.freeze(['t', 'type', 'kind', 'outcome', 'via', 'qLen']);

export const FIRST_RUN_EVENT_TYPES = Object.freeze(['impression', 'action', 'dismiss', 'milestone']);
export const FIRST_RUN_ACTION_KINDS = Object.freeze([
  'address', 'geoloc', 'chip', 'tile:sales', 'tile:permits', 'tile:live', 'tile:explore', 'explore', 'hint-click',
]);
export const FIRST_RUN_MILESTONE_KINDS = Object.freeze(['layer', 'search', 'waitlist']);
/** Every `kind` the server accepts, as one pattern: nothing free-form gets through. */
export const FIRST_RUN_KIND_RE = new RegExp(
  `^(?:${[...FIRST_RUN_ACTION_KINDS, ...FIRST_RUN_MILESTONE_KINDS].map((kind) => kind.replace(/[-:]/g, '\\$&')).join('|')})$`,
);
export const FIRST_RUN_OUTCOMES = Object.freeze(['found', 'not-found', 'cancelled']);
export const FIRST_RUN_DISMISS_VIAS = Object.freeze(['esc', 'choice', 'yield', 'timeout', 'click-away']);
export const FIRST_RUN_QUERY_BUCKETS = Object.freeze(['0', '1-3', '4-10', '11-30', '31+']);
export const FIRST_RUN_VIEWPORT_BUCKETS = Object.freeze(['xs', 's', 'm', 'l', 'xl']);
const SHELLS = Object.freeze(['phone', 'desktop']);
const INPUTS = Object.freeze(['coarse', 'fine']);

/**
 * `'A,B,C'` → `['A', 'B', 'C']`. Case and spaces forgiven, unknown letters and
 * repeats dropped. Fewer than two distinct variants is not a test: `[]`.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseFirstRunVariants(raw) {
  const seen = [];
  for (const part of String(raw ?? '').split(',')) {
    const id = part.trim().toUpperCase();
    if (FIRST_RUN_VARIANT_IDS.includes(id) && !seen.includes(id)) seen.push(id);
  }
  return seen.length >= 2 ? seen : [];
}

/**
 * The one reader of `GEV_FIRST_RUN_AB`. Called per request, never cached: the
 * variable IS the switch, and `.env` reaches `process.env` late.
 * @param {Record<string, string|undefined>} [env]
 * @returns {{variants: string[]}|null}
 */
export function firstRunExperimentFromEnv(env = {}) {
  const variants = parseFirstRunVariants(env?.GEV_FIRST_RUN_AB);
  return variants.length ? { variants } : null;
}

/**
 * Equal thirds (or halves).
 * @param {string[]} variants
 * @param {() => number} [random]
 * @returns {string}
 */
export function pickFirstRunVariant(variants, random = Math.random) {
  const list = Array.isArray(variants) && variants.length ? variants : [FIRST_RUN_DEFAULT_VARIANT];
  const roll = Number(random());
  const index = Number.isFinite(roll) ? Math.floor(Math.min(Math.max(roll, 0), 0.999999) * list.length) : 0;
  return list[index];
}

/**
 * Sixteen base-36 characters. Not a secret, not a fingerprint: a label that
 * lets the report count browsers rather than sessions.
 * @param {() => number} [random]
 * @returns {string}
 */
export function newVisitorId(random = Math.random) {
  let id = '';
  while (id.length < 16) {
    const roll = Number(random());
    const digit = Number.isFinite(roll) ? Math.floor(Math.min(Math.max(roll, 0), 0.999999) * 36) : 0;
    id += digit.toString(36);
  }
  return id;
}

/**
 * The stored draw, if it is still one this test can use.
 * @param {string|null} text
 * @param {{variants: string[], now?: number}} options
 * @returns {{variant: string, assignedAt: number, visitorId: string}|null}
 */
export function readFirstRunAssignment(text, { variants, now = Date.now() } = {}) {
  if (typeof text !== 'string' || !text) return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record || typeof record !== 'object') return null;
  const { variant, assignedAt, visitorId } = record;
  if (!Array.isArray(variants) || !variants.includes(variant)) return null;
  if (!Number.isFinite(assignedAt) || assignedAt > now + FUTURE_SKEW_MS) return null;
  if (now - assignedAt > FIRST_RUN_ASSIGNMENT_TTL_DAYS * DAY_MS) return null;
  if (typeof visitorId !== 'string' || !ID_RE.test(visitorId)) return null;
  return { variant, assignedAt, visitorId };
}

/**
 * Keep a usable draw, or make a new one.
 * @returns {{record: {variant: string, assignedAt: number, visitorId: string}, fresh: boolean}}
 */
export function nextFirstRunAssignment({ stored = null, variants, now = Date.now(), random = Math.random } = {}) {
  const kept = readFirstRunAssignment(stored, { variants, now });
  if (kept) return { record: kept, fresh: false };
  return {
    record: { variant: pickFirstRunVariant(variants, random), assignedAt: now, visitorId: newVisitorId(random) },
    fresh: true,
  };
}

/**
 * @param {{assignedAt: number}|null} record
 * @param {number} [now]
 * @returns {boolean}
 */
export function isNewVisitor(record, now = Date.now()) {
  return Boolean(record) && now - record.assignedAt < FIRST_RUN_NEW_VISITOR_WINDOW_MS;
}

/**
 * Decide which card this page shows and whether it is measured.
 *
 *   1. `?welcome=X` forces X and leaves the stored draw alone; measured (and
 *      flagged `forced`, which the report leaves out) only while the test runs.
 *   2. No test (`experiment` null, as `/api/trial` said), or a visitor who
 *      refused the measurement (the privacy page's button, or the Global
 *      Privacy Control signal — src/firstRunOptOut.js): A, unmeasured, and any
 *      draw left from a test is removed.
 *   2b. NOT KNOWN (`known: false` — `/api/trial` failed, was throttled, or
 *      answered too late): unmeasured, and the stored draw is left alone and
 *      still shown. Treating "no answer" as "no test" would erase the draw and
 *      re-roll this visitor next time, mixing the groups.
 *   3. A draw that cannot be stored: A, unmeasured — it would be re-rolled on
 *      every visit.
 *   4. Otherwise the stored draw, or a new one.
 *
 * @param {object} input
 * @param {{variants: string[]}|null} input.experiment
 * @param {{search?: string}|null} [input.location]
 * @param {Storage|null} [input.storage]
 * @param {() => number} [input.random]
 * @param {number} [input.now]
 * @param {boolean} [input.refused] Defaults to this browser's own answer.
 * @param {boolean} [input.known] False when the switch could not be read.
 * @returns {{variant: string, forced: boolean, telemetry: boolean, newVisitor: boolean, visitorId: string|null}}
 */
export function assignFirstRunVariant({
  experiment = null,
  location = globalThis.location,
  storage,
  random = Math.random,
  now = Date.now(),
  refused = firstRunMeasureRefused({ storage }),
  known = true,
} = {}) {
  const unmeasured = { variant: FIRST_RUN_DEFAULT_VARIANT, forced: false, telemetry: false, newVisitor: false, visitorId: null };
  if (!known && !refused) {
    const forcedUnknown = forcedFirstRunVariant(location);
    if (forcedUnknown) return { ...unmeasured, variant: forcedUnknown, forced: true };
    const kept = readFirstRunAssignment(readFirstRunVariantRecord(storage), { variants: FIRST_RUN_VARIANT_IDS, now });
    return kept ? { ...unmeasured, variant: kept.variant } : unmeasured;
  }
  const variants = experiment?.variants?.length && !refused ? experiment.variants : null;
  const forced = forcedFirstRunVariant(location);
  if (forced) {
    const kept = variants ? readFirstRunAssignment(readFirstRunVariantRecord(storage), { variants, now }) : null;
    return {
      variant: forced,
      forced: true,
      telemetry: Boolean(variants),
      newVisitor: kept ? isNewVisitor(kept, now) : Boolean(variants),
      visitorId: variants ? (kept?.visitorId ?? newVisitorId(random)) : null,
    };
  }
  if (!variants) {
    clearFirstRunVariantRecord(storage);
    return unmeasured;
  }
  const { record, fresh } = nextFirstRunAssignment({
    stored: readFirstRunVariantRecord(storage),
    variants,
    now,
    random,
  });
  if (fresh && !writeFirstRunVariantRecord(JSON.stringify(record), storage)) return unmeasured;
  return {
    variant: record.variant,
    forced: false,
    telemetry: true,
    newVisitor: isNewVisitor(record, now),
    visitorId: record.visitorId,
  };
}

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const oneOf = (list, value) => list.includes(value);

/** Rebuild one event; `null` if any part of it is not in the lists. */
function sanitizeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { t, type, kind, outcome, via, qLen } = input;
  if (!isInt(t, 0, MAX_T_MS) || !oneOf(FIRST_RUN_EVENT_TYPES, type)) return null;
  const event = { t, type };
  if (type === 'action') {
    if (!oneOf(FIRST_RUN_ACTION_KINDS, kind) || !oneOf(FIRST_RUN_OUTCOMES, outcome)) return null;
    event.kind = kind;
    event.outcome = outcome;
    if (qLen !== undefined) {
      if (!oneOf(FIRST_RUN_QUERY_BUCKETS, qLen)) return null;
      event.qLen = qLen;
    }
  } else if (type === 'milestone') {
    if (!oneOf(FIRST_RUN_MILESTONE_KINDS, kind)) return null;
    event.kind = kind;
  } else if (type === 'dismiss') {
    if (!oneOf(FIRST_RUN_DISMISS_VIAS, via)) return null;
    event.via = via;
  }
  // Any other key the client sent — `ip`, `query`, `lat` — is simply not copied.
  return event;
}

/**
 * Validate a beacon and REBUILD it from the lists above. Nothing unknown is
 * ever copied, and a value outside its list rejects the whole report rather
 * than being stored "cleaned": a report that tried to carry free text is not
 * one to count.
 *
 * @param {unknown} input Parsed JSON.
 * @param {{variants?: string[], maxEvents?: number}} [options]
 * @returns {{ok: true, record: object}|{ok: false, reason: string}}
 */
export function sanitizeFirstRunReport(input, { variants = FIRST_RUN_VARIANT_IDS, maxEvents = FIRST_RUN_MAX_EVENTS } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'not-an-object' };
  const r = input;
  if (r.v !== FIRST_RUN_REPORT_VERSION) return { ok: false, reason: 'version' };
  if (r.exp !== FIRST_RUN_EXPERIMENT_ID) return { ok: false, reason: 'experiment' };
  if (typeof r.forced !== 'boolean') return { ok: false, reason: 'forced' };
  // A forced card may be any variant (support demos B while the test runs A,C);
  // a drawn one must be a variant the test is actually running.
  if (!oneOf(r.forced ? FIRST_RUN_VARIANT_IDS : variants, r.variant)) return { ok: false, reason: 'variant' };
  if (typeof r.visitorId !== 'string' || !ID_RE.test(r.visitorId)) return { ok: false, reason: 'visitorId' };
  if (typeof r.sessionId !== 'string' || !ID_RE.test(r.sessionId)) return { ok: false, reason: 'sessionId' };
  if (r.seq !== 1 && r.seq !== 2) return { ok: false, reason: 'seq' };
  for (const flag of ['newVisitor', 'returnVisit', 'reducedMotion']) {
    if (typeof r[flag] !== 'boolean') return { ok: false, reason: flag };
  }
  if (!oneOf(SHELLS, r.shell)) return { ok: false, reason: 'shell' };
  if (!oneOf(INPUTS, r.input)) return { ok: false, reason: 'input' };
  if (!oneOf(FIRST_RUN_VIEWPORT_BUCKETS, r.viewport)) return { ok: false, reason: 'viewport' };
  if (!isInt(r.bootMs, 0, 600_000) || r.bootMs % 100 !== 0) return { ok: false, reason: 'bootMs' };
  if (r.dwellMs !== null && !isInt(r.dwellMs, 0, MAX_T_MS)) return { ok: false, reason: 'dwellMs' };
  if (!Array.isArray(r.events)) return { ok: false, reason: 'events' };
  if (r.events.length > maxEvents) return { ok: false, reason: 'too-many-events' };
  const events = [];
  for (const raw of r.events) {
    const event = sanitizeEvent(raw);
    if (!event) return { ok: false, reason: 'event' };
    events.push(event);
  }
  if (!r.returnVisit && !events.some((event) => event.type === 'impression')) {
    return { ok: false, reason: 'no-impression' };
  }
  return {
    ok: true,
    record: {
      v: r.v,
      exp: r.exp,
      variant: r.variant,
      forced: r.forced,
      visitorId: r.visitorId,
      sessionId: r.sessionId,
      seq: r.seq,
      newVisitor: r.newVisitor,
      returnVisit: r.returnVisit,
      shell: r.shell,
      input: r.input,
      viewport: r.viewport,
      reducedMotion: r.reducedMotion,
      bootMs: r.bootMs,
      dwellMs: r.dwellMs,
      events,
    },
  };
}
