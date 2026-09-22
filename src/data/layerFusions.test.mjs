import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYER_FUSIONS,
  fusedIntoFor,
  fusionCompanionsFor,
  fusionTilesFor,
  fusionToggleGroupFor,
  tilePartDefaults,
  tilePartIsOff,
  validateLayerFusions,
} from './layerFusions.js';
import { ANFR_BAND_COLORS } from './anfrFrance.js';
import { DATACENTER_HALL_COLOR } from './datacentersPack.js';
import { COVERAGE_RAMP } from './mobileCoverage.js';
import { BASE_CABLE_COLOR } from './telegeographySubmarineCables.js';
import {
  DISABLED_LAYER_IDS,
  REGISTERED_LAYER_IDS,
  decodeLayerStateParams,
  encodeLayerStateParams,
  normalizeLayerState,
} from './layerState.js';
import { LAYER_TAXONOMY, groupLayerIdsByCategory, layerTaxonomyFor } from './layerTaxonomy.js';

test('the shipped table validates against the registered layer set', () => {
  assert.equal(validateLayerFusions(), true);
});

test('no layer is claimed twice, and no primary is somebody else s companion', () => {
  // The failure this forbids is not theoretical: a layer that is a primary in
  // one entry and a companion in another would draw a row AND a chip for the
  // same source — the exact duplication the table exists to remove.
  const seen = new Set();
  for (const fusion of LAYER_FUSIONS) {
    assert.ok(!seen.has(fusion.primary), `${fusion.primary} claimed twice`);
    seen.add(fusion.primary);
    for (const companion of fusion.companions) {
      assert.ok(!seen.has(companion.id), `${companion.id} claimed twice`);
      seen.add(companion.id);
    }
  }
});

test('every id in the table is a layer the app actually registers', () => {
  const registered = new Set(REGISTERED_LAYER_IDS);
  for (const fusion of LAYER_FUSIONS) {
    assert.ok(registered.has(fusion.primary), `unknown primary ${fusion.primary}`);
    for (const companion of fusion.companions) {
      assert.ok(registered.has(companion.id), `unknown companion ${companion.id}`);
    }
  }
});

test('a fused row never hides a world layer behind a French scope chip', () => {
  // The rule the table states in prose, asserted: where a fusion mixes a layer
  // that has data everywhere with one that stops at the French border, the
  // world layer keeps the row. A row chipped `FR` over a world subject tells a
  // reader in Montréal that a layer serving them is not for them.
  for (const fusion of LAYER_FUSIONS) {
    const primary = layerTaxonomyFor(fusion.primary);
    if (primary.coverage === 'global') continue;
    for (const companion of fusion.companions) {
      const entry = layerTaxonomyFor(companion.id);
      assert.notEqual(
        entry.coverage,
        'global',
        `${companion.id} has world data and is folded into the narrower ${fusion.primary}`,
      );
    }
  }
});

test('the row toggle carries its followers and leaves the opt-in companions alone', () => {
  // `comparables-fr` is the reader's own dossier: switching it on from a row
  // toggle would spend a lifecycle drawing an empty selection. `avis-valeur`
  // values a door the reader has in mind, so it waits for its chip too.
  const dvf = fusionToggleGroupFor('dvf-sales');
  assert.deepEqual(dvf, ['dvf-sales']);
  for (const id of ['avis-valeur', 'comparables-fr']) {
    assert.ok(fusionCompanionsFor('dvf-sales').some((entry) => entry.id === id && entry.optIn), id);
  }

  // The electricity row lights what the landing page's scene lights — the
  // grid and the output of the power stations — and leaves the two registers
  // that would draw the same stations a second time to their chips.
  assert.deepEqual(fusionToggleGroupFor('power-grid'), ['power-grid', 'rte-generation']);
  for (const id of ['edf-power-plants', 'fr-hydro-plants']) {
    assert.ok(fusionCompanionsFor('power-grid').some((entry) => entry.id === id && entry.optIn), id);
  }

  // A layer with no fusion is its own group of one — that is the contract that
  // lets a caller use this unconditionally.
  assert.deepEqual(fusionToggleGroupFor('cctv'), ['cctv']);
  assert.deepEqual(fusionToggleGroupFor('not-a-layer'), ['not-a-layer']);
});

