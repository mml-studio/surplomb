// The French shared-mobility layer's presentation contract.
//
// The property this layer has to keep straight is that it draws an INVENTORY,
// not a track: GBFS never publishes a vehicle during a rental, so the card
// must say what it is looking at and must date the vehicle's own report rather
// than the poll. The rest is the usual honesty: an unknown count is not zero,
// and a viewport too wide to answer is refused rather than cropped.
//
// It also has to keep TWO CHANNELS straight, because a Paris street holds
// several operators running several kinds of vehicle at once: shape says what
// an object is, colour says who runs it, and a station's fill stays spent on
// the one number a person acts on — how full it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import sharedMobilityFranceLayer, {
  buildSharedMobilitySelectionLabel,
  cameraSharedMobilityBox,
  createSharedMobilitySelectedOverlayEntry,
  sharedMobilityOperator,
  stationColor,
  stationFillLevel,
  stationPointSize,
  vehicleKindLabel,
  vehicleKindPlural,
  matchesKindFilter,
  stationFamilies,
  stationHoldsBikes,
  stationTitle,
  _clearSharedMobilitySelectionForTest,
  _reanchorSharedMobilityForTest,
  _selectSharedMobilityObjectForTest,
  _setSharedMobilityPayloadForTest,
  _setSharedMobilityStateForTest,
  _refreshSharedMobilityPinsForTest,
  _refreshSharedMobilityBubblesForTest,
  _sharedMobilityPinGeometryForTest,
  SHARED_MOBILITY_KIND_FILTERS,
  SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID,
  SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS,
} from './sharedMobilityFrance.js';
import { reportMeshFloorCell, setMeshFloorPreferred } from './groundFloor.js';
import { GBFS_MAX_BOX_DEG, gbfsClusterCellKey } from './gbfsFeeds.js';
import { resolveMobilityOperator } from './mobilityOperators.js';
import { sharedMobilityPinGlyph } from './sharedMobilityIcons.js';
import {
  _resetMobilityDockBridgeForTest,
  mobilityDocksGrouped,
  publishMobilityDocks,
} from './mobilityDockBridge.js';
import { SHARED_MOBILITY_PIN_SPACING_PX } from './sharedMobilityPins.js';

function viewerWithView(degrees) {
  return {
    camera: {
      computeViewRectangle: () => (degrees ? Cesium.Rectangle.fromDegrees(
        degrees.west, degrees.south, degrees.east, degrees.north,
      ) : undefined),
    },
    entities: { remove() {} },
  };
}

function vehicleRecord(overrides = {}) {
  const object = {
    id: 'gbfs-84153:abc',
    system: 'gbfs-84153',
    lat: 48.8875,
    lon: 2.3042,
    kind: 'ebike',
    rangeMeters: 13102,
    lastReported: 1787812339,
    ...(overrides.object || {}),
  };
  const system = { id: 'gbfs-84153', name: 'Lime Paris', licence: 'Licence Ouverte 2.0', ...(overrides.system || {}) };
  const operator = resolveMobilityOperator(system.name);
  return {
    id: object.id,
    type: 'vehicle',
    object,
    system,
    operator,
    position: Cesium.Cartesian3.fromDegrees(object.lon, object.lat, 12),
    // A vehicle is a dot in its operator's hue; its silhouette rides a pin,
    // and only a few of them get one.
    point: { color: null, pixelSize: 0, show: true },
    pin: null,
    pinRank: 0,
    baseColor: operator.color,
    baseSize: 6,
  };
}

function stationRecord(overrides = {}) {
  const object = {
    id: 'gbfs-1:42',
    system: 'gbfs-1',
    lat: 47.21,
    lon: -1.55,
    name: 'Commerce',
    available: 7,
    docks: 4,
    capacity: 11,
    renting: true,
    byKind: { bike: 5, ebike: 2 },
    ...(overrides.object || {}),
  };
  const system = { id: 'gbfs-1', name: 'Naolib Nantes', licence: 'ODbL 1.0', ...(overrides.system || {}) };
  return {
    id: object.id,
    type: 'station',
    object,
    system,
    operator: resolveMobilityOperator(system.name),
    position: Cesium.Cartesian3.fromDegrees(object.lon, object.lat, 12),
    point: { color: null, pixelSize: 0, show: true },
    baseColor: stationColor(object),
    baseSize: stationPointSize(object),
  };
}

test('the camera gate answers a city view and refuses a regional one', () => {
  const paris = { south: 48.84, west: 2.30, north: 48.88, east: 2.38 };
  const box = cameraSharedMobilityBox(viewerWithView(paris));
  assert.ok(Math.abs(box.south - paris.south) < 1e-6);
  assert.equal(cameraSharedMobilityBox(viewerWithView({ south: 43, west: -2, north: 50, east: 6 })), null);
  assert.equal(cameraSharedMobilityBox(viewerWithView(null)), null);
  assert.equal(cameraSharedMobilityBox(null), null);
  assert.ok(cameraSharedMobilityBox(viewerWithView({
    south: 44, west: 0, north: 44 + GBFS_MAX_BOX_DEG - 0.001, east: 1,
  })));
});

