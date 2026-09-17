#!/usr/bin/env node
/**
 * Read the first-run card's A/B/C log, and say whether it may be read yet.
 *
 * The server appends one JSON line per beacon to `<dir>/events-YYYY-MM-DD.jsonl`
 * (`{receivedAt, ...record}`, the record rebuilt by `sanitizeFirstRunReport`).
 * This script folds those lines into sessions and prints, per variant, the
 * totals the decision needs — never one line per session, never an id.
 *
 * THE DECISION IS MADE ONCE. The stop rule (≥ 200 unforced impressions per
 * variant, or 21 days after the first unforced impression) is printed with
 * every report, and a report read before it is reached says so: looking at
 * p-values every morning and stopping on the first small one is how a test
 * "finds" a winner that is not there.
 *
 * Usage:
 *   node scripts/first-run-ab-report.mjs <dir>
 *     [--include-forced] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
 *     [--alpha 0.05] [--delta 0.10] [--json]
 *
 * Runs on the VPS host (Node 20): no API newer than Node 20 below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FIRST_RUN_ACTION_KINDS,
  FIRST_RUN_DISMISS_VIAS,
  FIRST_RUN_OUTCOMES,
  sanitizeFirstRunReport,
} from '../src/firstRunAb.js';
import { FIRST_RUN_VARIANT_IDS } from '../src/firstRunExperience.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_RE = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = 'A';

/** A found action of one of these kinds means the visitor got somewhere. */
export const ACTIVATING_ACTION_KINDS = Object.freeze(['address', 'geoloc', 'chip', 'tile:sales', 'tile:permits', 'tile:live']);
/** A milestone of one of these kinds, after the card closed, means the same. */
export const ACTIVATING_MILESTONE_KINDS = Object.freeze(['layer', 'search']);
/** Closures the visitor did not choose: the guardrail metric. */
export const UNCHOSEN_DISMISS_VIAS = Object.freeze(['esc', 'click-away', 'timeout']);

export const STOP_RULE = Object.freeze({
  minImpressionsPerVariant: 200,
  maxDays: 21,
  extensionDays: 21,
});
export const DEFAULT_ALPHA = 0.05;
export const DEFAULT_DELTA = 0.1;
export const DEFAULT_POWER = 0.8;
/** Baseline activation when A has no data yet. */
export const FALLBACK_BASELINE = 0.3;
const RETURN_AFTER_MS = DAY_MS;
const PACE_WINDOW_DAYS = 7;
/** Best outcome first: a session that failed then succeeded counts as found. */
const OUTCOME_RANK = Object.freeze(['found', 'not-found', 'cancelled']);

// ---------------------------------------------------------------------------
// Statistics

/** erfc(x) for x ≥ 0 (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
function erfcPositive(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return poly * Math.exp(-x * x);
}

/**
 * Standard normal CDF.
 * @param {number} z
 * @returns {number}
 */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return Number.isNaN(z) ? NaN : z > 0 ? 1 : 0;
  const tail = 0.5 * erfcPositive(Math.abs(z) / Math.SQRT2);
  return z >= 0 ? 1 - tail : tail;
}

/**
 * Inverse standard normal CDF (Acklam, relative error < 1.2e-9).
 * @param {number} p in (0, 1)
 * @returns {number}
 */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const tailQuantile = (q) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
    / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < low) return tailQuantile(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - low) return -tailQuantile(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q)
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Wilson score interval for a proportion. No data: the whole of [0, 1].
 * @param {number} successes
 * @param {number} n
 * @param {number} [z]
 * @returns {[number, number]}
 */
