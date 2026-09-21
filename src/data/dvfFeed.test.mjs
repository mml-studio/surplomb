// src/data/dvfFeed.test.mjs
// Pins the UPSTREAM DVF shape against a real captured commune-year edition.
// This is the projection the dev-server proxy runs, and the arithmetic it
// guards is the kind that fails silently: every trap below produces a
// plausible NUMBER when handled wrongly, never an exception.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DVF_DEFAULT_RADIUS_M,
  DVF_MAX_RADIUS_M,
  DVF_SECTION_MIN_PRICED,
  DVF_UNCOVERED_DEPARTEMENTS,
  aggregateSalesIntoPlots,
  aggregateSalesIntoSections,
  buildDvfUrl,
  clampDvfRadius,
  compareMutationRecency,
  decodeParts,
  decodeRing,
  departementOf,
  dvfCoverage,
  encodeParts,
  encodeRing,
  groupMutations,
  haversineM,
  mostRecentMutation,
  parseDvfCsv,
  percentile,
  sectionIdOf,
  selectNearbySales,
} from './dvfFeed.js';

const CSV = readFileSync(new URL('./fixtures/dvf-75113-2024-sample.csv', import.meta.url), 'utf8');
const ROWS = parseDvfCsv(CSV);
const MUTATIONS = groupMutations(ROWS);
/** The point the fixture was selected around — avenue de France, Paris 13e. */
const ORIGIN = { lon: 2.3760, lat: 48.8300 };

test('the captured edition still carries every column the projection reads', () => {
  assert.equal(ROWS.length, 194);
  for (const key of [
    'id_mutation', 'date_mutation', 'nature_mutation', 'valeur_fonciere',
    'type_local', 'surface_reelle_bati', 'nombre_pieces_principales',
    'id_parcelle', 'longitude', 'latitude',
  ]) {
    assert.ok(Object.hasOwn(ROWS[0], key), `${key} must still be published`);
  }
});

test('the file is keyed per arrondissement, not per commune', () => {
  // 75113, not 75056. This URL is the whole reason the BAN reverse geocoder is
  // the only accepted source of the commune code — see the module header.
  assert.equal(
    buildDvfUrl({ year: 2024, communeCode: '75113' }),
    'https://files.data.gouv.fr/geo-dvf/latest/csv/2024/communes/75/75113.csv',
  );
  assert.equal(departementOf('97213'), '972', 'overseas codes are three digits');
  assert.equal(departementOf('2A004'), '2A', 'Corsican codes carry a letter');
  assert.throws(() => departementOf('75'), /invalid commune code/);
  assert.throws(() => buildDvfUrl({ year: 1999, communeCode: '75113' }), /before the first published edition/);
});

test('a price belongs to the mutation, not to the row', () => {
  const block = MUTATIONS.find((entry) => entry.id === '2024-1225294');
  // One building. 179 rows. €32,000,000 restated on every one of them.
  assert.equal(block.rowCount, 179);
  assert.equal(block.valeur, 32_000_000);

  const perRow = ROWS.reduce((sum, row) => sum + (Number(row.valeur_fonciere) || 0), 0);
  const perMutation = MUTATIONS.reduce((sum, entry) => sum + (entry.valeur || 0), 0);
  // The naive column sum inflates this fixture by more than nine times, and
  // the full 2024 edition of the 13e from €0.89 bn to €15.33 bn. Neither
  // number throws; both look like money.
  assert.ok(perRow > perMutation * 9, `${perRow} vs ${perMutation}`);
});

test('a 179-lot block sale yields no price per square metre', () => {
  const block = MUTATIONS.find((entry) => entry.id === '2024-1225294');
  assert.equal(block.dwellingCount, 95);
  assert.equal(block.prixM2, null, 'the register does not say how €32 M was split');
});