test('a companion resolves back to the row it disappeared into', () => {
  assert.equal(fusedIntoFor('sitadel-fr'), 'urbanisme-gpu');
  assert.equal(fusedIntoFor('ads-fr'), 'urbanisme-gpu');
  assert.equal(fusedIntoFor('marine-buoys'), 'ais-live-vessels');
  assert.equal(fusedIntoFor('gironde-megafire-2026'), 'local-firms');
  assert.equal(fusedIntoFor('bruit-fr'), 'local-airports');
  assert.equal(fusedIntoFor('military'), 'flights');
  assert.equal(fusedIntoFor('edf-power-plants'), 'power-grid');
  assert.equal(fusedIntoFor('rte-generation'), 'power-grid');
  assert.equal(fusedIntoFor('cctv'), null);
  assert.equal(fusedIntoFor('urbanisme-gpu'), null);
});

test('the taxonomy carries the fusion facets, and the panel projection drops the companions', () => {
  const byId = new Map(LAYER_TAXONOMY.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('sitadel-fr').fusedInto, 'urbanisme-gpu');
  assert.equal(byId.get('urbanisme-gpu').companions.length, 2);
  assert.equal(byId.get('cadastre-fr').companions, null);
  assert.equal(byId.get('cadastre-fr').fusedInto, null);

  const rows = groupLayerIdsByCategory().flatMap((group) => group.layerIds);
  for (const fusion of LAYER_FUSIONS) {
    assert.ok(rows.includes(fusion.primary), `${fusion.primary} lost its row`);
    for (const companion of fusion.companions) {
      assert.ok(!rows.includes(companion.id), `${companion.id} still has a row`);
    }
  }
});

test('the merge is measured, not asserted: the panel loses 26 rows and keeps every layer', () => {
  // The number is the point of the whole exercise, so it is pinned. If a new
  // layer lands, the row count moves and this assertion moves with it — what
  // must not move silently is the DIFFERENCE between what is registered and
  // what is listed.
  //
  // 23 until 2026-09-10, when `idfm-frequency` stopped being a companion by
  // stopping being a layer: it and `idfm-network` drew the same stops, so they
  // were merged into ONE module rather than kept as two chips on one row. A
  // fusion hides a row; a merge deletes one, and the two are not the same
  // operation. See `idfmNetwork.js`.
  //
  // 22 until 2026-09-14, when the second round folded three more: the PLU took
  // the permits under it (« Urbanisme »), the moorings joined the vessels whose
  // cards already read them, and the Gironde archive became the past tense of
  // « Feux actifs ».
  //
  // 25 until 2026-09-21, when the grid and the power stations became one row:
  // `power-grid` took the plants row over, and `edf-power-plants`, its primary
  // until then, became the fourth member of it.
  const folded = LAYER_FUSIONS.reduce((total, fusion) => total + fusion.companions.length, 0);
  assert.equal(folded, 26);

  const rows = groupLayerIdsByCategory().flatMap((group) => group.layerIds);
  const datasets = LAYER_TAXONOMY.filter((entry) => entry.kind === 'dataset');
  assert.equal(rows.length, datasets.length - folded);

  // Nothing is deleted. Every folded layer is still registered, still carries
  // its own share token, and is still reachable by id.
  const registered = new Set(REGISTERED_LAYER_IDS);
  for (const fusion of LAYER_FUSIONS) {
    for (const companion of fusion.companions) assert.ok(registered.has(companion.id));
  }
});

test('a withdrawn companion loses its chip, keeps its layer, and never gets a row', () => {
  // The three halves of `disabled: true`, asserted together because dropping
  // any one of them is a different bug: no chip (the reader cannot ask for it),
  // not in the row's toggle group (the row never switches it on behind their
  // back), and STILL fused (so it does not come back as a row of its own — the
  // failure mode of simply deleting the entry).
  const offered = fusionCompanionsFor('bikeshare');
  assert.deepEqual(offered.map((entry) => entry.id), ['shared-mobility-fr']);
  assert.deepEqual(fusionToggleGroupFor('bikeshare'), ['bikeshare', 'shared-mobility-fr']);
  assert.equal(fusedIntoFor('velo-pulse-fr'), 'bikeshare');

  // Nothing was deleted: the entry is still in the table, still registered,
  // and still carries the chip label it comes back with.
  const entry = LAYER_FUSIONS.find((fusion) => fusion.primary === 'bikeshare')
    .companions.find((companion) => companion.id === 'velo-pulse-fr');
  assert.equal(entry.disabled, true);
  assert.equal(entry.chip, 'Semaine type');
  assert.ok(REGISTERED_LAYER_IDS.includes('velo-pulse-fr'));
  assert.ok(DISABLED_LAYER_IDS.includes('velo-pulse-fr'));

  // And the panel projection agrees: no row, and no chip on anyone else's.
  const rows = groupLayerIdsByCategory().flatMap((group) => group.layerIds);
  assert.ok(!rows.includes('velo-pulse-fr'));
  const byId = new Map(LAYER_TAXONOMY.map((row) => [row.id, row]));
  assert.deepEqual(byId.get('bikeshare').companions.map((c) => c.id), ['shared-mobility-fr']);
});

