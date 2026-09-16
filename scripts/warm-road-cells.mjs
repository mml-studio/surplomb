#!/usr/bin/env node
/**
 * warm-road-cells.mjs — pay the cold Overpass boxes of the cities people
 * actually land on, once a week, so that no reader ever does.
 *
 * ── The number this exists for ────────────────────────────────────────────
 * A cold road fetch costs 0.6 to 46 s (measured 2026-09-16 against the hosted
 * origin from the VPS: Lyon 46.4 s, Paris arterials 17.8 s, Marseille 6.1 s,
 * Bordeaux 2.7 s). The same query repeated costs 52 to 78 ms. The proxy holds
 * Overpass answers on disk for 30 days.
 *
 * So somebody pays the cold box roughly once a month per cell, and until this
 * script it was whoever happened to arrive first — with nothing on screen while
 * they waited. On 2026-09-16 it was worse than a wait: overpass-api.de was
 * refusing this address, so every city that was not already cached drew a
 * coloured TomTom ribbon with no vehicles on it, while Paris — the default
 * view, permanently warm — looked perfect. A warm cache is not a speed-up here,
 * it is the difference between degraded and working.
 *
 * ── Why it paces itself, and why that is the whole design ─────────────────
 * overpass-api.de does not ban, it ESCALATES: measured that day, 8 back-to-back
 * requests from one address went `504, 504, 200, 200, 429, 429, refused,
 * refused` in forty seconds. A warmer is the most burst-shaped traffic a site
 * like this produces — thirty identical-looking queries with no human between
 * them — so an eager one is precisely how a weekly maintenance job gets the
 * upstream to stop answering the site it was meant to help.
 *
 * Hence: strictly sequential, a deliberate pause between requests, and a run
 * that GIVES UP after a few consecutive failures rather than grinding through
 * a host that is already refusing. Cells are ordered metro-first, so the ones
 * that survive an early stop are the ones that help every camera framing.
 *
 * ── What it asks for ──────────────────────────────────────────────────────
 * Exactly what the layer asks for: the same classes, the same server-side
 * timeouts, the same form encoding. The proxy caches on the query BODY, so
 * anything less than byte-identical warms nothing.
 *
 *   node scripts/warm-road-cells.mjs --url http://localhost:4173
 *   node scripts/warm-road-cells.mjs --dry-run           # print, ask nothing
 *   node scripts/warm-road-cells.mjs --only Lyon,Lille   # one or two cities
 *   node scripts/warm-road-cells.mjs --gap-s 20          # gentler still
 *
 * Run it from the VPS against the container, not through the edge: Cloudflare
 * caps `/api` at 30 requests per 10 s per IP, and there is nothing at the edge
 * this needs to touch.
 *
 * Exits 0 when every cell it attempted was served, 1 otherwise — so a cron mail
 * means something. A run cut short by the upstream refusing is a failure and
 * says so, because "we did not warm the cities" is exactly the state that looks
 * fine until a reader opens Marseille.
 */

import { buildOverpassQuery } from '../src/data/trafficBounds.js';
import { WARM_CITIES, warmPlan } from '../src/data/warmCities.js';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4173').replace(/\/$/, '');
const DRY_RUN = argv.includes('--dry-run');
const ONLY = String(getOpt('--only', '')).split(',').map((s) => s.trim()).filter(Boolean);
/**
 * Seconds of silence between two upstream-bound requests.
 *
 * Ten, against a host that starts rate-limiting somewhere above a handful per
 * minute. The run is a weekly 4 a.m. job, so the wall-clock cost of being
 * polite is irrelevant and the cost of not being is a refusing upstream.
 */
const GAP_S = Number(getOpt('--gap-s', '10'));
/**
 * Consecutive failures after which the run stops.
 *
 * Three, because two in a row is a bad cell or a slow minute and three in a row
 * is the host telling us to go away. Continuing past that point cannot warm
 * anything — every later request meets the same refusal — and each attempt
 * pushes the escalation one rung higher for the readers who arrive next.
 */