test('a flat sold with its cellar is a comparable; sold with a shop it is not', () => {
  const withCellar = MUTATIONS.find((entry) => entry.id === '2024-1222246');
  assert.deepEqual(withCellar.types, ['Appartement', 'Dépendance']);
  assert.equal(withCellar.prixM2, 7182);

  const withShop = MUTATIONS.find((entry) => entry.id === '2024-1210710');
  assert.ok(withShop.types.some((type) => type.startsWith('Local')));
  assert.equal(withShop.prixM2, null);
});

test('a swap is not a sale, and its nominal value never reaches a median', () => {
  const swap = MUTATIONS.find((entry) => entry.nature === 'Echange');
  // €2,295 declared for a Paris flat: 66 €/m² if trusted, which would drag any
  // median in a thin radius through the floor.
  assert.equal(swap.valeur, 2295);
  assert.equal(swap.prixM2, null);
  // It is still RETURNED — it happened — it simply carries no ratio.
  assert.ok(MUTATIONS.includes(swap));
});

test('a mutation with no value and one with no position both survive as facts', () => {
  const noValue = MUTATIONS.find((entry) => entry.id === '2024-1217380');
  assert.equal(noValue.valeur, null);
  assert.equal(noValue.prixM2, null);

  const noPosition = MUTATIONS.find((entry) => entry.id === '2024-1213795');
  assert.equal(noPosition.lon, null);
  assert.equal(noPosition.lat, null);
  // It has a price, so it is not a broken row — it just cannot be drawn.
  assert.equal(noPosition.prixM2, 10464);
});

test('an unplaceable mutation is excluded from a radius, not counted in it', () => {
  const { sales, summary } = selectNearbySales(MUTATIONS, ORIGIN, 300);
  assert.equal(summary.count, 3);
  assert.equal(sales.every((sale) => sale.lon !== null), true);
  for (let i = 1; i < sales.length; i += 1) {
    assert.ok(sales[i].distanceM >= sales[i - 1].distanceM, 'sorted by distance');
  }
  assert.equal(summary.comparableCount, 3);
  assert.equal(summary.medianPrixM2, 8857);
});

test('the summary separates what was found from what was comparable', () => {
  const { summary } = selectNearbySales(MUTATIONS, ORIGIN, 1000);
  // A reader must be able to see the gap rather than read a median computed
  // from a subset as if it came from the whole.
  assert.ok(summary.count >= summary.comparableCount);
  assert.equal(typeof summary.perYear['2024'].count, 'number');
  assert.equal(typeof summary.perYear['2024'].comparableCount, 'number');
});

test('the radius is clamped rather than trusted', () => {
  assert.equal(clampDvfRadius(99_999), DVF_MAX_RADIUS_M);
  assert.equal(clampDvfRadius(1), 50);
  assert.equal(clampDvfRadius(undefined), 300);
});

test('percentiles interpolate, and refuse an empty set', () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([7], 0.5), 7);
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
});

test('the parser honours quotes it has never yet seen', () => {
  // The captured file contains no quote at all. A street name with a comma
  // would not fail loudly — it would shift every later column by one and
  // publish a longitude as a surface.
  assert.equal(CSV.includes('"'), false);
  const parsed = parseDvfCsv('a,b\n"x,y",2\n');
  assert.deepEqual(parsed, [{ a: 'x,y', b: '2' }]);
  assert.deepEqual(parseDvfCsv(''), []);
});

test('an absent parameter takes the default, not the minimum', () => {
  // FOUND LIVE. `URLSearchParams.get()` returns `null` when a parameter is
  // absent, `Number(null)` is `0`, and `Number.isFinite(0)` is true — so the
  // clamp read "the caller said nothing" as "the caller said zero" and returned
  // its MINIMUM. `GET /api/dpe` with no radius scanned 50 m instead of 200 m and
  // reported `total: 0` for an address with 2,805 diagnostics around it.
  const absent = new URL('http://x/?other=1').searchParams.get('radius');
  assert.equal(absent, null);
  assert.equal(clampDvfRadius(absent), DVF_DEFAULT_RADIUS_M);
  assert.equal(clampDvfRadius(''), DVF_DEFAULT_RADIUS_M);
  assert.equal(clampDvfRadius(undefined), DVF_DEFAULT_RADIUS_M);
  // An EXPLICIT zero is still a request, and is still clamped to the floor.
  assert.equal(clampDvfRadius('0'), 50);
});

