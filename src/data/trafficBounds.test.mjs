// src/data/trafficBounds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  greatCircleKm,
  deriveFetchCenter,
  clampBoundsAroundCenter,
  normalizeFetchBox,
  boundsOverlap,
  planarDistanceKm,
  roadFetchTier,
  roadRefetchNeeded,
  ROAD_ACTIVATION_ALTITUDE_M,
  ROAD_FETCH_TIERS,
  ROAD_REFETCH_OVERLAP_THRESHOLD,
} from './trafficBounds.js';

// Downtown Austin — matches the TomTom fixture tile neighbourhood.
const NADIR = { lat: 30.2672, lon: -97.7431 };

test('greatCircleKm sanity: Austin -> ~5 km north', () => {
  const d = greatCircleKm(NADIR.lat, NADIR.lon, NADIR.lat + 0.045, NADIR.lon);
  assert.ok(Math.abs(d - 5.0) < 0.1, `got ${d}`);
});

test('straight-down look: hit ~= nadir -> center unchanged (uses hit)', () => {
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: NADIR.lat + 0.0001, hitLon: NADIR.lon - 0.0001,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'hit');
  assert.ok(Math.abs(c.lat - (NADIR.lat + 0.0001)) < 1e-9);
  assert.ok(Math.abs(c.lon - (NADIR.lon - 0.0001)) < 1e-9);
});

test('oblique look within 12 km: uses the hit point verbatim', () => {
  const hit = { lat: NADIR.lat + 0.045, lon: NADIR.lon + 0.02 }; // ~5.3 km away
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'hit');
  assert.equal(c.lat, hit.lat);
  assert.equal(c.lon, hit.lon);
});

test('horizon gaze: far hit is pulled back to 12 km along the bearing', () => {
  // Hit ~100 km due east of nadir.
  const hit = { lat: NADIR.lat, lon: NADIR.lon + 1.041 };
  assert.ok(greatCircleKm(NADIR.lat, NADIR.lon, hit.lat, hit.lon) > 90, 'precondition: far hit');
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'pulled');
  const d = greatCircleKm(NADIR.lat, NADIR.lon, c.lat, c.lon);
  assert.ok(Math.abs(d - 12) < 0.05, `pulled distance ${d} km, expected ~12`);
  // Due-east bearing: latitude stays ~constant, longitude moves east but well
  // short of the hit.
  assert.ok(Math.abs(c.lat - NADIR.lat) < 0.01, `lat drifted: ${c.lat}`);
  assert.ok(c.lon > NADIR.lon && c.lon < hit.lon, `lon not between nadir and hit: ${c.lon}`);
});

test('pull cap is honored for other maxPullKm values', () => {
  const hit = { lat: NADIR.lat + 0.9, lon: NADIR.lon }; // ~100 km north
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 5,
  });
  assert.equal(c.source, 'pulled');
  const d = greatCircleKm(NADIR.lat, NADIR.lon, c.lat, c.lon);
  assert.ok(Math.abs(d - 5) < 0.05, `pulled distance ${d} km, expected ~5`);
});

test('pickEllipsoid failure (non-finite hit): falls back to the camera nadir', () => {
  for (const [hitLat, hitLon] of [[NaN, NaN], [undefined, undefined], [30.3, undefined]]) {
    const c = deriveFetchCenter({
      nadirLat: NADIR.lat, nadirLon: NADIR.lon,
      hitLat, hitLon,
      maxPullKm: 12,
    });
    assert.equal(c.source, 'nadir');
    assert.equal(c.lat, NADIR.lat);
    assert.equal(c.lon, NADIR.lon);
  }
});

test('span clamp: oversized bounds shrink to maxSpan centered on the given center', () => {
  const bounds = { south: 29.5, north: 30.5, west: -98.5, east: -97.5 }; // 1 degree spans
  const center = { lat: NADIR.lat, lon: NADIR.lon };
  const clamped = clampBoundsAroundCenter(bounds, center, 0.05);
  assert.ok(Math.abs((clamped.north - clamped.south) - 0.05) < 1e-12);
  assert.ok(Math.abs((clamped.east - clamped.west) - 0.05) < 1e-12);
  assert.ok(Math.abs((clamped.north + clamped.south) / 2 - center.lat) < 1e-12);
  assert.ok(Math.abs((clamped.east + clamped.west) / 2 - center.lon) < 1e-12);
});

