// The Groupes de prod (FR) layer in relief — the ring-and-disc grammar stood
// up as a cage and a column between 70 and 800 km of camera altitude.
//
// What these tests hold still is what makes the relief a READING rather than a
// decoration: one fixed scale for every station, the "unmeasured vs stopped"
// distinction surviving the change of shape, and a band that does not flicker
// under a camera parked on its edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RTE_GEN_CAGE_SUFFIX,
  RTE_GEN_COLUMN_SUFFIX,
  RTE_GEN_EDGE_SUFFIX,
  RTE_GEN_ICON_SUFFIX,
  RTE_GEN_RENDER_PREFIX,
  RTE_RELIEF_MAX_ALT_M,
  RTE_RELIEF_MIN_ALT_M,
  RTE_RELIEF_M_PER_MW,
  createRteStationOverlayEntry,
  resolveRtePickId,
  rteColumnHeights,
  rteReliefIconSize,
  rteReliefWanted,
  rteShortName,
  rteStationFiliere,
} from './rteGeneration.js';
import { PLANT_GLYPH_PUNCH_MIN_PX } from './plantFiliereIcons.js';

test('the relief band holds the scene altitude and hands both ends back to the rings', () => {
  // « Le réseau électrique et ce qu'il produit » opens at 180 km.
  assert.equal(rteReliefWanted(180_000), true);
  assert.equal(rteReliefWanted(10_000), false, 'a 36 km column is a wall at 10 km');
  assert.equal(rteReliefWanted(3_000_000), false, 'and a needle over the whole country');
  assert.equal(rteReliefWanted(Number.NaN), false);
  assert.equal(rteReliefWanted(undefined, true), false);
});

test('a camera parked on a bound does not swap cages for rings on every frame', () => {
  for (const bound of [RTE_RELIEF_MIN_ALT_M, RTE_RELIEF_MAX_ALT_M]) {
    // The same altitude answers what it answered last frame.
    assert.equal(rteReliefWanted(bound, true), true, `stays on at ${bound}`);
    assert.equal(rteReliefWanted(bound, false), false, `stays off at ${bound}`);
  }
  // Well past the slack, both agree.
  assert.equal(rteReliefWanted(RTE_RELIEF_MIN_ALT_M * 0.8, true), false);
  assert.equal(rteReliefWanted(RTE_RELIEF_MIN_ALT_M * 1.2, false), true);
});

test('one scale for every station: height is megawatts times a fixed number', () => {
  const stAlban = rteColumnHeights({ installedMw: 2670, mw: 1231 });
  assert.equal(stAlban.cageM, 2670 * RTE_RELIEF_M_PER_MW);
  assert.equal(stAlban.columnM, 1231 * RTE_RELIEF_M_PER_MW);
  assert.equal(stAlban.topM, stAlban.cageM);
  // The ratio on screen is the load factor, whatever the scale.
  assert.ok(Math.abs(stAlban.columnM / stAlban.cageM - 1231 / 2670) < 1e-12);
  // Cruas stands taller than Saint-Alban by exactly their capacities' ratio.
  const cruas = rteColumnHeights({ installedMw: 3660, mw: 2616 });
  assert.ok(Math.abs(cruas.cageM / stAlban.cageM - 3660 / 2670) < 1e-12);
});

test('unmeasured and stopped stay two different readings in relief', () => {
  const unmeasured = rteColumnHeights({ installedMw: 900, mw: null });
  const stopped = rteColumnHeights({ installedMw: 900, mw: 0 });
  assert.equal(unmeasured.measured, false);
  assert.equal(stopped.measured, true);
  // Neither gets a column — the empty cage IS the reading; the edge alpha
  // (pale vs crisp) is what tells them apart, as it does for the ring.
  assert.equal(unmeasured.columnM, 0);
  assert.equal(stopped.columnM, 0);
});

test('a station drawing from the grid gets a column of its magnitude, flagged as pumping', () => {
  const pumping = rteColumnHeights({ installedMw: 1800, mw: -52 });
  assert.equal(pumping.pumping, true);
  assert.equal(pumping.columnM, 52 * RTE_RELIEF_M_PER_MW);
});

test('an output above the nameplate is drawn above the cage, not clipped into it', () => {
  const over = rteColumnHeights({ installedMw: 100, mw: 112 });
  assert.equal(over.cageM, 100 * RTE_RELIEF_M_PER_MW);
  assert.equal(over.topM, 112 * RTE_RELIEF_M_PER_MW);
});