export function wilson(successes, n, z = 1.96) {
  if (!(n > 0)) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Two-sided two-proportion z-test with pooled variance. `z > 0` when the first
 * proportion is the larger one. `{z: null, p: null}` when a group is empty.
 * @returns {{z: number|null, p: number|null}}
 */
export function twoProportionZ(x1, n1, x2, n2) {
  if (!(n1 > 0) || !(n2 > 0)) return { z: null, p: null };
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return { z: 0, p: 1 };
  const z = (x1 / n1 - x2 / n2) / se;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return { z, p };
}

/** Continuous per-group size (Fleiss, no continuity correction). */
function rawSampleSize(p1, p2, alpha, power) {
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const mean = (p1 + p2) / 2;
  const root = zAlpha * Math.sqrt(2 * mean * (1 - mean)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return (root * root) / ((p1 - p2) * (p1 - p2));
}

const isProbability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const isOpenUnit = (value) => Number.isFinite(value) && value > 0 && value < 1;

/**
 * Impressions per group to detect `delta` (absolute) from `p1`, two-sided.
 * Upward when there is room, downward otherwise. 356 for (0.30, 0.10).
 * @returns {number|null}
 */
export function sampleSizePerGroup(p1, delta, alpha = DEFAULT_ALPHA, power = DEFAULT_POWER) {
  if (!isProbability(p1) || !isOpenUnit(delta) || !isOpenUnit(alpha) || !isOpenUnit(power)) return null;
  const p2 = p1 + delta <= 1 ? p1 + delta : p1 - delta;
  if (p2 < 0) return null;
  // The epsilon keeps an exact integer from being pushed up by rounding noise.
  return Math.ceil(rawSampleSize(p1, p2, alpha, power) - 1e-9);
}

/**
 * Smallest upward absolute difference from `p` detectable with `n` per group:
 * the inverse of `sampleSizePerGroup`. `null` when not even p → 1 is.
 * @returns {number|null}
 */
export function minimumDetectableDelta(p, n, alpha = DEFAULT_ALPHA, power = DEFAULT_POWER) {
  if (!isProbability(p) || p >= 1 || !(n > 0) || !isOpenUnit(alpha) || !isOpenUnit(power)) return null;
  let hi = 1 - p;
  if (rawSampleSize(p, 1, alpha, power) > n) return null;
  let lo = 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (rawSampleSize(p, p + mid, alpha, power) > n) lo = mid;
    else hi = mid;
  }
  return hi;
}

const finiteValues = (values) => (Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : []);

/**
 * Linear-interpolation quantile (R type 7). `null` on no data.
 * @param {number[]} values
 * @param {number} q in [0, 1]
 * @returns {number|null}
 */
export function quantile(values, q) {
  const sorted = finiteValues(values).sort((x, y) => x - y);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/**
 * @param {number[]} values
 * @returns {number|null}
 */
export function median(values) {
  return quantile(values, 0.5);
}

// ---------------------------------------------------------------------------
// Reading

const receivedMsOf = (record) => (record && typeof record.receivedAt === 'string' ? Date.parse(record.receivedAt) : NaN);

/** One log line → a record, or `null`. The record is rebuilt by the server's own validator. */
function parseLine(line) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const receivedMs = receivedMsOf(raw);
  if (!Number.isFinite(receivedMs)) return null;
  const checked = sanitizeFirstRunReport(raw, { variants: FIRST_RUN_VARIANT_IDS });
  if (!checked.ok) return null;
  return { receivedAt: raw.receivedAt, ...checked.record };
}

/**
 * Read every `events-YYYY-MM-DD.jsonl` in `dir` whose date is within
 * [since, until] (by file name). Unreadable lines are counted, not thrown.
 * @param {string} dir
 * @param {{since?: string|null, until?: string|null}} [options]
 * @returns {{records: object[], unreadable: number, files: string[]}}
 */
export function readReports(dir, { since = null, until = null } = {}) {
  const files = fs.readdirSync(dir)
    .map((name) => FILE_RE.exec(name))
    .filter((match) => match && (!since || match[1] >= since) && (!until || match[1] <= until))
    .sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0))
    .map((match) => match[0]);
  const records = [];
  let unreadable = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const record = parseLine(line);
      if (record) records.push(record);
      else unreadable += 1;
    }
  }
  return { records, unreadable, files };
}

/**
 * One record per `sessionId`: the highest `seq` (seq 2 is cumulative), and at
 * equal `seq` the last received. Each kept record gains `firstReceivedMs`,
 * the earliest receipt of any of its session's lines.
 * @param {object[]} records
 * @returns {object[]}
 */
export function dedupeSessions(records) {
  const bySession = new Map();
  for (const record of records || []) {
    if (!record || typeof record.sessionId !== 'string') continue;
    const ms = receivedMsOf(record);
    const current = bySession.get(record.sessionId);
    if (!current) {
      bySession.set(record.sessionId, { best: record, bestMs: ms, firstMs: ms });
      continue;
    }
    if (Number.isFinite(ms) && !(ms >= current.firstMs)) current.firstMs = ms;
    // `!(ms < bestMs)`: a later or equal receipt wins, and so does a line
    // whose time cannot be read — file order is the fallback.
    if (record.seq > current.best.seq || (record.seq === current.best.seq && !(ms < current.bestMs))) {
      current.best = record;
      current.bestMs = ms;
    }
  }
  return [...bySession.values()].map(({ best, firstMs }) => ({ ...best, firstReceivedMs: firstMs }));
}

/**
 * The first action or dismissal at or after the impression; `null` for a
 * return visit or a card nobody touched.
 * @param {{events?: object[]}} session
 * @returns {object|null}
 */
export function terminalOf(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const impression = events.find((event) => event.type === 'impression');
  if (!impression) return null;
  let terminal = null;
  for (const event of events) {
    if (event.type !== 'action' && event.type !== 'dismiss') continue;
    if (!(event.t >= impression.t)) continue;
    if (!terminal || event.t < terminal.t) terminal = event;
  }
  return terminal;
}