test('every vehicle kind pins a distinct silhouette and keeps a readable label', () => {
  // The dot is spent on the OPERATOR, so the kind has to survive on the pin's
  // shape alone. A shared glyph between two kinds would silently merge them.
  const kinds = ['bike', 'ebike', 'scooter', 'moped', 'car', 'other'];
  const glyphs = kinds.map((kind) => sharedMobilityPinGlyph(kind, { color: '#b6f03c' }));
  assert.equal(new Set(glyphs).size, kinds.length);
  assert.ok(glyphs.every((glyph) => glyph.startsWith('data:image/svg+xml;base64,')));
  assert.equal(vehicleKindLabel('ebike'), 'VAE');
  // The false friend, pinned: GBFS `scooter` is the kick one — a trottinette —
  // and GBFS `moped` is the seated one a French reader calls a scooter.
  assert.equal(vehicleKindLabel('scooter'), 'Trottinette');
  assert.equal(vehicleKindLabel('moped'), 'Scooter');
  // Agreement, and the acronym that does not take an -s.
  assert.equal(vehicleKindPlural('bike', 4), 'Vélos');
  assert.equal(vehicleKindPlural('bike', 1), 'Vélo');
  assert.equal(vehicleKindPlural('ebike', 4), 'VAE');
  // An unmapped kind is shown verbatim, not silently relabelled.
  assert.equal(vehicleKindLabel('funicular'), 'funicular');
});

test('the operator is read from the system title, and shared with the bikeshare layer', () => {
  // The user-visible promise: Vélib' is not Voi is not Lime.
  const velib = resolveMobilityOperator("Vélib' Métropole");
  const voi = resolveMobilityOperator('Voi Paris');
  const lime = resolveMobilityOperator('Lime Paris');
  assert.equal(new Set([velib.color, voi.color, lime.color]).size, 3);
  assert.equal(lime.label, 'Lime');
  // Resolved off the record's own system, so a record built without a cached
  // operator still paints and still names the right one.
  assert.equal(sharedMobilityOperator(vehicleRecord()).id, 'lime');
  assert.equal(sharedMobilityOperator({ system: { name: 'Dott Paris' } }).id, 'dott');
  assert.equal(sharedMobilityOperator({}).id, 'unknown');
});

test('a station with no availability data is neutral, not empty', () => {
  // "We do not know" and "there are no bikes" are different facts, and only
  // the second one is actionable for someone deciding where to walk.
  assert.equal(stationFillLevel({ available: null, capacity: 20 }), 'unknown');
  assert.equal(stationFillLevel({ available: 0, capacity: 20 }), 'low');
  const unknown = stationColor({ available: null, capacity: 20 }, '#4fd94f');
  const empty = stationColor({ available: 0, capacity: 20 }, '#4fd94f');
  assert.notEqual(unknown, empty);
  // The level is the ring's own hue poured in: a full Clem' dock is Clem'
  // emerald, never the green of another operator.
  assert.equal(stationColor({ available: 20, capacity: 20 }, '#1fcf94'), 'rgba(31,207,148,1)');
  assert.match(empty, /^rgba\(79,217,79,0\.1\)$/);
  assert.equal(stationColor({ available: 18, capacity: 20 }), stationColor({ available: 20, capacity: 20 }));
  assert.notEqual(stationColor({ available: 1, capacity: 20 }), stationColor({ available: 18, capacity: 20 }));
  // A closed station reads closed whatever it holds.
  assert.equal(stationColor({ available: 18, capacity: 20, renting: false }),
    stationColor({ available: 0, capacity: 20, renting: false }));
  // Size never collapses to nothing when capacity is missing.
  assert.ok(stationPointSize({ capacity: null }) > 0);
  assert.ok(stationPointSize({ capacity: 60 }) > stationPointSize({ capacity: 5 }));
});

test('a vehicle card dates the operator\'s own report and says what it is looking at', () => {
  const record = vehicleRecord();
  const lines = buildSharedMobilitySelectionLabel(record, 1787812399000).split('\n');
  // Whose it is leads the card: the glyph on screen is Lime-coloured, and
  // this is where that hue gets a name.
  assert.equal(lines[0], 'VAE Lime');
  assert.equal(lines[1], '🔋 13,1 km d’autonomie');
  // 60 s after the vehicle reported — not 60 s after the layer polled.
  assert.equal(lines[2], '⏱ position il y a 60 s');
  assert.equal(lines[3], '🅿️ Lime Paris');
  // The card stops there. « Garé et disponible » is true of every glyph on
  // screen, so it belongs to the legend once and not to each card; the licence
  // of the FEED is not a fact about this scooter at all.
  assert.equal(lines.length, 4);
});

test('a station card prints the counts and the per-kind split it was given', () => {
  const lines = buildSharedMobilitySelectionLabel(stationRecord()).split('\n');
  assert.equal(lines[0], 'Commerce');
  assert.equal(lines[1], '🚲 7 vélos disponibles sur 11 places · 4 bornes libres');
  assert.equal(lines[2], 'dont 5 mécaniques et 2 VAE');
  assert.equal(lines[3], '🅿️ Naolib Nantes');
  assert.equal(lines.length, 4);

  // One kind that accounts for the whole count names itself on the first line,
  // and the split disappears — printing « 1 VAE » twice was the card spending
  // two lines on one fact.
  const solo = buildSharedMobilitySelectionLabel(stationRecord({
    object: {
      name: null, virtual: true, available: 1, docks: null, capacity: null, byKind: { ebike: 1 },
    },
    system: { name: 'Pony Pays Basque' },
  })).split('\n');
  assert.deepEqual(solo, ['Aire Pony', '🚲 1 VAE disponible', '🅿️ Pony Pays Basque']);

  // A car-share station gets the car badge: a bike over a Citiz dock would be
  // a picture of the wrong vehicle.
  const cars = buildSharedMobilitySelectionLabel(stationRecord({
    object: { name: 'Gare', available: 2, docks: null, capacity: null, byKind: { car: 2 } },
    system: { name: 'Citiz Nantes' },
  })).split('\n');
  assert.equal(cars[1], '🚗 2 voitures disponibles');

  // A painted bay has no dock to lock into: what is free there is a place.
  const bay = buildSharedMobilitySelectionLabel(stationRecord({
    object: { name: 'Mairie', virtual: true, available: 2, docks: 3, capacity: 5, byKind: { bike: 2 } },
  })).split('\n');
  assert.equal(bay[1], '🚲 2 vélos disponibles sur 5 places · 3 places libres');

  // A network name that only echoes the operator already in the title costs a
  // line and says nothing, so it is dropped.
  const echo = buildSharedMobilitySelectionLabel(stationRecord({
    object: { name: null, virtual: true, available: 1, docks: null, capacity: null, byKind: { bike: 1 } },
    system: { name: 'Pony' },
  })).split('\n');
  assert.deepEqual(echo, ['Aire Pony', '🚲 1 vélo disponible']);
});