const GIVE_UP_AFTER = Number(getOpt('--give-up-after', '3'));

const stamp = () => new Date().toISOString();
const log = (msg) => console.log(`[warm ${stamp()}] ${msg}`);
const fail = (msg) => console.error(`[warm ${stamp()}] ${msg}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** One cell, one request. @returns {Promise<boolean>} whether it was served. */
async function warmCell(cell) {
  const { box } = cell;
  const query = buildOverpassQuery(box.south, box.west, box.north, box.east, {
    classes: cell.classes, timeoutSec: cell.timeoutSec,
  });
  const label = `${cell.city} ${cell.band}/${cell.pass}`;
  if (DRY_RUN) {
    log(`  ${label.padEnd(28)} [${box.south},${box.west},${box.north},${box.east}] `
      + `${cell.certainty}, ${query.length} bytes`);
    return true;
  }
  const t0 = Date.now();
  try {
    const res = await fetch(`${APP_URL}/api/overpass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      // Generous: a cold Lyon-sized box was measured at 46 s, and a warmer that
      // gives up early leaves the cell cold AND reports success.
      signal: AbortSignal.timeout(120_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      fail(`  ${label.padEnd(28)} HTTP ${res.status} after ${ms} ms`);
      return false;
    }
    // `x-overpass-cache` is the proxy's own verdict. HIT means somebody warmed
    // it before us, which is fine; MISS is what we came for.
    const cache = res.headers.get('x-overpass-cache') || 'unknown';
    const body = await res.json();
    const ways = Array.isArray(body?.elements) ? body.elements.length : 0;
    if (ways === 0) {
      // A cached nothing is worse than a cold box: it answers in 52 ms and
      // draws an empty city, and nobody would trace that back to a warm run.
      fail(`  ${label.padEnd(28)} served EMPTY after ${ms} ms (cache=${cache})`);
      return false;
    }
    log(`  ${label.padEnd(28)} ${String(ms).padStart(6)} ms  cache=${cache.padEnd(5)} ${ways} elements`);
    return true;
  } catch (e) {
    fail(`  ${label.padEnd(28)} ${e.name} — ${e.message}`);
    return false;
  }
}

(async () => {
  const cities = ONLY.length
    ? WARM_CITIES.filter((c) => ONLY.some((n) => n.toLowerCase() === c.name.toLowerCase()))
    : WARM_CITIES;
  if (ONLY.length && cities.length !== ONLY.length) {
    fail(`--only named ${ONLY.length} cities, ${cities.length} matched — known: `
      + WARM_CITIES.map((c) => c.name).join(', '));
    process.exit(1);
  }
  const plan = warmPlan(cities);
  log(`${cities.length} cities, ${plan.length} cells, ${GAP_S}s apart → ${APP_URL}/api/overpass`);
  log(`worst case ${Math.round((plan.length * (GAP_S + 20)) / 60)} min; gives up after `
    + `${GIVE_UP_AFTER} consecutive failures`);

  let served = 0;
  let failed = 0;
  let streak = 0;
  let abandoned = 0;
  for (const [index, cell] of plan.entries()) {
    if (streak >= GIVE_UP_AFTER) { abandoned = plan.length - index; break; }
    // AFTER the give-up check and BEFORE the request, so a run that stops early
    // does not also sit through a pointless final pause.
    if (index > 0 && !DRY_RUN) await sleep(GAP_S * 1000);
    if (await warmCell(cell)) { served += 1; streak = 0; } else { failed += 1; streak += 1; }
  }

  if (abandoned) {
    fail(`ABANDONED after ${GIVE_UP_AFTER} consecutive failures — ${abandoned} cells not attempted. `
      + 'The upstream is refusing; leave it alone rather than retrying, it decays on its own.');
  }
  log(`${served} served, ${failed} failed, ${abandoned} not attempted`);
  process.exit(failed || abandoned ? 1 : 0);
})();