/**
 * Did this session get somewhere? A found action of an activating kind, or a
 * layer/search milestone strictly after the card's terminal event.
 * `tile:explore`, `explore` and `hint-click` alone never count.
 * @param {{events?: object[]}} session
 * @returns {boolean}
 */
export function isActivated(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const found = events.some(
    (event) => event.type === 'action' && event.outcome === 'found' && ACTIVATING_ACTION_KINDS.includes(event.kind),
  );
  if (found) return true;
  const terminal = terminalOf(session);
  if (!terminal) return false;
  return events.some(
    (event) => event.type === 'milestone' && ACTIVATING_MILESTONE_KINDS.includes(event.kind) && event.t > terminal.t,
  );
}

// ---------------------------------------------------------------------------
// Summaries

const rate = (count, n) => (n > 0 ? count / n : null);
const counted = (count, n) => ({ sessions: count, rate: rate(count, n) });

function bestOutcome(events, kind) {
  let best = null;
  for (const event of events) {
    if (event.type !== 'action' || event.kind !== kind) continue;
    if (best === null || OUTCOME_RANK.indexOf(event.outcome) < OUTCOME_RANK.indexOf(best)) best = event.outcome;
  }
  return best;
}

function firstDismissVia(events) {
  let first = null;
  for (const event of events) {
    if (event.type === 'dismiss' && (!first || event.t < first.t)) first = event;
  }
  return first ? first.via : null;
}

const maxReceivedMs = (list) => list.reduce((max, record) => {
  const ms = receivedMsOf(record);
  return Number.isFinite(ms) && ms > max ? ms : max;
}, -Infinity);

/**
 * Totals for one variant. `sessions` are its impression sessions (deduped,
 * not return visits); `returnSessions` are deduped return visits of any
 * variant, matched by visitor. `asOfMs` (default: the latest receipt seen)
 * bounds who has had 24 h to come back.
 * @param {object[]} sessions
 * @param {object[]} [returnSessions]
 * @param {{asOfMs?: number}} [options]
 */
export function summarizeVariant(sessions, returnSessions = [], { asOfMs } = {}) {
  const list = Array.isArray(sessions) ? sessions : [];
  const returns = Array.isArray(returnSessions) ? returnSessions : [];
  const n = list.length;
  const endMs = Number.isFinite(asOfMs) ? asOfMs : Math.max(maxReceivedMs(list), maxReceivedMs(returns));

  const actions = {};
  for (const kind of FIRST_RUN_ACTION_KINDS) {
    const outcomes = Object.fromEntries(FIRST_RUN_OUTCOMES.map((outcome) => [outcome, 0]));
    let total = 0;
    for (const session of list) {
      const outcome = bestOutcome(session.events || [], kind);
      if (outcome === null) continue;
      total += 1;
      outcomes[outcome] += 1;
    }
    actions[kind] = { ...counted(total, n), outcomes };
  }

  const viaCounts = Object.fromEntries(FIRST_RUN_DISMISS_VIAS.map((via) => [via, 0]));
  let undismissed = 0;
  let unchosen = 0;
  for (const session of list) {
    const via = firstDismissVia(session.events || []);
    if (via === null) undismissed += 1;
    else viaCounts[via] += 1;
    if (UNCHOSEN_DISMISS_VIAS.includes(via)) unchosen += 1;
  }
  const dismissals = Object.fromEntries(FIRST_RUN_DISMISS_VIAS.map((via) => [via, counted(viaCounts[via], n)]));

  const terminalTimes = [];
  let activated = 0;
  for (const session of list) {
    const impression = (session.events || []).find((event) => event.type === 'impression');
    const terminal = terminalOf(session);
    if (terminal && impression) terminalTimes.push(terminal.t - impression.t);
    if (isActivated(session)) activated += 1;
  }

  // Return: a return visit received ≥ 24 h after the visitor's first impression.
  // Only visitors seen ≥ 24 h before the end of the data can have made one.
  const firstSeen = new Map();
  for (const session of list) {
    const ms = Number.isFinite(session.firstReceivedMs) ? session.firstReceivedMs : receivedMsOf(session);
    if (!Number.isFinite(ms)) continue;
    const known = firstSeen.get(session.visitorId);
    if (known === undefined || ms < known) firstSeen.set(session.visitorId, ms);
  }
  const returnTimes = new Map();
  for (const session of returns) {
    const ms = Number.isFinite(session.firstReceivedMs) ? session.firstReceivedMs : receivedMsOf(session);
    if (!Number.isFinite(ms)) continue;
    if (!returnTimes.has(session.visitorId)) returnTimes.set(session.visitorId, []);
    returnTimes.get(session.visitorId).push(ms);
  }
  let eligible = 0;
  let returned = 0;
  for (const [visitorId, firstMs] of firstSeen) {
    if (!(firstMs + RETURN_AFTER_MS <= endMs)) continue;
    eligible += 1;
    if ((returnTimes.get(visitorId) || []).some((ms) => ms >= firstMs + RETURN_AFTER_MS)) returned += 1;
  }

  const exitReports = list.filter((session) => session.seq === 2);
  const dwells = exitReports.map((session) => session.dwellMs).filter((value) => Number.isFinite(value));

  return {
    impressions: n,
    visitors: new Set(list.map((session) => session.visitorId)).size,
    activation: { successes: activated, n, rate: rate(activated, n), ci95: wilson(activated, n) },
    actions,
    dismissals,
    undismissed: counted(undismissed, n),
    unchosenDismissals: counted(unchosen, n),
    timeToTerminal: { sessions: terminalTimes.length, medianMs: median(terminalTimes), p75Ms: quantile(terminalTimes, 0.75) },
    returnRate: { eligibleVisitors: eligible, returned, rate: rate(returned, eligible) },
    dwell: { sessions: dwells.length, medianMs: median(dwells) },
    seq2Coverage: counted(exitReports.length, n),
  };
}