test('the four départements the register does not reach are named, not silently empty', () => {
  // MEASURED 2026-09-08 on the 2024 edition: 67482 (Strasbourg), 57463 (Metz),
  // 68224 (Mulhouse) and 97611 (Mamoudzou) each answer 404 with a 233-byte
  // body, while 97411 (Saint-Denis de La Réunion) answers 200 with 647,463
  // bytes. A 404 and an empty commune are indistinguishable downstream, and
  // "the register does not cover this département" is not "no sale was
  // recorded here" — three million people live under the first sentence.
  assert.deepEqual([...DVF_UNCOVERED_DEPARTEMENTS], ['57', '67', '68', '976']);
  for (const code of ['67482', '57463', '68224', '97611']) {
    assert.equal(dvfCoverage(code).basis, 'livre-foncier', code);
  }
  // The overseas guess that would have been wrong: La Réunion is covered.
  assert.equal(dvfCoverage('97411').basis, 'dvf');
  assert.equal(dvfCoverage('75113').basis, 'dvf');
  assert.equal(dvfCoverage('2A004').basis, 'dvf');
  // No commune resolved is its own state, never "covered".
  assert.equal(dvfCoverage(null).basis, 'unknown');
  assert.equal(dvfCoverage('nonsense').basis, 'unknown');
});

test('the distance the estimate measures is the distance the map drew', () => {
  // Exported so `avisValeurFeed.js` cannot grow a second haversine that
  // disagrees with this one about where a 300 m circle ends.
  assert.equal(Math.round(haversineM(48.83, 2.3735, 48.83, 2.3735)), 0);
  const [first] = MUTATIONS.filter((mutation) => mutation.lon !== null);
  const { sales } = selectNearbySales([first], { lon: first.lon, lat: first.lat }, 300);
  assert.equal(sales[0].distanceM, 0);
  // One minute of latitude is a nautical mile, to a metre.
  assert.equal(Math.round(haversineM(48.0, 2.0, 48.0 + 1 / 60, 2.0)), 1853);
});

// ── the area regimes ───────────────────────────────────────────────────────
// The one rule that cannot bend: a box straddles communes, and a sale is
// divided by the median of ITS OWN commune. Everything else here follows.
const LYON_BOX = { south: 45.76, west: 4.84, north: 45.78, east: 4.86 };
const sale = (fields) => ({ types: ['Appartement'], dwellingSurface: 50, dwellingCount: 1, ...fields });

