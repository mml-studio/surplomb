// src/data/warmCities.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WARM_CITIES,
  WARM_METRO_ALTITUDE_M,
  WARM_STREET_FRAMING,
  warmCellsFor,
  warmPlan,
} from './warmCities.js';
import { defaultViewFetchBox } from '../defaultView.js';
import { roadFetchTier, tierFetchBox } from './trafficBounds.js';

const cityNamed = (name) => WARM_CITIES.find((c) => c.name === name);

// ─── The one cell that can be PROVEN rather than argued ──────────────

test('Paris warms the exact cell the default view asks for', () => {
  // THE FAILURE THIS CATCHES. A warmer that fetches a cell the app never
  // requests looks identical to a working one — same duration, same 200, same
  // "warmed" in the log — and the only symptom is that readers keep paying the
  // cold 0.6-46 s box forever. `defaultViewFetchBox()` is independently pinned
  // against a box captured off the wire (`src/defaultView.test.mjs`), so
  // matching it is the one place this module touches measured ground truth.
  const { box: viaDefaultView } = defaultViewFetchBox();
  const street = warmCellsFor(cityNamed('Paris')).find((c) => c.band === 'street');
  assert.ok(street, 'Paris must produce a street cell');
  assert.deepEqual(street.box, viaDefaultView);
});

test('the street framing is the app house style, or Paris above would drift', () => {
  // Not an import from defaultView.js on purpose — re-aiming the front door
  // must not silently re-aim nine other cities. This is the tripwire for that
  // decoupling: if the two ever diverge, the Paris test above says so first,
  // and this one says WHY.
  assert.equal(WARM_STREET_FRAMING.settleAltitudeM, 600);
  assert.equal(WARM_STREET_FRAMING.pitchDeg, -30);
  assert.equal(WARM_STREET_FRAMING.headingDeg, 315);
});

// ─── The list ────────────────────────────────────────────────────────

test('the ten cities are the six named plus the four next largest', () => {
  assert.equal(WARM_CITIES.length, 10);
  const names = WARM_CITIES.map((c) => c.name);
  for (const named of ['Paris', 'Bordeaux', 'Marseille', 'Biarritz', 'Lyon', 'Lille']) {
    assert.ok(names.includes(named), `${named} was asked for by name`);
  }
  for (const bySize of ['Toulouse', 'Nice', 'Nantes', 'Montpellier']) {
    assert.ok(names.includes(bySize), `${bySize} is one of the four next largest`);
  }
  assert.equal(new Set(names).size, 10, 'a duplicate city would warm one cell twice');
});

test('every city sits inside the French mainland bounding box', () => {
  // A transposed lat/lon warms a cell in the sea and reports success. Cheap to
  // catch, impossible to notice in a log.
  for (const city of WARM_CITIES) {
    assert.ok(city.lat > 41 && city.lat < 51.5, `${city.name} latitude ${city.lat}`);
    assert.ok(city.lon > -5.5 && city.lon < 10, `${city.name} longitude ${city.lon}`);
  }
});

// ─── The plan ────────────────────────────────────────────────────────

test('each city yields metro first, then the two street passes', () => {
  // Metro first is the give-up order: it is the cheap certainty, so when a run
  // is cut short by a refusing upstream the requests that survived are the ones
  // that help every camera framing.
  for (const city of WARM_CITIES) {
    const cells = warmCellsFor(city);
    assert.deepEqual(
      cells.map((c) => `${c.band}/${c.pass}`),
      ['metro/major', 'street/major', 'street/full'],
      city.name,
    );
    assert.equal(cells[0].certainty, 'certain');
    assert.equal(cells[1].certainty, 'framing-dependent');
  }
});

test('the whole plan is 30 cells and keeps city order', () => {
  const plan = warmPlan();
  assert.equal(plan.length, 30, 'ten cities x three cells — the weekly upstream cost');
  assert.deepEqual([...new Set(plan.map((c) => c.city))], WARM_CITIES.map((c) => c.name));
});

test('a narrowed plan only carries the cities asked for', () => {
  const plan = warmPlan([cityNamed('Lyon'), cityNamed('Lille')]);
  assert.equal(plan.length, 6);
  assert.deepEqual([...new Set(plan.map((c) => c.city))], ['Lyon', 'Lille']);
});

