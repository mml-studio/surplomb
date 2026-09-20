// The Hydro plants layer in English, read off the shipped register itself:
// the card of a placed plant, of an anonymized one, of a world station and of
// a commune roll-up, the placement audit trail, the floor chips and the key.
//
// The claims that must survive translation are the ones the French card was
// rewritten to make: an unpublished energy is not a stopped plant, the card
// names WHICH object its coordinate is, and a commune ring is not a plant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FR_HYDRO_FLOORS,
  buildHydroCard,
  buildHydroClusterCard,
  buildHydroNeighbourLines,
  buildPlacementLines,
  buildWorldHydroCard,
  formatHydroEnergy,
  formatHydroPower,
  hydroDay,
  hydroDisplayName,
  hydroFloorLabel,
  hydroLegend,
  hydroLabelText,
} from './frHydroPlants.js';
import { hydroTechWords } from './frHydroFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const REGISTRY = JSON.parse(readFileSync(
  new URL('./local_data/fr_hydro_plants/plants.json', import.meta.url), 'utf8',
));
const plant = (predicate) => REGISTRY.plants.find(predicate);
const MIEGEBAT = plant((p) => p.insee === '64320' && p.kw === 74000);
const ANONYMOUS = plant((p) => p.anonymous && Number.isFinite(p.energyKwh) && p.energyKwh > 0);
const CORSICAN_PV = plant((p) => p.tech === 'Photovoltaïque');
const CLUSTER = REGISTRY.clusters.find((c) => (c.plants ?? 0) > 1);

// Plant names, communes, départements, operators and the register's own
// vocabulary for a status or an IGN object class are data.
const DATA = [MIEGEBAT?.name, MIEGEBAT?.commune, MIEGEBAT?.departement, MIEGEBAT?.operator,
  MIEGEBAT?.ignKind, MIEGEBAT?.poste, ANONYMOUS?.commune, ANONYMOUS?.departement,
  CLUSTER?.commune, CLUSTER?.departement, 'Photovoltaïque', 'Centrale électrique',
  'IGN BD TOPO®',
  // The name as the card prints it, once ODRÉ's decoration is stripped.
  hydroDisplayName(MIEGEBAT), hydroDisplayName(ANONYMOUS)].filter(Boolean);

test('the card of a placed plant reads in English, evidence included', () => {
  const card = withLocale('en', () => buildHydroCard(MIEGEBAT));
  assertNoFrench(card, { allow: [...DATA, ...(CLUSTER?.names || [])] });
  assert.match(card, /⚡ 74\.0 MW installed/);
  assert.match(card, /↻ [\d.,]+ (?:GWh|MWh) fed into the grid over the last 12 months/);
  assert.match(card, /of what it would produce never stopping/);
  assert.match(card, /◎ IGN BD TOPO® — building footprint surveyed by IGN/);
  assert.match(card, /on the IGN map/);
  // French, same plant: what it printed before.
  const french = withLocale('fr', () => buildHydroCard(MIEGEBAT));
  assert.match(french, /⚡ 74,0 MW installés/);
  assert.match(french, /◎ IGN BD TOPO® — emprise du bâtiment levée par l’IGN/);
});

test('an unpublished energy is not a stopped plant, in either language', () => {
  const silent = { kw: 500, energyKwh: null, commune: 'X' };
  assert.match(withLocale('en', () => buildHydroCard(silent)),
    /↻ energy fed into the grid not published — this is not a stopped plant/);
  assert.match(withLocale('fr', () => buildHydroCard(silent)),
    /ce n’est pas une centrale à l’arrêt/);
});

test('an anonymized plant says who withheld its name, and is still described', () => {
  const card = withLocale('en', () => buildHydroCard(ANONYMOUS));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /⊘ name not published — ODRÉ anonymizes small private installations/);
  assert.doesNotMatch(card, /Confidentiel/);
  const name = withLocale('en', () => hydroDisplayName({ commune: 'Laruns' }));
  assert.equal(name, 'Hydro plant in Laruns');
  assert.equal(withLocale('fr', () => hydroDisplayName({ commune: 'Laruns' })),
    'Centrale hydraulique à Laruns');
});

test('a technology outside the register’s hydro vocabulary is quoted, not corrected', () => {
  const card = withLocale('en', () => buildHydroCard(CORSICAN_PV));
  assert.match(card, /◈ technology published as “Photovoltaïque” — outside the register’s hydro vocabulary/);
});

test('the five technologies keep their explaining clause in English', () => {
  const words = withLocale('en', () => hydroTechWords('Lac'));
  assert.deepEqual(words, {
    label: 'Reservoir',
    blurb: 'water is held for months and released when demand climbs',
  });
  assert.equal(withLocale('en', () => hydroTechWords('Eclusée').label), 'Pondage');
  assert.equal(withLocale('en', () => hydroTechWords("Fil de l'eau").label), 'Run-of-river');
  // A bucket key is the FRENCH label, and it resolves too.
  assert.equal(withLocale('en', () => hydroTechWords('Pompage-turbinage').label), 'Pumped storage');
  assert.equal(withLocale('fr', () => hydroTechWords('Lac').label), 'Lac');
});