test('a nameless bay is called by its operator, never by its primary key', () => {
  // Pony publishes `station_id` in the `name` field, so `gbfsFeeds.js` drops
  // the echo and the dot arrives here nameless. What is still KNOWN is who
  // runs it and that it is a painted bay, not a dock — so that is what the
  // card and the HUD label say.
  const bay = stationRecord({
    object: { name: null, virtual: true, available: 3 },
    system: { name: 'Pony Pays Basque' },
  });
  assert.equal(stationTitle(bay), 'Aire Pony');
  assert.equal(buildSharedMobilitySelectionLabel(bay).split('\n')[0], 'Aire Pony');

  // A nameless PHYSICAL dock is a station, and says so.
  const dock = stationRecord({ object: { name: null, virtual: false }, system: { name: 'Pony Pays Basque' } });
  assert.equal(stationTitle(dock), 'Station Pony');

  // A network name the PAN publishes is a fact too, curated brand or not.
  assert.equal(stationTitle(stationRecord({ object: { name: null }, system: { name: 'Naolib Nantes' } })), 'Station Naolib');
  // With no operator to name either, the bare noun — never an invented brand.
  assert.equal(stationTitle(stationRecord({ object: { name: null }, system: { name: null } })), 'Station');

  // A published name always wins — refusing the echo must not cost a toponym.
  assert.equal(stationTitle(stationRecord({ object: { name: 'Gare de Bayonne', virtual: true } })), 'Gare de Bayonne');
});

test('missing values are omitted rather than filled in', () => {
  const bare = vehicleRecord({
    object: { kind: 'bike', rangeMeters: null, lastReported: null },
    system: { name: null, licence: null },
  });
  const lines = buildSharedMobilitySelectionLabel(bare).split('\n');
  assert.deepEqual(lines, ['Vélo']);

  const closed = stationRecord({
    object: { name: null, available: null, docks: null, capacity: null, byKind: null, renting: false },
    system: { name: null },
  });
  const closedLines = buildSharedMobilitySelectionLabel(closed).split('\n');
  assert.equal(closedLines[0], 'Station');
  assert.ok(closedLines.includes('⚠️ Location suspendue'));
  // « on ne sait pas » and « il n'y a rien » are different facts, and the card
  // states the first rather than printing a zero it was never given.
  assert.ok(closedLines.includes('Inventaire non publié'));
});

test('the selected entry takes the protected lane, and the source is a static one', () => {
  const record = vehicleRecord();
  const entry = createSharedMobilitySelectedOverlayEntry(record, 1787812399000);
  assert.equal(entry.id, record.id);
  assert.equal(entry.position, record.position);
  assert.equal(entry.title, 'VAE Lime');
  assert.equal(entry.protected, true);
  assert.equal(entry.paintLane, 'selected');
  assert.equal(entry.horizonCull, true);
  assert.equal(createSharedMobilitySelectedOverlayEntry({ id: 'x' }), null);
  // A parked vehicle does not move, so the host may cache its screen rect.
  assert.equal(SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS.moving, false);
  assert.equal(SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS.cohortLimit, 1);
});

test('selecting and clearing drives the real host seam and restores the point', () => {
  const record = vehicleRecord();
  const calls = [];
  const host = {
    setEntries: (...args) => calls.push(['set', ...args]),
    setVisible: (...args) => calls.push(['visible', ...args]),
    clearSource: (...args) => calls.push(['clear', ...args]),
  };
  _setSharedMobilityStateForTest({ viewer: viewerWithView(null), records: [record], overlayHost: host });

  _selectSharedMobilityObjectForTest(record.id);
  const set = calls.find((call) => call[0] === 'set');
  assert.equal(set[1], SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID);
  assert.equal(set[2][0].id, record.id);
  assert.equal(record.point.color.toCssHexString(), '#00ffff');
  assert.ok(record.point.pixelSize > record.baseSize);

  _clearSharedMobilitySelectionForTest();
  assert.ok(calls.some((call) => call[0] === 'clear' && call[1] === SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID));
  // Restored to the OPERATOR's colour — the channel survives a selection.
  assert.equal(record.point.color.toCssHexString(), resolveMobilityOperator('Lime Paris').color);
  assert.equal(record.point.pixelSize, record.baseSize);
});

// --- The key: « Mobilités partagées » ----------------------------------------
//
// Adopted 2026-09-21 from a mock Memel liked: a segmented control by family,
// then the operators as dots WITH their names. Everything is counted from the
// viewport answer, on screen, and with what a filter hides still counted.

const PARIS_SYSTEMS = [
  { id: 'lime', name: 'Lime Paris' },
  { id: 'dott', name: 'Dott Paris' },
  { id: 'yego', name: 'YEGO Paris' },
  { id: 'clem', name: 'Clem' },
];