test('each commune keeps its own denominator across a box', () => {
  const cheap = {
    commune: { code: '69383', name: 'Lyon 3e' },
    mutations: [
      sale({ lon: 4.8450, lat: 45.7700, prixM2: 4_000, parcelle: '69383000AB0001', date: '2024-01-02' }),
      sale({ lon: 4.8452, lat: 45.7701, prixM2: 4_000, parcelle: '69383000AB0002', date: '2024-02-02' }),
      sale({ lon: 4.8454, lat: 45.7702, prixM2: 4_000, parcelle: '69383000AB0003', date: '2024-03-02' }),
    ],
  };
  const dear = {
    commune: { code: '69386', name: 'Lyon 6e' },
    mutations: [
      sale({ lon: 4.8550, lat: 45.7760, prixM2: 8_000, parcelle: '69386000CD0001', date: '2024-01-02' }),
      sale({ lon: 4.8552, lat: 45.7761, prixM2: 8_000, parcelle: '69386000CD0002', date: '2024-02-02' }),
      sale({ lon: 4.8554, lat: 45.7762, prixM2: 8_000, parcelle: '69386000CD0003', date: '2024-03-02' }),
    ],
  };
  const { plots, summary } = aggregateSalesIntoPlots([cheap, dear], LYON_BOX);
  assert.equal(summary.references.length, 2);
  // 4 000 in a commune whose median is 4 000 and 8 000 in one whose median is
  // 8 000 are the SAME reading: both at their own market. A single blended
  // denominator of 6 000 would have painted one 0.67 and the other 1.33.
  assert.equal(plots.length, 6);
  for (const plot of plots) assert.equal(plot.ratio, 1);
  const { sections } = aggregateSalesIntoSections([cheap, dear], LYON_BOX);
  assert.deepEqual(sections.map((section) => section.id), ['69383000AB', '69386000CD']);
  for (const section of sections) assert.equal(section.medianRatio, 1);
});

test('a plot is painted from its LATEST sale, with the whole plot counted', () => {
  const edition = {
    commune: { code: '75116', name: 'Paris 16e Arrondissement' },
    mutations: [
      // The commune median is 10 000 over these three.
      sale({ id: 'old', lon: 2.2700, lat: 48.8600, prixM2: 12_000, parcelle: '75116000BM0001', date: '2023-03-01' }),
      sale({ id: 'new', lon: 2.2700, lat: 48.8600, prixM2: 8_000, parcelle: '75116000BM0001', date: '2025-10-13', address: '62 BD SUCHET', dwellingSurface: 89 }),
      sale({ id: 'else', lon: 2.2750, lat: 48.8620, prixM2: 10_000, parcelle: '75116000BM0002', date: '2024-05-05' }),
    ],
  };
  const { plots, summary } = aggregateSalesIntoPlots([edition], { south: 48.85, west: 2.26, north: 48.87, east: 2.28 });
  const plot = plots.find((entry) => entry.id === '75116000BM0001');
  assert.equal(plot.count, 2);
  assert.equal(plot.ratio, 0.8, 'the 2025 sale at 8 000 against a median of 10 000');
  // What the card prints, and nothing it does not: the surface travels.
  assert.deepEqual(plot.sale, {
    date: '2025-10-13', nature: null, valeur: null, types: ['Appartement'], prixM2: 8_000,
    dwellingSurface: 89, dwellingCount: 1, address: '62 BD SUCHET',
  });
  assert.equal(summary.basis, 'plots');
  assert.equal(summary.count, 3);
  assert.equal(summary.plots, 2);
});

test('the latest sale wins even when it cannot be priced — the rule below 600 m', () => {
  const edition = {
    commune: { code: '75116', name: 'Paris 16e' },
    mutations: [
      sale({ lon: 2.27, lat: 48.86, prixM2: 9_000, parcelle: '75116000BM0001', date: '2023-01-01' }),
      sale({ lon: 2.27, lat: 48.86, prixM2: null, types: ['Dépendance'], dwellingCount: 0, parcelle: '75116000BM0001', date: '2025-01-01' }),
    ],
  };
  const { plots, summary } = aggregateSalesIntoPlots([edition], { south: 48.85, west: 2.26, north: 48.87, east: 2.28 });
  assert.equal(plots[0].ratio, null);
  assert.equal(summary.pricedPlots, 0);
});

test('the recency order is the one the markers use, and it never depends on input order', () => {
  const small = { id: 'z', date: '2024-05-05', dwellingSurface: 30 };
  const large = { id: 'a', date: '2024-05-05', dwellingSurface: 90 };
  assert.equal(mostRecentMutation([small, large]), large);
  assert.equal(mostRecentMutation([large, small]), large);
  assert.ok(compareMutationRecency({ date: '2025-01-01' }, { date: '2024-12-31' }) > 0);
  assert.equal(mostRecentMutation([]), null);
});