test('span clamp: small bounds keep their span, recentered', () => {
  const bounds = { south: 30.0, north: 30.02, west: -98.0, east: -97.97 };
  const center = { lat: 30.30, lon: -97.70 };
  const clamped = clampBoundsAroundCenter(bounds, center, 0.05);
  assert.ok(Math.abs((clamped.north - clamped.south) - 0.02) < 1e-12);
  assert.ok(Math.abs((clamped.east - clamped.west) - 0.03) < 1e-12);
  assert.ok(Math.abs((clamped.north + clamped.south) / 2 - 30.30) < 1e-12);
  assert.ok(Math.abs((clamped.east + clamped.west) / 2 + 97.70) < 1e-12);
});

test('span clamp is idempotent on already-clamped bounds (loadRoadsForBounds re-clamp)', () => {
  const center = { lat: NADIR.lat, lon: NADIR.lon };
  const once = clampBoundsAroundCenter({ south: 29.5, north: 30.5, west: -98.5, east: -97.5 }, center, 0.05);
  const midpoint = { lat: (once.south + once.north) / 2, lon: (once.west + once.east) / 2 };
  const twice = clampBoundsAroundCenter(once, midpoint, 0.05);
  assert.deepEqual(twice, once);
});

// ─── Altitude bands ───────────────────────────────────────────────────────
// The reason these exist: with one 0.05° box at every altitude, the animated
// roads and the live transit fleet could not share a camera position. Bordeaux
// Métropole is 23 × 26 km; the old box showed 5.5 km of it.

test('each altitude lands in exactly one band, and the boundaries are inclusive', () => {
  assert.equal(roadFetchTier(0)?.id, 'street');
  assert.equal(roadFetchTier(4500)?.id, 'street', 'a boundary belongs to the finer band');
  assert.equal(roadFetchTier(4501)?.id, 'district');
  assert.equal(roadFetchTier(8000)?.id, 'district');
  assert.equal(roadFetchTier(8001)?.id, 'metro');
  assert.equal(roadFetchTier(30000)?.id, 'metro');
});

test('above the coarsest band there is no band at all — the clear signal', () => {
  assert.equal(roadFetchTier(30001), null);
  assert.equal(roadFetchTier(ROAD_ACTIVATION_ALTITUDE_M + 1), null);
  assert.equal(roadFetchTier(NaN), null);
  assert.equal(roadFetchTier(-1), null);
  assert.equal(roadFetchTier(undefined), null);
});

test('the bands coarsen monotonically — box grows, classes shrink', () => {
  for (let i = 1; i < ROAD_FETCH_TIERS.length; i++) {
    const finer = ROAD_FETCH_TIERS[i - 1];
    const coarser = ROAD_FETCH_TIERS[i];
    assert.ok(coarser.maxAltitudeM > finer.maxAltitudeM, `${coarser.id} must sit above ${finer.id}`);
    assert.ok(coarser.spanDeg >= finer.spanDeg, `${coarser.id} must not shrink the box`);
    assert.ok(coarser.pullKm >= finer.pullKm, `${coarser.id} must not tighten the look-at pull`);
    assert.ok(coarser.minShiftKm >= finer.minShiftKm, `${coarser.id} must not re-fetch more eagerly`);
    assert.ok(
      coarser.classes.length <= finer.classes.length,
      `${coarser.id} must not fetch more road classes than ${finer.id}`,
    );
  }
});

test('only the street band fetches the full graph, and it is a superset', () => {
  const [street, ...rest] = ROAD_FETCH_TIERS;
  assert.ok(street.fullClasses, 'street scale draws residential roads');
  for (const cls of street.classes) {
    assert.ok(street.fullClasses.includes(cls), `${cls} must survive into the full pass`);
  }
  for (const tier of rest) {
    assert.equal(tier.fullClasses, null, `${tier.id} must not ask for a full graph`);
  }
});