/** A Paris-like answer: e-bikes from two operators, a YEGO moped, a Clem' car dock. */
function parisPayload() {
  return {
    systems: PARIS_SYSTEMS,
    vehicles: [
      { id: 'lime:1', system: 'lime', kind: 'ebike', lat: 48.86, lon: 2.35 },
      { id: 'lime:2', system: 'lime', kind: 'ebike', lat: 48.861, lon: 2.351 },
      { id: 'dott:1', system: 'dott', kind: 'ebike', lat: 48.862, lon: 2.352 },
      { id: 'yego:1', system: 'yego', kind: 'moped', lat: 48.863, lon: 2.353 },
    ],
    stations: [
      { id: 'clem:1', system: 'clem', lat: 48.864, lon: 2.354, available: 1, capacity: 1, byKind: { car: 1 } },
    ],
  };
}

/** Puts the layer back on the whole fleet, whatever a test before it pressed. */
function clearKindFilter() {
  _setSharedMobilityPayloadForTest(null);
  sharedMobilityFranceLayer.setParams({ kinds: 'all', operator: 'all' });
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
}

test('the key is a family control, then the operators by name — no channel captions', () => {
  clearKindFilter();
  _setSharedMobilityPayloadForTest(parisPayload());
  const { chips, legend, legendSegments, legendScope } = sharedMobilityFranceLayer.getRowControls();

  // The filter moved from the row into the key: one control, not two.
  assert.deepEqual(chips, []);
  // A segment per family ON SCREEN — no « Trottinettes » over Paris.
  assert.deepEqual(legendSegments.map((segment) => [segment.label, segment.active]), [
    ['Tous', true], ['Vélos', false], ['Scooters', false], ['Voitures', false],
  ]);
  assert.equal(legendSegments[0].toggle, null, 'the lit « Tous » is where the reader already is');
  assert.deepEqual(legendSegments[2].toggle, { param: 'kinds', value: 'scooter', fanOut: true });
  assert.match(legendSegments[1].title, /3 à l’écran/, 'three e-bikes, counted');

  const operators = legend.filter((item) => item.channel === 'Fournisseurs');
  assert.deepEqual(operators.map((item) => [item.label, item.count]), [
    ['Lime', 2], ['Clem\'', 1], ['Dott', 1], ['YEGO', 1],
  ]);
  const lime = operators[0];
  assert.equal(lime.color, resolveMobilityOperator('Lime Paris').color, 'the dot IS the colour on the map');
  assert.equal(lime.glyph, undefined, 'a plain dot and a name, as in the mock');
  assert.deepEqual(lime.toggle, { param: 'operator', value: 'lime', fanOut: true });
  assert.equal(lime.off, false);
  assert.match(lime.blurb, /^Ne montrer que Lime — 2 ici$/);

  // A dock on screen, so its fill is explained — and only its fill.
  assert.deepEqual(legend.filter((item) => item.channel === 'Stations').map((item) => item.label),
    ['bien remplie', 'à moitié', 'presque vide']);
  assert.equal(legend.length, operators.length + 3, 'no shape rows, no « compté deux fois »');
  assert.equal(legendScope.inView, 5);
  clearKindFilter();
});

test('one family on screen needs no control, and no dock needs no fill key', () => {
  clearKindFilter();
  _setSharedMobilityPayloadForTest({
    systems: PARIS_SYSTEMS,
    vehicles: [{ id: 'lime:1', system: 'lime', kind: 'ebike', lat: 48.86, lon: 2.35 }],
    stations: [],
  });
  const { legend, legendSegments } = sharedMobilityFranceLayer.getRowControls();
  assert.deepEqual(legendSegments, []);
  assert.deepEqual(legend.map((item) => item.label), ['Lime']);
  clearKindFilter();
});

test('the key counts the screen, not the margin the proxy added around it', () => {
  clearKindFilter();
  _setSharedMobilityPayloadForTest(parisPayload());
  // A screen that holds the two Lime bikes and nothing else.
  _setSharedMobilityStateForTest({
    viewer: viewerWithView({ south: 48.8595, west: 2.3495, north: 48.8615, east: 2.3515 }),
    records: [],
  });
  const { legend, legendScope } = sharedMobilityFranceLayer.getRowControls();
  assert.deepEqual(legend.map((item) => [item.label, item.count]), [['Lime', 2]]);
  assert.equal(legendScope.inView, 2);
  clearKindFilter();
});

test('a crowded viewport names six operators and declares the tail it did not name', () => {
  // Silently dropping the seventh would read as "these are the operators here".
  clearKindFilter();
  const names = ['Lime Paris', 'Dott Paris', 'Voi Paris', 'Pony Paris', 'Bird Paris',
    'Citiz Paris', 'Cityscoot Paris', 'YEGO Paris'];
  _setSharedMobilityPayloadForTest({
    systems: names.map((name, index) => ({ id: `s${index}`, name })),
    stations: [],
    vehicles: names.flatMap((name, index) => Array.from(
      { length: names.length - index },
      (unused, copy) => ({ id: `${index}:${copy}`, system: `s${index}`, kind: 'ebike', lat: 48.86, lon: 2.35 }),
    )),
  });
  const operatorRows = sharedMobilityFranceLayer.getRowControls().legend
    .filter((item) => item.channel === 'Fournisseurs');
  assert.equal(operatorRows.length, 7, 'six named operators plus one tail row');
  assert.deepEqual(operatorRows.slice(0, 6).map((item) => item.label),
    ['Lime', 'Dott', 'Voi', 'Pony', 'Bird', 'Citiz']);
  const tail = operatorRows[6];
  assert.equal(tail.label, '+2 fournisseurs');
  assert.equal(tail.toggle, undefined, 'the tail stands for several operators and focuses none');
  assert.equal(tail.count, 2 + 1, 'the tail counts the objects it stands for');
  assert.match(tail.blurb, /Cityscoot/);
  assert.match(tail.blurb, /YEGO/);
  clearKindFilter();
});