const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, days) => utcDate(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function compare(control, treatment, alpha) {
  const activation = twoProportionZ(
    treatment.activation.successes, treatment.impressions,
    control.activation.successes, control.impressions,
  );
  const closures = twoProportionZ(
    treatment.unchosenDismissals.sessions, treatment.impressions,
    control.unchosenDismissals.sessions, control.impressions,
  );
  const threshold = alpha / 2;
  const hasData = activation.z !== null;
  const better = hasData && activation.z > 0 && activation.p < threshold;
  // Guardrail at the uncorrected alpha: the stricter protection against harm.
  const worseOnClosures = hasData && closures.z > 0 && closures.p < alpha;
  return {
    activation: { control: control.activation.rate, treatment: treatment.activation.rate, ...activation },
    unchosenDismissals: { control: control.unchosenDismissals.rate, treatment: treatment.unchosenDismissals.rate, ...closures },
    threshold,
    hasData,
    better,
    worseOnClosures,
    qualifies: better && !worseOnClosures,
  };
}

/**
 * Everything the report prints, as one object. No identifier in it.
 * @param {{records: object[], unreadable?: number, files?: string[]}} data
 * @param {{includeForced?: boolean, alpha?: number, delta?: number, power?: number}} [options]
 */
export function buildReport(data, {
  includeForced = false,
  alpha = DEFAULT_ALPHA,
  delta = DEFAULT_DELTA,
  power = DEFAULT_POWER,
  since = null,
  until = null,
} = {}) {
  const records = data?.records || [];
  const sessions = dedupeSessions(records);
  const forcedCount = sessions.filter((session) => session.forced).length;
  const kept = includeForced ? sessions : sessions.filter((session) => !session.forced);
  const unforced = sessions.filter((session) => !session.forced);
  const endMs = maxReceivedMs(records);
  const asOfMs = Number.isFinite(endMs) ? endMs : undefined;

  const impressionsOf = (list, variant) => list.filter((session) => !session.returnVisit && session.variant === variant);
  const returnsIn = (list) => list.filter((session) => session.returnVisit);

  const variants = {};
  for (const variant of FIRST_RUN_VARIANT_IDS) {
    variants[variant] = summarizeVariant(impressionsOf(kept, variant), returnsIn(kept), { asOfMs });
  }

  const comparisons = {};
  for (const variant of FIRST_RUN_VARIANT_IDS) {
    if (variant === CONTROL) continue;
    comparisons[variant] = compare(variants[CONTROL], variants[variant], alpha);
  }

  // Stop rule and planning: always on unforced sessions, whatever the flag.
  const unforcedImpressions = unforced.filter((session) => !session.returnVisit);
  const unforcedCounts = Object.fromEntries(
    FIRST_RUN_VARIANT_IDS.map((variant) => [variant, impressionsOf(unforced, variant).length]),
  );
  const activeVariants = FIRST_RUN_VARIANT_IDS.filter((variant) => unforcedCounts[variant] > 0);
  const firstMs = unforcedImpressions.reduce(
    (min, session) => (Number.isFinite(session.firstReceivedMs) && session.firstReceivedMs < min ? session.firstReceivedMs : min),
    Infinity,
  );
  const unforcedEndMs = maxReceivedMs(records.filter((record) => !record.forced));
  const hasUnforced = Number.isFinite(firstMs) && Number.isFinite(unforcedEndMs);
  const daysElapsed = hasUnforced ? (unforcedEndMs - firstMs) / DAY_MS : 0;
  const smallest = activeVariants.length ? Math.min(...activeVariants.map((variant) => unforcedCounts[variant])) : 0;
  const reachedBySize = activeVariants.length >= 2 && smallest >= STOP_RULE.minImpressionsPerVariant;
  const reachedByTime = hasUnforced && daysElapsed >= STOP_RULE.maxDays;
  const stopRule = {
    ...STOP_RULE,
    variantsRunning: activeVariants,
    smallestVariantImpressions: smallest,
    firstImpressionDate: hasUnforced ? utcDate(firstMs) : null,
    readableFrom: hasUnforced ? utcDate(firstMs + STOP_RULE.maxDays * DAY_MS) : null,
    lastExtensionUntil: hasUnforced ? utcDate(firstMs + (STOP_RULE.maxDays + STOP_RULE.extensionDays) * DAY_MS) : null,
    daysElapsed,
    reachedBySize,
    reachedByTime,
    reached: reachedBySize || reachedByTime,
  };

  const controlUnforced = impressionsOf(unforced, CONTROL);
  const controlActivated = controlUnforced.filter(isActivated).length;
  const baselineObserved = controlUnforced.length > 0;
  const baseline = baselineObserved ? controlActivated / controlUnforced.length : FALLBACK_BASELINE;
  const corrected = alpha / 2;
  const required = sampleSizePerGroup(baseline, delta, corrected, power);
  const requiredNominal = sampleSizePerGroup(baseline, delta, alpha, power);
  const planned = activeVariants.length ? activeVariants : [...FIRST_RUN_VARIANT_IDS];
  const missing = Object.fromEntries(
    planned.map((variant) => [variant, required === null ? null : Math.max(0, required - unforcedCounts[variant])]),
  );

  // Pace: unforced impressions over the last 7 days of data (fewer if the
  // test is younger), per variant; the slowest variant sets the horizon.
  let pace = Object.fromEntries(planned.map((variant) => [variant, null]));
  let windowDays = 0;
  let daysToTarget = null;
  if (hasUnforced) {
    const endDate = utcDate(unforcedEndMs);
    const startDate = addDays(endDate, -(PACE_WINDOW_DAYS - 1));
    windowDays = Math.min(PACE_WINDOW_DAYS, daysBetween(utcDate(firstMs), endDate) + 1);
    pace = Object.fromEntries(planned.map((variant) => {
      const recent = impressionsOf(unforced, variant).filter((session) => {
        if (!Number.isFinite(session.firstReceivedMs)) return false;
        const date = utcDate(session.firstReceivedMs);
        return date >= startDate && date <= endDate;
      }).length;
      return [variant, recent / windowDays];
    }));
    let horizon = 0;
    for (const variant of planned) {
      if (missing[variant] === null) { horizon = null; break; }
      if (missing[variant] === 0) continue;
      if (!(pace[variant] > 0)) { horizon = null; break; }
      horizon = Math.max(horizon, Math.ceil(missing[variant] / pace[variant]));
    }
    daysToTarget = horizon;
  }

  const planning = {
    power,
    delta,
    baseline,
    baselineObserved,
    alphaCorrected: corrected,
    requiredPerVariant: required,
    requiredPerVariantNominalAlpha: requiredNominal,
    unforcedImpressions: unforcedCounts,
    missing,
    paceWindowDays: windowDays,
    pacePerDay: pace,
    daysToTarget,
    currentN: smallest,
    minimumDetectableDelta: minimumDetectableDelta(baseline, smallest, corrected, power),
    minimumDetectableDeltaNominalAlpha: minimumDetectableDelta(baseline, smallest, alpha, power),
  };

  const qualifying = Object.entries(comparisons).filter(([, comparison]) => comparison.qualifies);
  let decision;
  if (!stopRule.reached) decision = { status: 'premature', variant: null };
  else if (!qualifying.length) decision = { status: 'keep-control', variant: CONTROL };
  else {
    qualifying.sort(([x], [y]) => (variants[y].activation.rate ?? 0) - (variants[x].activation.rate ?? 0));
    decision = { status: 'adopt', variant: qualifying[0][0], tied: qualifying.length > 1 };
  }

  return {
    experiment: 'first-run',
    data: {
      files: (data?.files || []).length,
      firstFile: (data?.files || [])[0] || null,
      lastFile: (data?.files || []).slice(-1)[0] || null,
      lines: records.length,
      unreadableLines: data?.unreadable || 0,
      sessions: sessions.length,
      forcedSessions: forcedCount,
      includeForced,
      since,
      until,
      lastReceivedAt: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
    },
    alpha,
    variants,
    comparisons,
    stopRule,
    planning,
    decision,
  };
}

// ---------------------------------------------------------------------------
// Printing (French)

const frNumber = (value, digits = 0) => (value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace('.', ','));
const frInt = (value) => (Number.isFinite(value) ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '—');
const frPct = (value, digits = 1) => (value === null || !Number.isFinite(value) ? '—' : `${frNumber(value * 100, digits)} %`);
const frDecimal = (value) => (Number.isFinite(value) ? String(Number(value.toFixed(4))).replace('.', ',') : '—');
const frP = (value) => (value === null || !Number.isFinite(value) ? '—' : value < 0.001 ? '< 0,001' : frNumber(value, 3));
const frZ = (value) => (value === null || !Number.isFinite(value) ? '—' : frNumber(value, 2).replace('-', '−'));
function frDuration(ms) {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 60_000) return `${frNumber(ms / 1000, 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms - minutes * 60_000) / 1000);
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}
const OUTCOME_LABELS = { found: 'trouvé', 'not-found': 'introuvable', cancelled: 'annulé' };

function variantLines(id, summary) {
  const lines = [`── Variante ${id} ──`];
  const n = summary.impressions;
  if (!n) {
    lines.push('Aucune impression.');
    return lines;
  }
  const act = summary.activation;
  lines.push(`Impressions : ${frInt(n)} (visiteurs uniques : ${frInt(summary.visitors)})`);
  lines.push(
    `Activation : ${frPct(act.rate)} (${act.successes}/${n}), IC 95 % [${frPct(act.ci95[0])} ; ${frPct(act.ci95[1])}]`,
  );
  const kinds = Object.entries(summary.actions).filter(([, entry]) => entry.sessions > 0);
  lines.push('Actions (sessions, part des impressions) :');
  if (!kinds.length) lines.push('  aucune');
  for (const [kind, entry] of kinds) {
    const split = FIRST_RUN_OUTCOMES
      .filter((outcome) => entry.outcomes[outcome] > 0)
      .map((outcome) => `${OUTCOME_LABELS[outcome] || outcome} ${entry.outcomes[outcome]}`)
      .join(' · ');
    lines.push(`  ${kind.padEnd(13)} ${String(entry.sessions).padStart(5)}  ${frPct(entry.rate).padStart(7)}  (${split})`);
  }
  lines.push('Fermetures (première fermeture de la session) :');
  for (const [via, entry] of Object.entries(summary.dismissals)) {
    if (!entry.sessions) continue;
    lines.push(`  ${via.padEnd(20)} ${String(entry.sessions).padStart(5)}  ${frPct(entry.rate).padStart(7)}`);
  }
  lines.push(`  ${'sans fermeture reçue'.padEnd(20)} ${String(summary.undismissed.sessions).padStart(5)}  ${frPct(summary.undismissed.rate).padStart(7)}`);
  lines.push(`  subies (esc + click-away + timeout) : ${summary.unchosenDismissals.sessions}, ${frPct(summary.unchosenDismissals.rate)}`);
  const ttt = summary.timeToTerminal;
  lines.push(
    `Temps jusqu'au premier geste : médiane ${frDuration(ttt.medianMs)} · p75 ${frDuration(ttt.p75Ms)} (sur ${ttt.sessions} sessions)`,
  );
  const ret = summary.returnRate;
  lines.push(
    ret.eligibleVisitors
      ? `Retour après ≥ 24 h : ${frPct(ret.rate)} (${ret.returned}/${ret.eligibleVisitors} visiteurs vus il y a ≥ 24 h)`
      : 'Retour après ≥ 24 h : — (aucun visiteur vu il y a ≥ 24 h)',
  );
  lines.push(`Durée de visite médiane : ${frDuration(summary.dwell.medianMs)} (sur ${summary.dwell.sessions} rapports de sortie)`);
  lines.push(
    `Couverture du rapport de sortie (seq 2) : ${frPct(summary.seq2Coverage.rate)} (${summary.seq2Coverage.sessions}/${n})`,
  );
  return lines;
}