test('the metro band actually covers a French metropolis', () => {
  // Bordeaux Métropole's observed transit footprint is 0.21° x 0.33°. The band
  // that shows all 460 of its live vehicles has to be at least that wide, or
  // the whole point of raising the ceiling is lost.
  const metro = ROAD_FETCH_TIERS.at(-1);
  assert.ok(metro.spanDeg >= 0.21, `metro box ${metro.spanDeg}° must span Bordeaux`);
  // And the fetch centre must be allowed to sit far enough out to reach the
  // edge of that box at an oblique pitch.
  assert.ok(metro.pullKm >= (metro.spanDeg * 111) / 2);
});

test('the box span follows the band, not a fixed constant', () => {
  const bounds = { south: 44.0, west: -1.0, north: 45.0, east: 0.0 };
  const centre = { lat: 44.8378, lon: -0.5792 };
  const street = clampBoundsAroundCenter(bounds, centre, ROAD_FETCH_TIERS[0].spanDeg);
  const metro = clampBoundsAroundCenter(bounds, centre, ROAD_FETCH_TIERS.at(-1).spanDeg);
  assert.ok(
    (metro.north - metro.south) > (street.north - street.south) * 5,
    'the metro box must be a different order of size, not a nudge',
  );
  assert.ok(Math.abs((street.north + street.south) / 2 - centre.lat) < 1e-9, 'both stay centred');
  assert.ok(Math.abs((metro.north + metro.south) / 2 - centre.lat) < 1e-9);
});

// ─── The re-fetch gate ────────────────────────────────────────────────────

const BORDEAUX = { lat: 44.8378, lon: -0.5792 };
const [STREET] = ROAD_FETCH_TIERS;
const METRO = ROAD_FETCH_TIERS.at(-1);
const boxFor = (tier, centre = BORDEAUX) => clampBoundsAroundCenter(
  { south: -90, west: -180, north: 90, east: 180 }, centre, tier.spanDeg,
);

test('descending a band always re-fetches, however well the boxes overlap', () => {
  // THE REGRESSION THIS PINS. A street box sits entirely inside a metro box
  // centred on the same point: 100% overlap, zero centre shift. Judged on
  // geometry alone the layer would skip the fetch and leave a user at 2 km
  // looking at motorways-only roads fetched for a view 36× wider.
  const metroBox = boxFor(METRO);
  const streetBox = boxFor(STREET);
  assert.ok(
    boundsOverlap(streetBox, metroBox, ROAD_REFETCH_OVERLAP_THRESHOLD),
    'the trap only exists because the finer box IS covered by the coarser one',
  );
  assert.equal(planarDistanceKm(BORDEAUX, BORDEAUX), 0);

  assert.equal(roadRefetchNeeded({
    tier: STREET,
    box: streetBox,
    center: BORDEAUX,
    last: { tierId: METRO.id, bounds: metroBox, center: BORDEAUX },
  }), true);
});

test('holding still inside one band does not re-fetch', () => {
  const box = boxFor(METRO);
  assert.equal(roadRefetchNeeded({
    tier: METRO,
    box,
    center: BORDEAUX,
    last: { tierId: METRO.id, bounds: box, center: BORDEAUX },
  }), false);
});

test('a pan large for the band re-fetches; a pan small for it does not', () => {
  const last = { tierId: METRO.id, bounds: boxFor(METRO), center: BORDEAUX };
  // 1 km is a rounding error at metro scale (minShiftKm 3), and the box still
  // overlaps almost completely.
  const near = { lat: BORDEAUX.lat + 0.009, lon: BORDEAUX.lon };
  assert.ok(planarDistanceKm(near, BORDEAUX) < METRO.minShiftKm);
  assert.equal(roadRefetchNeeded({ tier: METRO, box: boxFor(METRO, near), center: near, last }), false);

  // 20 km is a different city edge.
  const far = { lat: BORDEAUX.lat + 0.18, lon: BORDEAUX.lon };
  assert.equal(roadRefetchNeeded({ tier: METRO, box: boxFor(METRO, far), center: far, last }), true);
});