test('a sale outside the box is in the denominator and nowhere else', () => {
  const box = { south: 45.77, west: 4.84, north: 45.78, east: 4.86 };
  const edition = {
    commune: { code: '69386', name: 'Lyon 6e' },
    mutations: [
      sale({ lon: 4.8500, lat: 45.7750, prixM2: 5_000, parcelle: '69386000AB0001', date: '2024-01-02' }),
      // Same commune, outside the box: it belongs in the DENOMINATOR and must
      // not be counted as something the reader can see.
      sale({ lon: 4.9500, lat: 45.9000, prixM2: 9_000, parcelle: '69386000ZZ0001', date: '2024-01-03' }),
    ],
  };
  const { plots, summary } = aggregateSalesIntoPlots([edition], box);
  assert.equal(summary.count, 1);
  assert.deepEqual(plots.map((plot) => plot.id), ['69386000AB0001']);
  // The denominator still saw both — that is the whole point of keeping the
  // reference's own sample size separate from the box's.
  assert.equal(summary.references[0].count, 2);
  // A section is selected by a sale in the box, and the other one's section
  // was never touched.
  const { sections } = aggregateSalesIntoSections([edition], box);
  assert.deepEqual(sections.map((section) => section.id), ['69386000AB']);
});

test('a section is drawn whole, so every one of its sales counts, in the box or not', () => {
  const box = { south: 45.77, west: 4.84, north: 45.78, east: 4.86 };
  const edition = {
    commune: { code: '69386', name: 'Lyon 6e' },
    mutations: [
      sale({ lon: 4.8500, lat: 45.7750, prixM2: 5_000, parcelle: '69386000AB0001', date: '2024-01-02' }),
      // Same section, just across the box's northern edge.
      sale({ lon: 4.8500, lat: 45.7810, prixM2: 6_000, parcelle: '69386000AB0002', date: '2023-01-02' }),
      sale({ lon: 4.8500, lat: 45.7812, prixM2: 7_000, parcelle: '69386000AB0003', date: '2025-01-02' }),
    ],
  };
  const { sections, summary } = aggregateSalesIntoSections([edition], box);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].count, 3);
  assert.equal(sections[0].pricedCount, 3);
  assert.equal(sections[0].medianPrixM2, 6_000);
  assert.deepEqual(sections[0].years, [2023, 2024, 2025]);
  assert.equal(summary.inBox, 1);
  assert.equal(summary.count, 3);
  assert.equal(summary.paintedSections, 1);
  assert.equal(summary.minPriced, DVF_SECTION_MIN_PRICED);
});

test('a section under the floor still reports its median, and is not counted as painted', () => {
  const box = { south: 45.77, west: 4.84, north: 45.78, east: 4.86 };
  const { sections, summary } = aggregateSalesIntoSections([{
    commune: { code: '69386', name: 'Lyon 6e' },
    mutations: [
      sale({ lon: 4.8500, lat: 45.7750, prixM2: 5_000, parcelle: '69386000AB0001', date: '2024-01-02' }),
      sale({ lon: 4.8501, lat: 45.7751, prixM2: null, parcelle: '69386000AB0002', date: '2024-01-03' }),
    ],
  }], box);
  assert.equal(sections[0].pricedCount, 1);
  assert.equal(sections[0].medianRatio, 1);
  assert.equal(summary.paintedSections, 0);
});

test('a commune whose edition prices nothing yields no ratio, not a ratio of one', () => {
  const box = { south: 45.77, west: 4.84, north: 45.78, east: 4.86 };
  const editions = [{
    commune: { code: '68066', name: 'Colmar' },
    mutations: [sale({ lon: 4.8500, lat: 45.7750, prixM2: null, parcelle: '68066000AB0001', date: '2024-01-02' })],
  }];
  assert.equal(aggregateSalesIntoPlots(editions, box).plots[0].ratio, null);
  assert.equal(aggregateSalesIntoSections(editions, box).sections[0].medianRatio, null);
});