// ─── The certainty claim, checked rather than asserted in prose ──────

test('the metro cell really does contain the city centre, for all ten', () => {
  // This is the claim the whole design rests on: whatever framing a reader
  // arrives with, pulled back over the city they land in THIS cell. A 0.30° box
  // centred on the nadir contains its centre by construction — the test is here
  // so that a future change to `snapDeg` or `spanDeg` that breaks it is loud.
  for (const city of WARM_CITIES) {
    const { box } = warmCellsFor(city).find((c) => c.band === 'metro');
    assert.ok(box.south < city.lat && city.lat < box.north, `${city.name} latitude`);
    assert.ok(box.west < city.lon && city.lon < box.east, `${city.name} longitude`);
    // Wider than any of these cities — Marseille, the largest, is ~24 km.
    assert.ok(box.north - box.south >= 0.25, `${city.name} span`);
  }
});

test('the street cell is aimed where the camera LOOKS, not where it sits', () => {
  // This is what makes the street cell framing-dependent, and it is the claim
  // the module's honesty rests on. At 600 m and -30° the look-at point is
  // ~1 040 m from the nadir — about two 555 m lattice steps — so the warmed
  // cell is offset from the one a nadir camera would ask for. If these two ever
  // coincide, the framing has been flattened and the warmer is warming a cell
  // the app does not request.
  for (const city of WARM_CITIES) {
    const street = warmCellsFor(city).find((c) => c.band === 'street');
    const nadir = tierFetchBox({ lat: city.lat, lon: city.lon }, roadFetchTier(600));
    assert.notDeepEqual(street.box, nadir, `${city.name}: framing must move the cell`);
    // And the offset is a couple of lattice steps, not a wild throw: the cell
    // still has to be the one under the reader's eyes.
    const stepsNorth = Math.abs((street.box.south - nadir.south) / roadFetchTier(600).snapDeg);
    assert.ok(stepsNorth <= 3, `${city.name}: ${stepsNorth} lattice steps north is too far`);
    assert.ok(Math.abs((street.box.north - street.box.south) - 0.05) < 1e-9, `${city.name} span`);
  }
});

test('every box is on its band lattice, so two readers share one cache key', () => {
  // The whole scaling argument — cost follows distinct CELLS, not visitors —
  // is only true while the boxes are lattice-aligned. An off-lattice warm cell
  // is a cache entry nobody else will ever hit.
  const onLattice = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
  const stepFor = { metro: roadFetchTier(WARM_METRO_ALTITUDE_M).snapDeg, street: roadFetchTier(600).snapDeg };
  for (const cell of warmPlan()) {
    const step = stepFor[cell.band];
    for (const edge of ['south', 'north', 'west', 'east']) {
      assert.ok(onLattice(cell.box[edge], step), `${cell.city} ${cell.band} ${edge}=${cell.box[edge]}`);
    }
  }
});

test('a cell carries the classes and timeout the layer itself uses', () => {
  // The proxy caches on the query BODY. A warm run with different classes or a
  // different server-side timeout produces a different key and warms nothing,
  // while reporting success.
  const street = roadFetchTier(600);
  const cells = warmCellsFor(cityNamed('Lyon'));
  const major = cells.find((c) => c.band === 'street' && c.pass === 'major');
  const full = cells.find((c) => c.band === 'street' && c.pass === 'full');
  assert.deepEqual(major.classes, street.classes);
  assert.deepEqual(full.classes, street.fullClasses);
  assert.equal(major.timeoutSec, 12);
  assert.equal(full.timeoutSec, 20);
});

test('the metro band has no full pass, and none is invented for it', () => {
  // `ROAD_FETCH_TIERS` gives the metro band `fullClasses: null` — a 33 km box of
  // residential streets is not a query this app ever issues, and warming one
  // would be minutes of upstream work for a cell nobody reads.
  assert.equal(roadFetchTier(WARM_METRO_ALTITUDE_M).fullClasses, null);
  assert.equal(warmPlan().filter((c) => c.band === 'metro' && c.pass === 'full').length, 0);
});