test('the same pan is small at metro scale and large at street scale', () => {
  // The shift floor is per-band, and this is the reason it has to be.
  const moved = { lat: BORDEAUX.lat + 0.009, lon: BORDEAUX.lon }; // ~1 km
  assert.equal(roadRefetchNeeded({
    tier: METRO,
    box: boxFor(METRO, moved),
    center: moved,
    last: { tierId: METRO.id, bounds: boxFor(METRO), center: BORDEAUX },
  }), false);
  assert.equal(roadRefetchNeeded({
    tier: STREET,
    box: boxFor(STREET, moved),
    center: moved,
    last: { tierId: STREET.id, bounds: boxFor(STREET), center: BORDEAUX },
  }), true);
});

test('with nothing held, the first fetch always happens', () => {
  const box = boxFor(STREET);
  assert.equal(roadRefetchNeeded({ tier: STREET, box, center: BORDEAUX, last: null }), true);
  assert.equal(roadRefetchNeeded({
    tier: STREET, box, center: BORDEAUX, last: { tierId: 'street', bounds: null, center: null },
  }), true);
});

test('disjoint boxes never count as covered', () => {
  const here = boxFor(STREET);
  const elsewhere = boxFor(STREET, { lat: 48.85, lon: 2.35 });
  assert.equal(boundsOverlap(here, elsewhere, ROAD_REFETCH_OVERLAP_THRESHOLD), false);
  assert.equal(boundsOverlap(here, here, 0), true);
});

// ── flowZoom: the band owns the tile zoom because it owns the box ──

test('every road band names the TomTom flow zoom it wants', () => {
  for (const tier of ROAD_FETCH_TIERS) {
    assert.ok(
      Number.isInteger(tier.flowZoom) && tier.flowZoom >= 8 && tier.flowZoom <= 16,
      `${tier.id} has no usable flowZoom`,
    );
  }
});

test('a wider box asks for a coarser flow zoom, never a finer one', () => {
  for (let i = 1; i < ROAD_FETCH_TIERS.length; i++) {
    const finer = ROAD_FETCH_TIERS[i - 1];
    const coarser = ROAD_FETCH_TIERS[i];
    if (coarser.spanDeg > finer.spanDeg) {
      assert.ok(
        coarser.flowZoom < finer.flowZoom,
        `${coarser.id} widens the box to ${coarser.spanDeg}° without coarsening the zoom`,
      );
    }
  }
});

test('no band asks for more than 8 flow tiles at its own span', async () => {
  // The edge rule in front of the hosted origin allows 30 requests per 10 s
  // across ALL of /api, so one viewport's flow must stay a small fraction of
  // it. z12 over the metro band's 0.30° box was 30 tiles on its own.
  const { tilesForBounds } = await import('./tomtomTiles.js');
  for (const tier of ROAD_FETCH_TIERS) {
    const half = tier.spanDeg / 2;
    const tiles = tilesForBounds(
      { south: 48.85 - half, north: 48.85 + half, west: 2.35 - half, east: 2.35 + half },
      tier.flowZoom,
    );
    assert.ok(tiles.length <= 8, `${tier.id}: ${tiles.length} tiles at z${tier.flowZoom}`);
  }
});


// ─── The Overpass cache key ───────────────────────────────────────────────
// A cold road fetch against the hosted origin was measured at 0.6 s to 46 s
// and a repeat of the same query at 65 ms (2026-09-16, from the VPS). Nothing
// repeated, because the box carried the camera pose AND the reader's window
// size into the query body. These tests are that gap.

test('two camera poses inside one lattice cell produce one box', () => {
  const street = ROAD_FETCH_TIERS[0];
  // Same crossroads, ~80 m apart, same viewport: one box, one cache entry.
  // (A lattice has boundaries: two poses either side of one do NOT share, and
  // nothing here pretends otherwise. These sit inside a cell.)
  const a = normalizeFetchBox({ south: 48.8548, north: 48.8852, west: 2.3485, east: 2.3920 }, street);
  const b = normalizeFetchBox({ south: 48.8556, north: 48.8860, west: 2.3495, east: 2.3930 }, street);
  assert.deepEqual(a, b);
  // And a pan the refetch gate WOULD have honoured — minShiftKm is 350 m,
  // under the step — still costs no request at all.
  const panned = normalizeFetchBox({ south: 48.8532, north: 48.8836, west: 2.3475, east: 2.3910 }, street);
  assert.deepEqual(panned, a);
});

