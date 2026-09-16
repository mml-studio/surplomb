#!/usr/bin/env node
/**
 * warm-default-view.mjs — pay the default view's cold Overpass box once a week
 * so that no reader ever does.
 *
 * ── The number this exists for ────────────────────────────────────────────
 * A cold road fetch costs 0.6 to 46 s (measured 2026-09-16 against the hosted
 * origin from the VPS: Lyon 46.4 s, Paris arterials 17.8 s, Marseille 6.1 s,
 * Bordeaux 2.7 s). The same query repeated costs 52 to 78 ms. The proxy holds
 * Overpass answers on disk for 7 days.
 *
 * So somebody pays the cold box roughly once a week, and today it is whoever
 * happens to arrive first — on the one view every single visitor lands on,
 * with nothing on screen while they wait.
 *
 * ── Why this is ONE request pair and not five ─────────────────────────────
 * Because the box stopped depending on the reader. `tierFetchBox` puts it at
 * the band's own span on the band's lattice, so the default view is a single
 * Overpass key — `scripts/qa-span-par-viewport.mjs` measures one key across
 * eleven window sizes, where the previous chain produced five.
 *
 * ── Why there is no browser here, and what replaces it ────────────────────
 * The first version of this drove the real app in headless Chrome, on the
 * argument that a crafted request rots silently: the box comes from the
 * camera's look-at point, which comes from the default view's altitude, pitch
 * and heading, and the day any of those changes a crafted warmer keeps warming
 * a cell nobody visits — with nothing to notice, because a useless request
 * looks exactly like a useful one.
 *
 * That argument was right about the risk and wrong about the remedy. A browser
 * on the VPS means a Chrome and its ~150 MB of shared libraries in the image
 * for a weekly cron — and the container's bundled Chrome does not even start
 * (`libglib-2.0.so.0: cannot open shared object file`, measured 2026-09-16).
 *
 * The rot is prevented where rot belongs: in a test. `defaultViewFetchBox()`
 * derives the box from `DEFAULT_CITY_VIEW` and the band table, and
 * `src/defaultView.test.mjs` pins it against the box captured OFF THE WIRE.
 * Move the default view, change a `snapDeg`, and CI fails by name instead of
 * a cron quietly warming the wrong cell forever.
 *
 * ── What it asks for ──────────────────────────────────────────────────────
 * Both passes, exactly as the layer does: the arterials first, then the full
 * graph, same classes, same server-side timeouts, same form encoding. The
 * proxy caches on the query BODY, so anything less than byte-identical warms
 * nothing.
 *
 *   node scripts/warm-default-view.mjs --url http://localhost:4173
 *   # crontab: 17 4 * * 1  (weekly, well inside the 7-day TTL)
 *
 * Run it from the VPS against the container, not through the edge: Cloudflare
 * caps `/api` at 30 requests per 10 s per IP, and there is nothing at the edge
 * this needs to touch.
 *
 * Exits 0 when both passes were served, 1 otherwise — so a cron mail means
 * something.
 */

import { buildOverpassQuery } from '../src/data/trafficBounds.js';
import { defaultViewFetchBox, DEFAULT_CITY_VIEW } from '../src/defaultView.js';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4173').replace(/\/$/, '');
const DRY_RUN = argv.includes('--dry-run');

const stamp = () => new Date().toISOString();
const log = (msg) => console.log(`[warm ${stamp()}] ${msg}`);

/**
 * The two passes the layer runs, with the timeouts `fetchRoads` gives them.
 *
 * Both, and in this order, because both are cached separately and the reader
 * waits for whichever is slower. Warming only the arterials would leave the
 * full graph — the one that actually draws the streets — cold.
 */
function passesFor(tier) {
  const passes = [{ name: 'major', classes: tier.classes, timeoutSec: 12 }];
  if (tier.fullClasses) passes.push({ name: 'full', classes: tier.fullClasses, timeoutSec: 20 });
  return passes;
}

(async () => {
  const { tier, center, box } = defaultViewFetchBox();
  if (!box) {
    console.error(`[warm ${stamp()}] no band for the default view — nothing to warm`);
    process.exit(1);
  }
  const key = `${box.south},${box.west},${box.north},${box.east}`;
  log(`${DEFAULT_CITY_VIEW.label} @ ${DEFAULT_CITY_VIEW.settleAltitudeM} m — band ${tier.id}, `
    + `look-at ${center.lat.toFixed(5)},${center.lon.toFixed(5)}`);
  log(`cell ${key} → ${APP_URL}/api/overpass`);

  let failures = 0;
  for (const pass of passesFor(tier)) {
    const query = buildOverpassQuery(box.south, box.west, box.north, box.east, {
      classes: pass.classes, timeoutSec: pass.timeoutSec,
    });
    if (DRY_RUN) {
      log(`  ${pass.name}: would POST ${query.length} bytes — ${query}`);
      continue;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${APP_URL}/api/overpass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        // Generous: a cold Lyon-sized box was measured at 46 s, and a warmer
        // that gives up early leaves the cell cold AND reports success.
        signal: AbortSignal.timeout(120000),
      });
      const ms = Date.now() - t0;
      if (!res.ok) {
        failures += 1;
        console.error(`[warm ${stamp()}]   ${pass.name}: HTTP ${res.status} after ${ms} ms`);
        continue;
      }
      // `x-overpass-cache` is the proxy's own verdict. HIT on a first run means
      // somebody warmed it before us, which is fine; MISS is what we came for.
      const cache = res.headers.get('x-overpass-cache') || 'unknown';
      const body = await res.json();
      const ways = Array.isArray(body?.elements) ? body.elements.length : 0;
      log(`  ${pass.name}: ${ms} ms, cache=${cache}, ${ways} elements`);
      if (ways === 0) {
        failures += 1;
        console.error(`[warm ${stamp()}]   ${pass.name}: served EMPTY — a cached nothing is worse `
          + 'than a cold box, since it answers fast and draws nothing');
      }
    } catch (e) {
      failures += 1;
      console.error(`[warm ${stamp()}]   ${pass.name}: ${e.name} — ${e.message}`);
    }
  }

  if (DRY_RUN) process.exit(0);
  if (failures) {
    console.error(`[warm ${stamp()}] NOT WARMED — ${failures} pass(es) failed`);
    process.exit(1);
  }
  log('warmed');
  process.exit(0);
})();