test('a fusion may withdraw every companion it has', () => {
  // Validation accepts it rather than calling it an empty fusion: the entry is
  // still the statement that these layers are one subject, and taking the flags
  // back off is how the row gets its strip again. `fusionCompanionsFor` then
  // answers `null` rather than `[]`, so such a row renders exactly like an
  // unfused one instead of opening a control strip with nothing in it.
  const table = [
    { primary: 'a', companions: [{ id: 'b', chip: 'B', disabled: true }] },
  ];
  assert.equal(validateLayerFusions(table, ['a', 'b']), true);
  // The shipped table's own case: `bikeshare` keeps one offered companion, so
  // it still has a strip — the `null` branch is the contract, asserted above on
  // every layer that has no fusion at all.
  assert.equal(fusionCompanionsFor('cctv'), null);
});

test('validation refuses the four ways a fusion table goes wrong', () => {
  const ids = ['a', 'b', 'c'];
  assert.throws(
    () => validateLayerFusions([{ primary: 'zz', companions: [{ id: 'a', chip: 'A' }] }], ids),
    /Unknown fusion primary/,
  );
  assert.throws(
    () => validateLayerFusions([{ primary: 'a', companions: [{ id: 'zz', chip: 'Z' }] }], ids),
    /Unknown fusion companion/,
  );
  assert.throws(
    () => validateLayerFusions([{ primary: 'a', companions: [] }], ids),
    /Fusion has no companion/,
  );
  assert.throws(
    () => validateLayerFusions([
      { primary: 'a', companions: [{ id: 'b', chip: 'B' }] },
      { primary: 'c', companions: [{ id: 'b', chip: 'B' }] },
    ], ids),
    /Layer claimed by two fusions/,
  );
  assert.throws(
    () => validateLayerFusions([
      { primary: 'a', companions: [{ id: 'b', chip: 'B' }] },
      { primary: 'b', companions: [{ id: 'c', chip: 'C' }] },
    ], ids),
    /Fusion primary is already a companion|Fusion companion is also a primary/,
  );
  assert.throws(
    () => validateLayerFusions([{ primary: 'a', companions: [{ id: 'b' }] }], ids),
    /missing chip label/,
  );
  assert.throws(
    () => validateLayerFusions([{ primary: 'a', companions: [{ id: 'b', chip: 'B', disabled: 'yes' }] }], ids),
    /disabled flag must be a boolean/,
  );
});

test('the digital-infrastructure row is laid out as tiles, each lit in the colour its layer draws', () => {
  const tiles = fusionTilesFor('local-datacenters');
  assert.deepEqual(tiles.map((tile) => [tile.id, tile.part]), [
    ['telegeography-submarine-cables', null],
    ['local-datacenters', null],
    ['anfr-fr', 'masts'],
    ['anfr-fr', 'coverage'],
  ]);
  assert.deepEqual(tiles.map((tile) => tile.label), ['Câbles', 'Data centers', 'Antennes', 'Couverture 4G']);
  // The colour of a lit tile is the map's, so the tile is also a swatch. The
  // table writes literals (it is imported at boot, the modules are not); this
  // is what keeps them from drifting. The coverage opens on the dead zones.
  assert.deepEqual(tiles.map((tile) => tile.color), [
    BASE_CABLE_COLOR, DATACENTER_HALL_COLOR, ANFR_BAND_COLORS['5g'], COVERAGE_RAMP[0],
  ]);
  for (const tile of tiles) assert.ok(tile.icon.startsWith('data:image/svg+xml;base64,'), `${tile.id}:${tile.part}`);
  assert.match(tiles[3].title, /ARCEP/);
  // Every other row keeps its chips.
  const tiled = LAYER_FUSIONS.filter((fusion) => fusionTilesFor(fusion.primary));
  assert.deepEqual(tiled.map((fusion) => fusion.primary), ['local-datacenters']);
});