test('the box is nudged, not resized: rounding to NEAREST keeps the area', () => {
  // Rounding the span UP — to the band's own span — was measured at 1.9× the
  // area on this very box, 421 roads becoming 1 003. Nearest costs ~2 %.
  const street = ROAD_FETCH_TIERS[0];
  const before = { south: 43.4844, north: 43.5148, west: -1.5709, east: -1.5274 };
  const after = normalizeFetchBox(before, street);
  const area = (b) => (b.north - b.south) * (b.east - b.west);
  const ratio = area(after) / area(before);
  assert.ok(ratio > 0.9 && ratio < 1.1, `area ratio ${ratio.toFixed(3)}`);
});

test('a span rounds to the lattice and never to nothing', () => {
  for (const tier of ROAD_FETCH_TIERS) {
    for (const want of [tier.snapDeg / 100, tier.snapDeg * 0.4, tier.snapDeg * 3.4, tier.spanDeg]) {
      const box = normalizeFetchBox({
        south: 48.85 - want / 2, north: 48.85 + want / 2,
        west: 2.35 - want / 2, east: 2.35 + want / 2,
      }, tier);
      const span = box.north - box.south;
      assert.ok(span >= tier.snapDeg - 1e-9, `${tier.id}: span ${span} below one step`);
      const steps = span / tier.snapDeg;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${tier.id}: span ${span} off the lattice`);
    }
  }
});

test('the near edge never moves in by more than 3/4 of a step', () => {
  // The number `snapDeg` is sized against: half a step from the centre snap
  // plus a quarter from the span rounding down. At street scale, 417 m.
  for (const tier of ROAD_FETCH_TIERS) {
    for (let k = 0; k <= 20; k++) {
      const lat = 48.85 + (k / 20) * tier.snapDeg;
      const lon = 2.35 + (k / 20) * tier.snapDeg;
      const want = tier.spanDeg * 0.6;
      const after = normalizeFetchBox({
        south: lat - want / 2, north: lat + want / 2,
        west: lon - want / 2, east: lon + want / 2,
      }, tier);
      const limit = tier.snapDeg * 0.75 + 1e-9;
      assert.ok(after.south - (lat - want / 2) <= limit, `${tier.id} south edge`);
      assert.ok((lat + want / 2) - after.north <= limit, `${tier.id} north edge`);
      assert.ok(after.west - (lon - want / 2) <= limit, `${tier.id} west edge`);
      assert.ok((lon + want / 2) - after.east <= limit, `${tier.id} east edge`);
    }
  }
});

test('the box is a stable STRING, not merely an equal number', () => {
  // The cache key is the query body, so float drift is a cache miss even when
  // the boxes are arithmetically the same. Five decimals is ~1.1 m.
  const street = ROAD_FETCH_TIERS[0];
  const box = normalizeFetchBox({ south: 48.8531, north: 48.8835, west: 2.3489, east: 2.3924 }, street);
  for (const v of [box.south, box.north, box.west, box.east]) {
    assert.ok(/^-?\d+(\.\d{1,5})?$/.test(String(v)), `${v} is not a short decimal`);
  }
});

test('re-normalising never moves the box — the load path does it twice', () => {
  for (const tier of ROAD_FETCH_TIERS) {
    let box = normalizeFetchBox({ south: 43.2711, north: 43.3219, west: 5.3448, east: 5.3948 }, tier);
    const first = { ...box };
    for (let i = 0; i < 5; i++) box = normalizeFetchBox(box, tier);
    assert.deepEqual(box, first, tier.id);
  }
});

test('a band with no lattice is left exactly as it was', () => {
  const box = { south: 1.23456789, north: 1.3, west: 4.5, east: 4.6 };
  assert.equal(normalizeFetchBox(box, { spanDeg: 0.05 }), box);
  assert.equal(normalizeFetchBox(box, null), box);
});