test('a station with no published capacity still stands, at a floor cage', () => {
  const unknown = rteColumnHeights({ installedMw: null, mw: null });
  assert.ok(unknown.cageM > 0);
});

test('every nuclear station wears the cooling tower, never a bare plate', () => {
  assert.equal(rteStationFiliere('nuclear'), 'nucleaire');
  assert.equal(rteStationFiliere('hydro-pumped'), 'hydraulique');
  assert.equal(rteStationFiliere('fossil-gas'), 'thermique');
  // No vetted glyph pictures these: they keep the plate in their colour.
  for (const klass of ['wind', 'solar', 'marine', 'battery', 'biomass', 'other', undefined]) {
    assert.equal(rteStationFiliere(klass), null, String(klass));
  }
  // The trefoil punched in the tower only survives above the punch floor, and
  // the smallest French nuclear station (Belleville, 2 620 MW) clears it.
  assert.ok(rteReliefIconSize(2620) >= PLANT_GLYPH_PUNCH_MIN_PX);
  assert.ok(rteReliefIconSize(Number.NaN) >= PLANT_GLYPH_PUNCH_MIN_PX);
});

test('a short name drops the kind of plant and keeps what names the place', () => {
  assert.equal(rteShortName('Centrale nucléaire de St-Alban-St-Maurice'), 'St-Alban-St-Maurice');
  assert.equal(rteShortName('Centrale nucléaire du Bugey'), 'Bugey');
  assert.equal(rteShortName('Station de pompage de la Coche'), 'La Coche');
  assert.equal(rteShortName('Centrale thermique des Morandes'), 'Les Morandes');
  assert.equal(rteShortName('Centrale thermique d’Emile-Huchet'), 'Emile-Huchet');
  assert.equal(rteShortName('Ferme éolienne de Vent-des-Iles'), 'Vent-des-Iles');
  // Anything else is left exactly as the register wrote it.
  assert.equal(rteShortName('Barrage de Génissiat'), 'Barrage de Génissiat');
  assert.equal(rteShortName(''), '');
  assert.equal(rteShortName(null), '');
});

test('in relief the label drops the kind and clears the mark it hangs off', () => {
  const site = { id: 's1', name: 'Centrale nucléaire du Bugey', class: 'nuclear', mw: 3418, installedMw: 3580 };
  const flat = createRteStationOverlayEntry(site, { x: 1, y: 2, z: 3 });
  const relief = createRteStationOverlayEntry(site, { x: 1, y: 2, z: 3 }, { relief: true, iconPx: 30 });
  assert.match(flat.title, /^Centrale nucléaire du Bugey · /);
  assert.match(relief.title, /^Bugey · /);
  assert.ok(relief.gapPx > 30 / 2, 'the label sits above the mark, not on it');
  assert.equal(relief.id, flat.id, 'one label per station, whatever its shape');
});

test('every relief primitive picks its station', () => {
  const id = `${RTE_GEN_RENDER_PREFIX}bugey`;
  const has = (value) => value === id;
  for (const suffix of [RTE_GEN_COLUMN_SUFFIX, RTE_GEN_CAGE_SUFFIX, RTE_GEN_EDGE_SUFFIX, RTE_GEN_ICON_SUFFIX]) {
    assert.equal(resolveRtePickId({ id: `${id}${suffix}` }, has), id, suffix);
  }
  assert.equal(resolveRtePickId({ id: `${RTE_GEN_RENDER_PREFIX}other${RTE_GEN_CAGE_SUFFIX}` }, has), null);
});

test('the relief switch reaches the shell under the name the shell listens for', async () => {
  const { readFileSync } = await import('node:fs');
  const { LAYER_DRAW_CHANGED_EVENT } = await import('./addressScanLayer.js');
  const source = readFileSync(new URL('./rteGeneration.js', import.meta.url), 'utf8');
  assert.ok(source.includes(`new CustomEvent('${LAYER_DRAW_CHANGED_EVENT}'`));
});

test('a filière drawing from the grid is said to consume, not to produce a negative', async () => {
  const { buildRteLegend } = await import('./rteGeneration.js');
  const [pumped] = buildRteLegend([
    { id: 'GRAND', class: 'hydro-pumped', mw: -644, installedMw: 5019, reporting: 1 },
  ]);
  assert.doesNotMatch(pumped.blurb, /−|-\d/);
  assert.match(pumped.blurb, /^Consomme 644 MW en ce moment/);
});
