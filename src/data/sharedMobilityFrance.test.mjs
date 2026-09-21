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
  _setSharedMobilityAltitudeForTest,
  _sharedMobilityMonogramCeilingForTest,
  SHARED_MOBILITY_KIND_FILTERS,
  SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID,
  SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS,
} from './sharedMobilityFrance.js';
import { reportMeshFloorCell, setMeshFloorPreferred } from './groundFloor.js';
import { GBFS_MAX_BOX_DEG } from './gbfsFeeds.js';
import { resolveMobilityOperator } from './mobilityOperators.js';
import { sharedMobilityGlyph } from './sharedMobilityIcons.js';

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
    // A vehicle is a glyph, not a dot: the silhouette is what says "scooter".
    billboard: { color: null, width: 0, height: 0, show: true },
    baseColor: operator.color,
    baseSize: 17,
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

test('every vehicle kind draws a distinct silhouette and keeps a readable label', () => {
  // Colour is spent on the OPERATOR, so the kind has to survive on shape
  // alone. A shared glyph between two kinds would silently merge them.
  const kinds = ['bike', 'ebike', 'scooter', 'moped', 'car', 'other'];
  const glyphs = kinds.map((kind) => sharedMobilityGlyph(kind));
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
  const unknown = stationColor({ available: null, capacity: 20 });
  const empty = stationColor({ available: 0, capacity: 20 });
  assert.notEqual(unknown, empty);
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
  assert.equal(record.billboard.color.toCssHexString(), '#00ffff');
  assert.ok(record.billboard.width > record.baseSize);

  _clearSharedMobilitySelectionForTest();
  assert.ok(calls.some((call) => call[0] === 'clear' && call[1] === SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID));
  // Restored to the OPERATOR's colour — the channel survives a selection.
  assert.equal(record.billboard.color.toCssHexString(), resolveMobilityOperator('Lime Paris').color);
  assert.equal(record.billboard.width, record.baseSize);
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
  // floor while its billboard does not is the same bug with a passing test.
  assert.ok(Cesium.Cartesian3.equals(record.billboard.position, record.position));

  // Idempotent: a pass with nothing new to say must not dirty the collection.
  assert.equal(_reanchorSharedMobilityForTest(), 0);

  setMeshFloorPreferred(false);
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});


// --- The monogram, and the zoom that decides it ------------------------------

test('the monogram switch is computed the way Cesium actually scales, not linearly', () => {
  // `czm_nearFarScalar` interpolates on SQUARED distance and then takes
  // `pow(t, 0.2)`. Assuming a straight line between the two ends puts the
  // switch altitude out by a factor of five, which is exactly the bug this
  // pins: the layer would badge a letter onto a 16 px plate and call it 22.
  const { ceilingM, glyphPx, scale, minDrawnPx, drawnPxAt } = _sharedMobilityMonogramCeilingForTest();

  // Reimplemented here from the shader source, independently of the module.
  const cesium = (distance) => {
    const span = scale.far ** 2 - scale.near ** 2;
    const t = Math.min(1, Math.max(0, (distance ** 2 - scale.near ** 2) / span)) ** 0.2;
    return glyphPx * (scale.nearValue + t * (scale.farValue - scale.nearValue));
  };
  for (const distance of [0, 500, 1200, 2000, 5000, 20_000, 45_000, 90_000]) {
    assert.ok(Math.abs(drawnPxAt(distance) - cesium(distance)) < 1e-9, `${distance} m`);
  }

  // The switch is where the plate stops being big enough to carry a letter.
  assert.ok(drawnPxAt(ceilingM) >= minDrawnPx - 1e-6, 'a badged plate is never under the threshold');
  assert.ok(drawnPxAt(ceilingM * 1.05) < minDrawnPx, 'and just above it, the letter is refused');
  // A LINEAR reading of the same ramp would have answered ~5.8 km. Pinned so
  // the mistake cannot come back as a "simplification".
  assert.ok(ceilingM < 2_000, `the switch must be street-level, got ${Math.round(ceilingM)} m`);

  // The far end is a rendering budget: up to 6,000 objects share the screen.
  assert.ok(drawnPxAt(scale.far) <= 7, 'the wide view stays a speck');
});

test('a zoom rewrites every plate exactly once, and only when the answer changed', () => {
  const records = [
    vehicleRecord({ object: { id: 'a', kind: 'ebike' }, system: { name: 'Lime Paris' } }),
    vehicleRecord({ object: { id: 'b', kind: 'scooter' }, system: { name: 'Dott Paris' } }),
  ].map((record) => ({ ...record, billboard: { image: null } }));
  _setSharedMobilityStateForTest({ viewer: viewerWithView(null), records });
  const { ceilingM } = _sharedMobilityMonogramCeilingForTest();

  // Wide: colour alone. A letter here would be noise on a 12 px disc.
  const wide = _setSharedMobilityAltitudeForTest(ceilingM * 4);
  assert.equal(wide.on, false);
  assert.equal(wide.flipped, false, 'the layer starts wide, so nothing flipped');

  // Down to the street: both plates take their operator's letter.
  const close = _setSharedMobilityAltitudeForTest(ceilingM / 2);
  assert.equal(close.on, true);
  assert.equal(close.flipped, true);
  assert.equal(close.rewritten, 2);
  assert.equal(records[0].billboard.image, sharedMobilityGlyph('ebike', { initial: 'L' }));
  assert.equal(records[1].billboard.image, sharedMobilityGlyph('scooter', { initial: 'D' }));

  // Panning at the same zoom must not walk 6,000 billboards for nothing.
  const again = _setSharedMobilityAltitudeForTest(ceilingM / 3);
  assert.equal(again.flipped, false);
  assert.equal(again.rewritten, 0);

  // Back out: the letters come off rather than lingering as unreadable grit.
  const out = _setSharedMobilityAltitudeForTest(ceilingM * 4);
  assert.equal(out.rewritten, 2);
  assert.equal(records[0].billboard.image, sharedMobilityGlyph('ebike'));

  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});

test('an operator with no letter is badged with nothing at all', () => {
  // A GBFS title that carries no Latin letter must not be given a capital its
  // name does not contain — the same rule the hue follows when it refuses to
  // claim a livery no feed publishes.
  const record = { ...vehicleRecord({ object: { id: 'z' }, system: { name: '' } }), billboard: { image: null } };
  _setSharedMobilityStateForTest({ viewer: viewerWithView(null), records: [record] });
  const { ceilingM } = _sharedMobilityMonogramCeilingForTest();
  _setSharedMobilityAltitudeForTest(ceilingM / 2);
  assert.equal(record.billboard.image, sharedMobilityGlyph(record.object.kind));
  _setSharedMobilityStateForTest({ viewer: null, records: [] });
});