test('every named kind has exactly one family, and an unnamed one has none', () => {
  const familiesOf = (kind) => SHARED_MOBILITY_KIND_FILTERS
    .filter((filter) => matchesKindFilter(filter.id, 'vehicle', { kind }))
    .map((filter) => filter.id);
  assert.deepEqual(familiesOf('bike'), ['velo']);
  assert.deepEqual(familiesOf('ebike'), ['velo'], 'a VAE is a bike: « Vélos » cannot hide half of them');
  assert.deepEqual(familiesOf('scooter'), ['trottinette'], 'GBFS scooter is the kick one');
  assert.deepEqual(familiesOf('moped'), ['scooter'], 'GBFS moped is what a French reader calls a scooter');
  assert.deepEqual(familiesOf('car'), ['voiture']);
  assert.deepEqual(familiesOf('other'), [], 'drawn under « Tous » and filed nowhere else');
  // No filter is not a state to test for — it keeps everything.
  assert.ok(matchesKindFilter(null, 'vehicle', { kind: 'other' }));
  assert.ok(matchesKindFilter(null, 'station', { byKind: { car: 3 } }));
});

test('a station is filed by what it holds, and an unreadable inventory reads as bikes', () => {
  assert.deepEqual([...stationFamilies({ byKind: { bike: 5, ebike: 2 } })], ['velo']);
  assert.deepEqual([...stationFamilies({ byKind: { car: 3 } })], ['voiture']);
  assert.deepEqual([...stationFamilies({ byKind: { scooter: 2, moped: 1 } })].sort(), ['scooter', 'trottinette']);
  // A dock whose bike count is zero still HOLDS bikes — unless something else
  // is declared in it, in which case that is what it is for.
  assert.deepEqual([...stationFamilies({ byKind: { bike: 0, car: 2 } })], ['voiture']);
  assert.equal(stationHoldsBikes({ byKind: { bike: 0 } }), true);
  // GBFS 3.0 opaque ids the proxy could not resolve, or no breakdown at all:
  // the spec default, bikes.
  assert.equal(stationHoldsBikes({ byKind: { 'vt-9f3a': 12 } }), true);
  assert.equal(stationHoldsBikes({ byKind: null }), true);
  assert.equal(stationHoldsBikes({}), true);
  assert.ok(matchesKindFilter('voiture', 'station', { byKind: { car: 1 } }));
  assert.ok(!matchesKindFilter('velo', 'station', { byKind: { car: 1 } }), 'a Clem\' car dock is not under « Vélos »');
});

test('pressing a segment or an operator filters, pressing it again releases', () => {
  clearKindFilter();
  assert.equal(sharedMobilityFranceLayer.setParams({ kinds: 'scooter' }), true);
  assert.equal(sharedMobilityFranceLayer.setParams({ operator: 'yego' }), true);
  assert.deepEqual(sharedMobilityFranceLayer.getParams(), { kinds: 'scooter', operator: 'yego' });
  // Replaying a value changes nothing: the release is a VALUE, not a repeat.
  assert.equal(sharedMobilityFranceLayer.setParams({ kinds: 'scooter' }), false);

  _setSharedMobilityPayloadForTest(parisPayload());
  const { legend, legendSegments, legendScope } = sharedMobilityFranceLayer.getRowControls();
  const lit = legendSegments.find((segment) => segment.active);
  assert.equal(lit.label, 'Scooters');
  assert.deepEqual(lit.toggle, { param: 'kinds', value: 'all', fanOut: true });
  assert.deepEqual(legendSegments[0].toggle, { param: 'kinds', value: 'all', fanOut: true });
  const yego = legend.find((item) => item.label === 'YEGO');
  assert.deepEqual(yego.toggle, { param: 'operator', value: 'all', fanOut: true });
  assert.equal(yego.off, false);
  assert.match(yego.blurb, /Appuyer à nouveau/);
  // Faceted: the other operators are counted under the family filter — none
  // of them has a scooter, so they are not listed at all.
  assert.deepEqual(legend.filter((item) => item.channel === 'Fournisseurs').map((item) => item.label), ['YEGO']);
  assert.equal(legend.some((item) => item.action), false, 'YEGO\'s own line is the way back');
  assert.equal(legendScope.inView, 1);

  _setSharedMobilityPayloadForTest(null);
  // All or nothing: one refused value leaves both filters where they were.
  assert.equal(sharedMobilityFranceLayer.setParams({ kinds: 'velo', operator: 'Not an id!' }), false);
  assert.equal(sharedMobilityFranceLayer.setParams({ kinds: 'autres' }), false, 'the old half is gone');
  assert.deepEqual(sharedMobilityFranceLayer.getParams(), { kinds: 'scooter', operator: 'yego' });
  assert.equal(sharedMobilityFranceLayer.setParams({ kinds: 'all', operator: 'all' }), true);
  assert.deepEqual(sharedMobilityFranceLayer.getParams(), { kinds: null, operator: null });
  clearKindFilter();
});