test('validation refuses a tile set that leaves a member without a switch', () => {
  const ids = ['a', 'b', 'c'];
  const row = (tiles, extra = {}) => [{
    primary: 'a',
    primaryChip: 'A',
    primaryToggle: true,
    companions: [{ id: 'b', chip: 'B' }, { id: 'c', chip: 'C', disabled: true }],
    tiles,
    ...extra,
  }];
  const tile = (id, extra = {}) => ({ id, icon: 'database', color: '#00ffff', ...extra });
  assert.equal(validateLayerFusions(row([tile('b'), tile('a')]), ids), true, 'any order, withdrawn member left out');
  assert.throws(() => validateLayerFusions(row([tile('a')]), ids), /Fusion member has no tile: a → b/);
  assert.throws(() => validateLayerFusions(row([tile('a'), tile('b'), tile('c')]), ids), /not an offered member/);
  assert.throws(() => validateLayerFusions(row([tile('a'), tile('b'), tile('b')]), ids), /listed twice/);
  assert.throws(() => validateLayerFusions(row([tile('a', { icon: 'plane' }), tile('b')]), ids), /unknown icon/);
  assert.throws(() => validateLayerFusions(row([tile('a', { color: 'cyan' }), tile('b')]), ids), /#rrggbb/);
  assert.throws(() => validateLayerFusions(row([]), ids), /non-empty array/);
  assert.throws(() => validateLayerFusions(row([tile('a'), tile('b')], { primaryToggle: false }), ids),
    /tiles need primaryToggle/);
});

test('a member split into parts gets one tile per part, each switching the same params, one lit by the row', () => {
  const ids = ['a', 'b'];
  const row = (tiles) => [{
    primary: 'a', primaryChip: 'A', primaryToggle: true, companions: [{ id: 'b', chip: 'B' }], tiles,
  }];
  const tile = (id, extra = {}) => ({ id, icon: 'database', color: '#00ffff', ...extra });
  const part = (name, extra = {}) => tile('b', {
    part: name, on: { [name]: true }, off: { [name]: false }, lit: name === 'x', ...extra,
  });
  assert.equal(validateLayerFusions(row([tile('a'), part('x'), part('y')]), ids), true);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x')]), ids), /needs a sibling/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x'), part('x')]), ids), /listed twice: b:x/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x'), tile('b')]), ids), /whole tile beside its parts/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x'), part('y', { on: {} })]), ids), /on and off/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x'), part('y', { off: { z: false } })]), ids),
    /same params on and off/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x'), part('y', { lit: 'no' })]), ids), /lit flag/);
  assert.throws(() => validateLayerFusions(row([tile('a'), part('x', { lit: false }), part('y')]), ids),
    /nothing to light/);
});

test('the antennas split into masts and coverage: the row lights the masts, and a link keeps what the tiles say', () => {
  const parts = fusionTilesFor('local-datacenters').filter((tile) => tile.id === 'anfr-fr');
  assert.deepEqual(tilePartDefaults(parts), { masts: true, coverage: 'off' },
    'the state the row toggle has always switched the antennas on in');
  const [masts, coverage] = parts;
  assert.equal(tilePartIsOff({ masts: true, coverage: 'sfr' }, masts), false);
  assert.equal(tilePartIsOff({ masts: true, coverage: 'sfr' }, coverage), false);
  assert.equal(tilePartIsOff({ masts: false, coverage: 'off' }, masts), true);
  assert.equal(tilePartIsOff({ masts: false, coverage: 'off' }, coverage), true);
  // Every param a part switches is one the share link carries, both ways.
  const state = normalizeLayerState({
    enabledLayerIds: ['anfr-fr'],
    options: { 'anfr-fr': { ...masts.off, ...coverage.on } },
  });
  const params = encodeLayerStateParams(new URLSearchParams('v=2'), state);
  const antennas = params.get('lo').split('_').filter((assignment) => assignment.startsWith('an.'));
  assert.deepEqual(antennas, ['an.c.z', 'an.m.0']);
  assert.deepEqual(decodeLayerStateParams(params).options['anfr-fr'], { coverage: 'gaps', masts: false });
  // A link written before the tile says nothing of the masts, and keeps them.
  assert.equal(decodeLayerStateParams(new URLSearchParams('v=2&l=an&lo=an.c.z')).options['anfr-fr'].masts, true);
});