/**
 * The report as French text.
 * @param {ReturnType<typeof buildReport>} report
 * @returns {string}
 */
export function formatReport(report) {
  const { data, variants, comparisons, stopRule, planning, decision, alpha } = report;
  const lines = [];
  lines.push('Test A/B/C de la carte de bienvenue — rapport');
  lines.push(
    data.files
      ? `Données : ${data.files} fichier(s) (${data.firstFile} → ${data.lastFile}), ${frInt(data.lines)} ligne(s) lue(s), ${frInt(data.unreadableLines)} illisible(s) ignorée(s), ${frInt(data.sessions)} session(s).`
      : 'Données : aucun fichier events-AAAA-MM-JJ.jsonl dans la fenêtre demandée.',
  );
  lines.push(
    data.includeForced
      ? `Sessions forcées (?welcome=) : INCLUSES (${data.forcedSessions}). Ne pas décider sur ces chiffres.`
      : `Sessions forcées (?welcome=) : exclues (${data.forcedSessions}).`,
  );
  if (data.since || data.until) {
    lines.push(
      `Fenêtre restreinte (${data.since || '…'} → ${data.until || '…'}) : la règle d'arrêt et le rythme ne valent que sur le journal complet, sans --since ni --until.`,
    );
  }
  lines.push('');

  for (const id of FIRST_RUN_VARIANT_IDS) {
    lines.push(...variantLines(id, variants[id]), '');
  }

  lines.push(`── Comparaisons (activation ; seuil de Bonferroni α/2 = ${frDecimal(alpha / 2)}) ──`);
  for (const [id, cmp] of Object.entries(comparisons)) {
    if (!cmp.hasData) {
      lines.push(`${CONTROL} contre ${id} : pas assez de données (une des deux variantes est vide).`);
      continue;
    }
    lines.push(
      `${CONTROL} contre ${id} : activation ${frPct(cmp.activation.control)} contre ${frPct(cmp.activation.treatment)}`
      + ` · z = ${frZ(cmp.activation.z)} · p brut = ${frP(cmp.activation.p)}`,
    );
    lines.push(
      `  fermetures subies ${frPct(cmp.unchosenDismissals.control)} contre ${frPct(cmp.unchosenDismissals.treatment)}`
      + ` · z = ${frZ(cmp.unchosenDismissals.z)} · p = ${frP(cmp.unchosenDismissals.p)}`,
    );
    let verdict;
    if (cmp.qualifies) verdict = `${id} meilleure que ${CONTROL} (p < ${frDecimal(cmp.threshold)}) et pas pire sur les fermetures subies.`;
    else if (cmp.better) verdict = `${id} meilleure sur l'activation, mais PIRE sur les fermetures subies : non adoptable.`;
    else verdict = `pas d'écart significatif en faveur de ${id} au seuil ${frDecimal(cmp.threshold)}.`;
    if (!stopRule.reached) verdict = `non décidable, règle d'arrêt non atteinte (${verdict})`;
    lines.push(`  Verdict : ${verdict}`);
  }
  lines.push('');

  lines.push("── Règle d'arrêt ──");
  lines.push(
    `Lire UNE fois : à ≥ ${STOP_RULE.minImpressionsPerVariant} impressions non forcées par variante OU ${STOP_RULE.maxDays} jours après la première impression non forcée`
    + (stopRule.readableFrom ? ` (${stopRule.firstImpressionDate} + ${STOP_RULE.maxDays} j = ${stopRule.readableFrom}).` : '.'),
  );
  lines.push(
    `Adopter B ou C seulement si meilleure que A sur l'activation avec p < ${frDecimal(alpha / 2)}`
    + ` ET pas pire sur le taux de fermeture esc + click-away + timeout (pire = plus élevé qu'en A avec p < ${frDecimal(alpha)}).`
    + ' Sinon A reste.',
  );
  lines.push(
    `Une seule prolongation de ${STOP_RULE.extensionDays / 7} semaines au plus`
    + (stopRule.lastExtensionUntil ? ` (au plus tard le ${stopRule.lastExtensionUntil}).` : '.'),
  );
  if (stopRule.reached) {
    const why = [
      stopRule.reachedBySize ? `≥ ${STOP_RULE.minImpressionsPerVariant} impressions par variante` : null,
      stopRule.reachedByTime ? `${STOP_RULE.maxDays} jours écoulés` : null,
    ].filter(Boolean).join(' et ');
    lines.push(`État : ATTEINTE (${why}). Cette lecture est LA lecture : consigner la décision, ne pas relancer pour la changer.`);
  } else {
    lines.push(
      `État : NON ATTEINTE — ${stopRule.smallestVariantImpressions}/${STOP_RULE.minImpressionsPerVariant} impressions pour la variante la moins remplie,`
      + ` jour ${frNumber(Math.floor(stopRule.daysElapsed))}/${STOP_RULE.maxDays}.`,
    );
    lines.push(
      'ATTENTION : consulter les p-valeurs avant la règle d\'arrêt et s\'arrêter au premier « significatif » (peeking)'
      + ' gonfle le taux de faux positifs bien au-delà de α. Chiffres descriptifs seulement : ne rien décider.',
    );
  }
  if (decision.status === 'adopt') {
    lines.push(
      `Décision : adopter ${decision.variant}.`
      + (decision.tied ? ' (B et C passent toutes deux : la meilleure activation est retenue.)' : ''),
    );
  } else if (decision.status === 'keep-control') {
    lines.push(`Décision : ${CONTROL} reste (ou prolonger UNE fois, ${STOP_RULE.extensionDays / 7} semaines au plus).`);
  } else {
    lines.push('Décision : aucune pour l\'instant.');
  }
  lines.push('');

  lines.push("── Taille d'échantillon ──");
  lines.push(
    `Base : activation de A = ${frPct(planning.baseline)}`
    + (planning.baselineObserved ? ' (observée, sessions non forcées).' : ' (valeur par défaut : A sans données).'),
  );
  const points = frNumber(planning.delta * 100, 1).replace(/,0$/, '');
  lines.push(
    `Pour détecter +${points} points avec une puissance de ${frNumber(planning.power * 100)} % :`
    + ` ${planning.requiredPerVariant ?? '—'} impressions par variante au seuil appliqué (α/2 = ${frDecimal(planning.alphaCorrected)}),`
    + ` ${planning.requiredPerVariantNominalAlpha ?? '—'} à α = ${frDecimal(alpha)}.`,
  );
  lines.push(
    `Impressions manquantes : ${Object.entries(planning.missing).map(([id, value]) => `${id} ${value ?? '—'}`).join(' · ')}`,
  );
  if (planning.paceWindowDays > 0) {
    const paceText = Object.entries(planning.pacePerDay).map(([id, value]) => `${id} ${frNumber(value, 1)}/j`).join(' · ');
    lines.push(
      `Rythme (impressions non forcées par jour) : ${paceText}`
      + (planning.daysToTarget === null
        ? ' → horizon inconnu (rythme nul pour une variante incomplète).'
        : ` → ≈ ${planning.daysToTarget} jour(s) au rythme des ${planning.paceWindowDays} derniers jours de données.`),
    );
  } else {
    lines.push('Rythme : aucune impression non forcée, horizon inconnu.');
  }
  const mde = planning.minimumDetectableDelta;
  const mdeNominal = planning.minimumDetectableDeltaNominalAlpha;
  lines.push(
    planning.currentN > 0
      ? `Écart minimal détectable aujourd'hui (n = ${planning.currentN} par variante) : `
        + `${mde === null ? 'hors de portée' : `${frNumber(mde * 100, 1)} points`} au seuil appliqué, `
        + `${mdeNominal === null ? 'hors de portée' : `${frNumber(mdeNominal * 100, 1)} points`} à α = ${frDecimal(alpha)}.`
      : 'Écart minimal détectable : aucun (n = 0).',
  );
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Command line

const USAGE = 'Usage : node scripts/first-run-ab-report.mjs <dossier> [--include-forced] [--since AAAA-MM-JJ]'
  + ' [--until AAAA-MM-JJ] [--alpha 0.05] [--delta 0.10] [--json]';

/**
 * @param {string[]} argv
 * @returns {{dir: string|null, includeForced: boolean, since: string|null, until: string|null, alpha: number, delta: number, json: boolean, help: boolean, error: string|null}}
 */
export function parseArgs(argv) {
  const args = {
    dir: null, includeForced: false, since: null, until: null,
    alpha: DEFAULT_ALPHA, delta: DEFAULT_DELTA, json: false, help: false, error: null,
  };
  for (let i = 0; i < argv.length && !args.error; i += 1) {
    const arg = argv[i];
    if (arg === '--include-forced') args.includeForced = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--since' || arg === '--until') {
      const value = argv[++i];
      if (!DATE_RE.test(value || '')) args.error = `${arg} attend une date AAAA-MM-JJ.`;
      else args[arg.slice(2)] = value;
    } else if (arg === '--alpha' || arg === '--delta') {
      const value = Number(argv[++i]);
      if (!isOpenUnit(value)) args.error = `${arg} attend un nombre strictement entre 0 et 1.`;
      else args[arg.slice(2)] = value;
    } else if (arg.startsWith('-')) args.error = `Option inconnue : ${arg}`;
    else if (args.dir === null) args.dir = arg;
    else args.error = `Argument en trop : ${arg}`;
  }
  if (!args.error && !args.help && !args.dir) args.error = 'Dossier des journaux manquant.';
  if (!args.error && args.since && args.until && args.since > args.until) args.error = '--since est après --until.';
  return args;
}

/**
 * @param {string[]} [argv]
 * @param {{write?: (text: string) => void, writeError?: (text: string) => void}} [io]
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2), {
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text),
} = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    write(`${USAGE}\n`);
    return 0;
  }
  if (args.error) {
    writeError(`${args.error}\n${USAGE}\n`);
    return 2;
  }
  let data;
  try {
    data = readReports(args.dir, { since: args.since, until: args.until });
  } catch (error) {
    writeError(`Lecture impossible de ${args.dir} : ${error.code || error.message}\n`);
    return 1;
  }
  const report = buildReport(data, {
    includeForced: args.includeForced,
    alpha: args.alpha,
    delta: args.delta,
    since: args.since,
    until: args.until,
  });
  write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
  return 0;
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = main();