test('a focus set from the Vélib\' block dims every fleet and offers the way back', () => {
  clearKindFilter();
  // Fanned out from `bikeshare`: an operator this layer has never seen.
  assert.equal(sharedMobilityFranceLayer.acceptsParams({ operator: 'velib' }), true);
  assert.equal(sharedMobilityFranceLayer.acceptsParams({ operator: 'derived:velo modalis' }), true);
  assert.equal(sharedMobilityFranceLayer.acceptsParams({ year: 2024 }), false, 'a neighbour\'s key is declined');
  assert.equal(sharedMobilityFranceLayer.setParams({ operator: 'velib' }), true);
  _setSharedMobilityPayloadForTest(parisPayload());
  const { legend, legendScope } = sharedMobilityFranceLayer.getRowControls();
  const operators = legend.filter((item) => item.channel === 'Fournisseurs' && !item.action);
  assert.ok(operators.every((item) => item.off), 'nothing of mine is lit');
  const back = legend.find((item) => item.action);
  assert.equal(back.label, 'Tout afficher');
  assert.deepEqual(back.toggle, { param: 'operator', value: 'all', fanOut: true });
  // Emptied by a filter is not « hors de cette vue »: no extent claim at all.
  assert.equal(legendScope, null);
  clearKindFilter();
});

test('a focus greys the families its operator lacks instead of removing them', () => {
  clearKindFilter();
  assert.equal(sharedMobilityFranceLayer.setParams({ operator: 'lime' }), true);
  _setSharedMobilityPayloadForTest(parisPayload());
  const { legendSegments } = sharedMobilityFranceLayer.getRowControls();
  assert.deepEqual(legendSegments.map((segment) => [segment.label, Boolean(segment.disabled)]), [
    ['Tous', false], ['Vélos', false], ['Scooters', true], ['Voitures', true],
  ], 'the control keeps its shape: Lime has no scooter and no car here');
  clearKindFilter();
});

// --- Staying on the ground when the map moves --------------------------------

test('a point placed before its floor landed is re-placed, not left on the ellipsoid', () => {
  // The bug this pins: a cold cell anchored the object at ellipsoid 0, which
  // under a French city is tens to hundreds of metres below the street. Depth
  // testing is off, so it is painted anyway — and its screen position then
  // follows the camera, sliding over the rooftops on every pan.
  setMeshFloorPreferred(true);
  const record = vehicleRecord({ object: { id: 'anchor:1', lat: 45.1881, lon: 5.7245 } });
  _setSharedMobilityStateForTest({ viewer: viewerWithView(null), records: [record] });

  const buried = Cesium.Cartographic.fromCartesian(record.position);
  assert.ok(Math.abs(buried.height - 12) < 0.001, 'seeded where the pre-fix code left it');

  reportMeshFloorCell(45.1881, 5.7245, 213.4);
  assert.equal(_reanchorSharedMobilityForTest(), 1, 'the floor landed, so the point moves');

  const placed = Cesium.Cartographic.fromCartesian(record.position);
  assert.ok(Math.abs(placed.height - (213.4 + 2.5)) < 0.05,
    `expected the Grenoble floor plus the lift, got ${placed.height}`);
  // The primitive is what is actually drawn — a record that agrees with the
  // floor while its dot does not is the same bug with a passing test.
  assert.ok(Cesium.Cartesian3.equals(record.point.position, record.position));

  // Idempotent: a pass with nothing new to say must not dirty the collection.
  assert.equal(_reanchorSharedMobilityForTest(), 0);

  setMeshFloorPreferred(false);
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});


// --- Pins: the few vehicles that say what they are ---------------------------
//
// The « Repères discrets » mock: every vehicle a dot, a few of them pinned.
// These drive the production pass over a fake scene — a flat projection and a
// collection that records what it was asked to draw.

/** A billboard collection that only remembers. */
function fakePins() {
  const drawn = new Set();
  return {
    drawn,
    add(options) { const pin = { ...options }; drawn.add(pin); return pin; },
    remove(pin) { drawn.delete(pin); return true; },
    removeAll() { drawn.clear(); },
  };
}

/** A camera `altitudeM` above central Paris, looking at a 1,000 × 800 screen. */
function pinViewer(altitudeM) {
  return {
    camera: {
      positionCartographic: { height: altitudeM },
      positionWC: Cesium.Cartesian3.fromDegrees(2.35, 48.86, altitudeM),
      computeViewRectangle: () => Cesium.Rectangle.fromDegrees(2.30, 48.84, 2.40, 48.88),
    },
    scene: { canvas: { clientWidth: 1_000, clientHeight: 800 } },
  };
}

/** Flat projection of the view box onto the screen: 0.1° of longitude is 1,000 px. */
function flatProject(scene, position, result) {
  const carto = Cesium.Cartographic.fromCartesian(position);
  result.x = (Cesium.Math.toDegrees(carto.longitude) - 2.30) * 10_000;
  result.y = (48.88 - Cesium.Math.toDegrees(carto.latitude)) * 20_000;
  return result;
}

/** A row of Lime e-bikes `stepDeg` apart along one street. */
function street(count, stepDeg, prefix = 'lime') {
  return Array.from({ length: count }, (_, i) => vehicleRecord({
    object: { id: `${prefix}:${i}`, lat: 48.86, lon: 2.31 + i * stepDeg },
  })).map((record, i) => ({ ...record, pinRank: i }));
}