test('the placement lines name which object the dot is, in English', () => {
  const switchyard = {
    placement: 'rte-switchyard', geometry: 'switchyard', matchedBy: 'postesource',
    communeContradictedKm: 612, anchorKm: 3.4,
  };
  const lines = withLocale('en', () => buildPlacementLines(switchyard));
  assertNoFrench(lines, { allow: DATA });
  assert.match(lines[0], /^◎ OpenStreetMap — the connecting SUBSTATION, not the powerhouse · 3\.4 km from the center of the municipality$/);
  assert.ok(lines.some((line) => /primary-substation code published on both sides/.test(line)));
  assert.ok(lines.some((line) => /the municipality the register publishes is incompatible/.test(line)));
  const snapped = withLocale('en', () => buildPlacementLines({
    placement: 'osm-plant', geometry: 'outline', snapKm: 2.7, outlineSpanM: 4100,
  }));
  assert.ok(snapped.some((line) => /moved 2\.7 km off the center of a 4\.1 km footprint/.test(line)));
});

test('the neighbour lines claim a distance and nothing more', () => {
  const joins = {
    gauge: { text: '12,4 m³/s', name: 'Laruns', river: 'Gave d’Ossau', distanceM: 3200 },
    dam: { name: 'Barrage de Fabrèges', heightM: 61, distanceM: 1800 },
  };
  const lines = withLocale('en', () => buildHydroNeighbourLines(joins));
  assert.match(lines[0], /at 3\.2 km — station Laruns on Gave d’Ossau, the nearest one measuring a flow/);
  assert.match(lines[1], /^▰ Barrage de Fabrèges, 61 m high at 1\.8 km — a mapped neighbouring structure/);
  assert.match(withLocale('fr', () => buildHydroNeighbourLines(joins))[1], /, 61 m de haut à 1,8 km/);
});

test('a world station is four lines, and says it is a sample', () => {
  const card = withLocale('en', () => buildWorldHydroCard({
    name: 'Itaipú', kw: 14_000_000, operator: 'Itaipu Binacional', builtYear: 1984,
  }));
  assertNoFrench(card, { allow: ['Itaipú', 'Itaipu Binacional'] });
  assert.match(card, /^Itaipú\n⚡ 14\.00 GW installed/);
  assert.match(card, /▸ Itaipu Binacional · commissioned 1984/);
  assert.match(card, /🌍 OpenStreetMap, outside the French register — a sample of 592 plants, not a world inventory/);
  assert.match(withLocale('en', () => buildWorldHydroCard({ name: 'X' })),
    /⚡ installed power not published by OpenStreetMap/);
});

test('a commune roll-up says it is not a plant, in its first line', () => {
  const card = withLocale('en', () => buildHydroClusterCard(CLUSTER));
  assertNoFrench(card, { allow: [...DATA, ...(CLUSTER.names || []).filter(Boolean)] });
  assert.match(card, /^.+ — \d+ plants with no published location\n/);
  assert.match(card, /⚡ .+ installed in total/);
  assert.match(card, /◎ marker placed at the CENTER OF THE MUNICIPALITY — the register publishes no position/);
  assert.match(card, /Typical distance to the real building: 3 km\./);
  assert.match(withLocale('fr', () => buildHydroClusterCard(CLUSTER)), /non localisée/);
});

test('the key names every drawn technology and the two rows that are not one', () => {
  const clusters = REGISTRY.clusters.slice(0, 5);
  const legend = withLocale('en', () => hydroLegend(REGISTRY.plants.slice(0, 400), clusters));
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })), { allow: DATA });
  assert.ok(legend.some((row) => row.label === 'Run-of-river'));
  assert.match(legend[0].blurb, / — [\d.,]+ (?:kW|MW|GW) installed$/);
  const ring = legend.find((row) => row.label === 'Ring = municipality, not plant');
  assert.match(ring.blurb, /installations no source can locate, grouped by municipality/);
  // French, same key.
  const french = withLocale('fr', () => hydroLegend(REGISTRY.plants.slice(0, 400), clusters));
  assert.ok(french.some((row) => row.label === "Fil de l'eau"));
});

test('the floor chips, the ambient label and the numbers', () => {
  assert.deepEqual(withLocale('en', () => FR_HYDRO_FLOORS.map((floor) => hydroFloorLabel(floor))),
    ['ALL', '≥ 1 MW', '≥ 10 MW']);
  assert.deepEqual(withLocale('fr', () => FR_HYDRO_FLOORS.map((floor) => hydroFloorLabel(floor))),
    ['TOUT', '≥ 1 MW', '≥ 10 MW']);
  assert.equal(withLocale('en', () => formatHydroPower(1_234_567)), '1.23 GW');
  assert.equal(withLocale('fr', () => formatHydroPower(1_234_567)), '1,23 GW');
  assert.equal(withLocale('en', () => formatHydroPower(740)), '740 kW');
  assert.equal(withLocale('en', () => formatHydroEnergy(1_800_000)), '1.8 GWh');
  assert.equal(withLocale('en', () => hydroDay('1966-06-30')), 'Jun 30, 1966');
  assert.equal(withLocale('fr', () => hydroDay('1966-06-30')), '30/06/1966');
  assert.match(withLocale('en', () => hydroLabelText(MIEGEBAT)), /· 74\.0 MW$/);
});
