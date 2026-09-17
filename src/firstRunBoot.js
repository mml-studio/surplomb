// The first-run experience at boot: which card, measured or not, and wired.
//
// src/main.js calls this once the boot flight has landed. It waits (briefly)
// for the page's one `/api/trial` read, which says whether the hosted A/B test
// runs; draws or reads the variant (src/firstRunAb.js); hands the card its
// event sink (src/firstRunTelemetry.js); and, for a visitor who already closed
// the card on an earlier visit, arms the single "they came back" report.
//
// Without the test — a clone, a slow probe, a refusal — this is exactly
// `initFirstRunExperience({ variant: 'A' })` with a sink that does nothing.

import { assignFirstRunVariant } from './firstRunAb.js';
import { initFirstRunExperience, isFirstRunSuppressed } from './firstRunExperience.js';
import { attachFirstRunMilestones, bucketViewport, createFirstRunTelemetry } from './firstRunTelemetry.js';

/**
 * How long the reveal waits for `/api/trial`. The probe started at boot, some
 * seconds earlier, so this is almost always free; past it, A unmeasured.
 */
export const FIRST_RUN_PROBE_BUDGET_MS = 1500;

/**
 * What the report may say about the device: families, never measurements.
 * @param {{documentRef?: Document, windowRef?: Window, performanceRef?: Performance}} [refs]
 */
export function firstRunContext({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  performanceRef = globalThis.performance,
} = {}) {
  const data = documentRef?.documentElement?.dataset || {};
  let reducedMotion = false;
  try {
    reducedMotion = Boolean(windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    reducedMotion = false;
  }
  return {
    shell: data.shell === 'phone' ? 'phone' : 'desktop',
    input: data.input === 'coarse' ? 'coarse' : 'fine',
    viewport: bucketViewport(Math.min(Number(windowRef?.innerWidth) || 0, Number(windowRef?.innerHeight) || 0)),
    reducedMotion,
    bootMs: Math.round(Number(performanceRef?.now?.()) || 0),
  };
}

/**
 * @param {object} input
 * @param {object} input.styleManager
 * @param {object} input.dataManager
 * @param {object|null} [input.phoneSheet]
 * @param {{within: (ms: number) => Promise<object|null>}|null} [input.probe] src/trialProbe.js
 * @returns {Promise<{card: object|null, telemetry: object|null, assignment: object}>}
 */
export async function startFirstRunExperience({
  styleManager,
  dataManager,
  phoneSheet = null,
  probe = null,
  budgetMs = FIRST_RUN_PROBE_BUDGET_MS,
  location = globalThis.location,
  storage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  init = initFirstRunExperience,
  context = null,
} = {}) {
  const trial = probe ? await probe.within(budgetMs) : null;
  const assignment = assignFirstRunVariant({
    experiment: trial?.experiments?.firstRun ?? null,
    // No answer is not "no test": a slow or throttled probe must not erase
    // this browser's draw (src/firstRunAb.js, case 2b). Without a probe at all
    // there is no switch to read, which IS "no test".
    known: !probe || Boolean(trial),
    location,
    storage,
  });
  const device = context ?? firstRunContext({ documentRef, windowRef });
  const measure = (returnVisit) => createFirstRunTelemetry({
    enabled: assignment.telemetry,
    variant: assignment.variant,
    forced: assignment.forced,
    newVisitor: assignment.newVisitor,
    visitorId: assignment.visitorId,
    returnVisit,
    ...device,
  });

  const telemetry = measure(false);
  const card = init({
    styleManager,
    dataManager,
    variant: assignment.variant,
    onEvent: telemetry.record,
    phoneSheet,
    documentRef,
    storage,
    location,
  });
  if (card) {
    attachFirstRunMilestones(telemetry, { dataManager, documentRef, windowRef });
    return { card, telemetry, assignment };
  }

  // No card this visit. Only one kind of absence is a returning visitor: the
  // card was closed before, durably, on a page nobody forced one way or the
  // other — not a share link, not `?welcome=0`.
  const params = new URLSearchParams(location?.search || '');
  const returning = assignment.telemetry
    && !assignment.forced
    && !styleManager?.hasShareState
    && params.get('welcome') !== '0'
    && isFirstRunSuppressed(storage);
  if (!returning) return { card: null, telemetry: null, assignment };
  const back = measure(true);
  attachFirstRunMilestones(back, { dataManager, documentRef, windowRef });
  return { card: null, telemetry: back, assignment };
}