test('pins come in close to the street, and stay off from higher up', () => {
  const { ceilingM } = _sharedMobilityPinGeometryForTest();
  // 0.001° = 10 px apart: a crowded kerb, which must not become a crowd of pins.
  const records = street(60, 0.001);
  const pins = fakePins();
  _setSharedMobilityStateForTest({ viewer: pinViewer(ceilingM * 2), records, pins, project: flatProject });
  assert.equal(_refreshSharedMobilityPinsForTest().drawn, 0, 'a wide view is dots only');

  _setSharedMobilityStateForTest({ viewer: pinViewer(ceilingM / 3), records, pins, project: flatProject });
  const { drawn, pinned } = _refreshSharedMobilityPinsForTest();
  // 60 dots over 590 px of street: one pin per 200 px, never two touching.
  assert.equal(drawn, Math.floor(590 / SHARED_MOBILITY_PIN_SPACING_PX) + 1);
  assert.equal(pins.drawn.size, drawn);
  const xs = pinned.map((id) => records.find((record) => record.id === id)).map((record) => flatProject(null, record.position, {}).x)
    .sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= SHARED_MOBILITY_PIN_SPACING_PX);
  // The pin wears the vehicle's kind and its operator's hue, and stands on its dot.
  const pin = [...pins.drawn][0];
  assert.equal(pin.image, sharedMobilityPinGlyph('ebike', { color: resolveMobilityOperator('Lime Paris').color }));
  assert.equal(pin.verticalOrigin, Cesium.VerticalOrigin.BOTTOM);
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

test('a pin that would stand under the UI or off the edge is not offered', () => {
  const { ceilingM } = _sharedMobilityPinGeometryForTest();
  // Three vehicles 300 px apart at y = 400: one under a side rail, one at the
  // left edge, one in the clear.
  const records = [
    vehicleRecord({ object: { id: 'rail', lat: 48.86, lon: 2.395 } }),
    vehicleRecord({ object: { id: 'edge', lat: 48.86, lon: 2.3001 } }),
    vehicleRecord({ object: { id: 'clear', lat: 48.86, lon: 2.35 } }),
  ];
  const pins = fakePins();
  const rail = { x: 900, y: 0, w: 100, h: 800, hard: false };
  _setSharedMobilityStateForTest({
    viewer: pinViewer(ceilingM / 3), records, pins, project: flatProject, chrome: [rail],
  });
  assert.deepEqual(_refreshSharedMobilityPinsForTest().pinned, ['clear']);
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

test('a pass keeps the pins that survive, so a pan does not blink them', () => {
  const { ceilingM } = _sharedMobilityPinGeometryForTest();
  const records = street(8, 0.003);
  const pins = fakePins();
  _setSharedMobilityStateForTest({ viewer: pinViewer(ceilingM / 3), records, pins, project: flatProject });
  _refreshSharedMobilityPinsForTest();
  const before = new Map(records.filter((record) => record.pin).map((record) => [record.id, record.pin]));
  assert.ok(before.size >= 2);
  _refreshSharedMobilityPinsForTest();
  for (const [id, pin] of before) {
    assert.equal(records.find((record) => record.id === id).pin, pin, `${id} kept its billboard`);
  }
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

test('the selected vehicle wears the cyan pin, even from higher up, and gives it back', () => {
  const { ceilingM } = _sharedMobilityPinGeometryForTest();
  const records = street(20, 0.001);
  const pins = fakePins();
  const host = { setEntries() {}, setVisible() {}, clearSource() {} };
  _setSharedMobilityStateForTest({
    viewer: pinViewer(ceilingM / 3), records, pins, project: flatProject, overlayHost: host,
  });
  _refreshSharedMobilityPinsForTest();
  // An unpinned vehicle, crowded by a pin 10 px away: pressing it pins IT.
  const chosen = records.find((record) => !record.pin);
  _selectSharedMobilityObjectForTest(chosen.id);
  assert.ok(chosen.pin, 'the selected vehicle is pinned whatever its neighbours');
  assert.equal(chosen.pin.image, sharedMobilityPinGlyph('ebike', { selected: true }));

  // From higher up the other pins come off; the selected one is what the card points at.
  _setSharedMobilityStateForTest({
    viewer: pinViewer(ceilingM * 2), records, pins, project: flatProject, overlayHost: host,
  });
  for (const record of records) record.pin = null;
  pins.removeAll();
  _selectSharedMobilityObjectForTest(chosen.id);
  assert.deepEqual([...pins.drawn].map((pin) => pin.id), [chosen.id]);
  _clearSharedMobilitySelectionForTest();
  assert.equal(pins.drawn.size, 0, 'released, it goes back to being a dot');
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

test('a pin stands on its dot when the floor lands under both', () => {
  setMeshFloorPreferred(true);
  const { ceilingM } = _sharedMobilityPinGeometryForTest();
  const [record] = street(1, 0, 'floor');
  record.object.lat = 48.8612;
  record.object.lon = 2.3301;
  record.position = Cesium.Cartesian3.fromDegrees(2.3301, 48.8612, 12);
  record.point.position = record.position;
  const pins = fakePins();
  _setSharedMobilityStateForTest({ viewer: pinViewer(ceilingM / 3), records: [record], pins, project: flatProject });
  _refreshSharedMobilityPinsForTest();
  assert.ok(record.pin);
  reportMeshFloorCell(48.8612, 2.3301, 41.2);
  assert.equal(_reanchorSharedMobilityForTest(), 1);
  assert.ok(Cesium.Cartesian3.equals(record.pin.position, record.position), 'the pin moved with its dot');
  setMeshFloorPreferred(false);
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

// --- Groups: the city-wide view ----------------------------------------------
//
// The « Regroupements lisibles » mock: above the pins' ceiling the proxy counts
// the vehicles on its grid, and the layer draws one bubble per group.

/** A collection that only remembers, for billboards and labels alike. */
function fakeCollection() {
  const drawn = new Set();
  return {
    drawn,
    add(options) { const item = { ...options }; drawn.add(item); return item; },
    remove(item) { drawn.delete(item); return true; },
    removeAll() { drawn.clear(); },
  };
}

function groupsPayload() {
  return {
    systems: PARIS_SYSTEMS,
    stations: [],
    vehicles: [],
    clusterDeg: 0.008,
    clusters: [
      { id: '1:1', lat: 48.86, lon: 2.34, n: 1_234, by: { 'lime|ebike': 700, 'dott|ebike': 500, 'yego|moped': 34 } },
      { id: '1:2', lat: 48.87, lon: 2.36, n: 40, by: { 'yego|moped': 40 } },
    ],
  };
}

test('above the ceiling each group prints the proxy\'s count and its operators\' bar', () => {
  const sprites = fakeCollection();
  const labels = fakeCollection();
  _setSharedMobilityStateForTest({ viewer: null, records: [], groups: { sprites, labels } });
  _setSharedMobilityPayloadForTest(groupsPayload());
  const drawn = _refreshSharedMobilityBubblesForTest();
  assert.deepEqual(drawn.map((bubble) => [bubble.id, bubble.n]), [['1:1', 1_234], ['1:2', 40]]);
  // « 1,2 k »: formatted in the page's language, with a narrow space or not.
  assert.match(drawn[0].text, /^1,2\s?k$/);
  assert.equal(drawn[0].bars, 3, 'Lime, Dott and YEGO each get their segment');
  assert.equal(drawn[1].text, '40');
  // One bubble image for all of them, and one bar image: no atlas entry per number.
  const images = new Set([...sprites.drawn].map((item) => item.image));
  assert.equal(images.size, 2);
  // The key counts the groups, not the few objects the answer carried.
  const rows = Object.fromEntries(sharedMobilityFranceLayer.getRowControls().legend
    .filter((row) => row.channel === 'Fournisseurs').map((row) => [row.label, row.count]));
  assert.deepEqual(rows, { Lime: 700, Dott: 500, YEGO: 74 });
  assert.match(sharedMobilityFranceLayer.getRowControls().note, /bulle/);
  clearKindFilter();
});

test('a filter re-counts the groups, and a group it empties comes off', () => {
  const sprites = fakeCollection();
  const labels = fakeCollection();
  _setSharedMobilityStateForTest({ viewer: null, records: [], groups: { sprites, labels } });
  _setSharedMobilityPayloadForTest(groupsPayload());
  _refreshSharedMobilityBubblesForTest();
  // The filter is set with no answer in hand (no WebGL to reconcile into),
  // then the same answer is folded through it.
  const refold = (params) => {
    _setSharedMobilityPayloadForTest(null);
    sharedMobilityFranceLayer.setParams(params);
    _setSharedMobilityPayloadForTest(groupsPayload());
    return _refreshSharedMobilityBubblesForTest();
  };
  const bikes = refold({ kinds: 'velo' });
  assert.deepEqual(bikes.map((bubble) => [bubble.id, bubble.n]), [['1:1', 1_200]]);
  assert.equal(labels.drawn.size, 1, 'the scooter-only group left the map');
  const yego = refold({ kinds: 'all', operator: 'yego' });
  assert.deepEqual(yego.map((bubble) => [bubble.id, bubble.n]), [['1:2', 40], ['1:1', 34]]);
  clearKindFilter();
});

test('the analyst counts the grouped vehicles, one row each, and says they are grouped', () => {
  _setSharedMobilityStateForTest({
    viewer: null, records: [], groups: { sprites: fakeCollection(), labels: fakeCollection() }, enabled: true,
  });
  _setSharedMobilityPayloadForTest(groupsPayload());
  const rows = sharedMobilityFranceLayer.getAnalystRecords(5_000);
  assert.equal(rows.length, 1_274, 'every vehicle the groups count');
  assert.ok(rows.every((row) => row.grouped === true && row.kind === 'shared-mobility-vehicle'));
  assert.equal(rows.filter((row) => row.operator === 'YEGO').length, 74);
  assert.equal(sharedMobilityFranceLayer.getAnalystRecords(100).length, 100, 'the ceiling still holds');
  clearKindFilter();
});

test('the Vélib\' bikes join the group of their cell, and the docks are told they are counted', () => {
  const velib = resolveMobilityOperator("Vélib' Métropole");
  publishMobilityDocks(() => [
    // Same cell as group « 1:1 » at 0.008° — its bikes are added to it.
    { lat: 48.86, lon: 2.34, bikes: 20, operator: velib },
    // A cell no fleet vehicle is in: a group of its own.
    { lat: 48.9101, lon: 2.4501, bikes: 7, operator: velib },
  ]);
  const sprites = fakeCollection();
  const labels = fakeCollection();
  _setSharedMobilityStateForTest({ viewer: null, records: [], groups: { sprites, labels } });
  // The proxy keys its cells the way the docks are keyed.
  const payload = groupsPayload();
  payload.clusters[0].id = gbfsClusterCellKey(48.86, 2.34, 0.008);
  _setSharedMobilityPayloadForTest(payload);
  assert.equal(mobilityDocksGrouped(), false);
  const drawn = _refreshSharedMobilityBubblesForTest();
  const counts = Object.fromEntries(drawn.map((bubble) => [bubble.n, bubble.bars]));
  assert.ok(1_254 in counts, 'the 1,234 fleet vehicles and the 20 docked bikes of the same cell');
  assert.equal(counts[1_254], 4, 'Lime, Dott, Vélib\' and YEGO each have their segment');
  assert.ok(7 in counts, 'a group of docked bikes alone');
  assert.equal(mobilityDocksGrouped(), true, 'the docks are counted, so they must not draw themselves');
  // Groups gone — a zoom back to the street — and the docks draw again.
  _setSharedMobilityPayloadForTest({ ...groupsPayload(), clusters: undefined });
  _refreshSharedMobilityBubblesForTest();
  assert.equal(mobilityDocksGrouped(), false);
  _resetMobilityDockBridgeForTest();
  clearKindFilter();
});