test('a mutation with no coordinate or no parcel is counted, never moved', () => {
  const box = { south: 45.77, west: 4.84, north: 45.78, east: 4.86 };
  const editions = [{
    commune: { code: '69386', name: 'Lyon 6e' },
    mutations: [
      sale({ lon: null, lat: null, prixM2: 5_000, parcelle: '69386000AB0009', date: '2024-01-02' }),
      sale({ lon: 4.8500, lat: 45.7750, prixM2: 5_000, parcelle: null, date: '2024-01-03' }),
      sale({ lon: 4.8501, lat: 45.7751, prixM2: 5_000, parcelle: '69386000AB0001', date: '2024-01-04' }),
    ],
  }];
  const { plots, summary } = aggregateSalesIntoPlots(editions, box);
  assert.equal(summary.count, 2, 'the sale with no coordinate never reaches the box');
  assert.equal(summary.unplotted, 1);
  assert.equal(plots.length, 1);
  assert.equal(aggregateSalesIntoSections(editions, box).summary.unplotted, 1);
});

test('a section is its parcels’ ten-character prefix, and nothing shorter is guessed', () => {
  assert.equal(sectionIdOf('75116000AA0004'), '75116000AA');
  assert.equal(sectionIdOf('920120000A0023'), '920120000A');
  assert.equal(sectionIdOf('75116000AA'), null);
  assert.equal(sectionIdOf(null), null);
});

test('the key names the register’s commune, not the geocoder’s', () => {
  // The BAN answers « Paris » for every arrondissement; the register's own
  // `nom_commune` is what tells two Paris medians apart in a key.
  const { summary } = aggregateSalesIntoPlots([{
    commune: { code: '75116', name: 'Paris' },
    mutations: [sale({ lon: 2.27, lat: 48.86, prixM2: 9_000, commune: 'Paris 16e Arrondissement', parcelle: '75116000AA0001', date: '2024-01-01' })],
  }], { south: 48.85, west: 2.26, north: 48.87, east: 2.28 });
  assert.equal(summary.references[0].name, 'Paris 16e Arrondissement');
  assert.equal(summary.references[0].code, '75116');
});

test('a ring travels as integer offsets and comes back within half a unit', () => {
  const ring = [[2.278123, 48.859127], [2.278456, 48.859127], [2.278456, 48.858901], [2.278123, 48.859127]];
  const flat = encodeRing(ring);
  assert.deepEqual(flat.slice(0, 2), [227812, 4885913]);
  assert.ok(flat.slice(2).every((value) => Number.isInteger(value) && Math.abs(value) < 100));
  const back = decodeRing(flat);
  assert.equal(back.length, ring.length);
  for (const [index, [lon, lat]] of back.entries()) {
    assert.ok(Math.abs(lon - ring[index][0]) <= 0.000005 + 1e-12);
    assert.ok(Math.abs(lat - ring[index][1]) <= 0.000005 + 1e-12);
  }
});

test('a vertex that rounds onto the previous one is dropped, and so is a part that collapses', () => {
  assert.equal(encodeRing([[2.5, 48.5], [2.500001, 48.500001], [2.6, 48.5], [2.6, 48.6]]).length, 6);
  const parts = encodeParts([
    // A sliver thinner than the unit: its outer ring collapses, and its hole
    // must not be promoted to an outline.
    [[[2.5, 48.5], [2.500001, 48.5], [2.500001, 48.500001]], [[2.4, 48.4], [2.41, 48.4], [2.41, 48.41]]],
    [[[2.5, 48.5], [2.6, 48.5], [2.6, 48.6], [2.5, 48.5]]],
  ]);
  assert.equal(parts.length, 1);
  assert.equal(decodeParts(parts)[0][0].length, 4);
});
