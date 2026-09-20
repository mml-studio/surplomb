// The site report in English, composed from the same four stubbed routes the
// French tests fan out to.
//
// This card is the layer's entire product and every sentence on it is argued.
// Three are refusals, and they are what these assertions are for: the BRACKET
// (a population is a range, because a ten-minute walk is 1.1 km across and an
// INSEE cell is 200 m), the TRUNCATION (a cut-short page is a floor, not a
// range with a ± that does not cover the missing cells), and the IMPUTATION
// (three sentences, because "none imputed" is a claim about INSEE's flag and
// cannot be made when the flag did not arrive).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import { ficheFetch, ficheLines, letterPhrase } from './implantationFiche.js';
import { FICHE_MISSING_WORDS } from './implantationFiche.i18n.js';

const RING = [
  [4.8280, 45.7690], [4.8360, 45.7690], [4.8360, 45.7720], [4.8280, 45.7720],
];
const ISOCHRONE_PAYLOAD = {
  profile: 'foot',
  rings: [{ seconds: 600, areaKm2: 0.94, ring: RING, resourceVersion: '2026-08-25' }],
  missing: 0,
  expansion: [],
};

const CARREAUX_PAYLOAD = {
  resolution: 200,
  cells: [
    {
      n: 2_531_400, e: 3_918_600, ind: 500, men: 220, niveau: 24_000, pauvrete: 14,
      jeunes: 19, aines: 16, social: 8, solo: 46, proprietaires: 33, est: 0, com: '69381',
    },
    {
      n: 2_531_400, e: 3_918_800, ind: 300, men: 130, niveau: 21_000, pauvrete: 22,
      jeunes: 24, aines: 12, social: 40, solo: 38, proprietaires: 18, est: 1, com: '69381',
    },
  ],
  communes: { 69381: 'Lyon 1er Arrondissement' },
};

const GPU_PAYLOAD = {
  zones: [{ code: 'UA', label: 'centre-ville', kind: 'u', approvedOn: '2019-03-12', atPoint: true }],
  servitudes: [{ label: 'AC1 monument historique' }],
};

const DVF_PAYLOAD = {
  summary: { count: 47, comparableCount: 31, medianPrixM2: 4200 },
  years: '2020-2024',
  commune: { name: 'Lyon 1er' },
};

const BAN_PAYLOAD = {
  features: [{
    properties: {
      label: '20 Place Bellecour 69002 Lyon', city: 'Lyon', citycode: '69382',
      postcode: '69002', distance: 12,
    },
  }],
};

function stubFetch({ silent = [] } = {}) {
  return async (url) => {
    const target = String(url);
    if (silent.some((fragment) => target.includes(fragment))) {
      return { ok: false, status: 503, json: async () => ({ error: 'down' }) };
    }
    if (target.includes('/api/isochrone')) return json(ISOCHRONE_PAYLOAD);
    if (target.includes('/api/filosofi/carreaux')) return json(CARREAUX_PAYLOAD);
    if (target.includes('/api/gpu')) return json(GPU_PAYLOAD);
    if (target.includes('/api/dvf')) return json(DVF_PAYLOAD);
    if (target.includes('api-adresse.data.gouv.fr')) return json(BAN_PAYLOAD);
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
const json = (body) => ({ ok: true, status: 200, json: async () => body });

async function fiche(options = {}) {
  const response = await ficheFetch(
    'gev:fiche?lat=45.7578&lon=4.8357&seconds=600', {}, { impl: stubFetch(options) },
  );
  return response.json();
}

/** Published names the report relays: an address, a commune, a zoning label. */
const PUBLISHED = ['Place Bellecour', 'Lyon', 'centre-ville', 'AC1 monument historique'];

test('the whole report answers in English, and no line shatters the card', async (t) => {
  useTestLocale('en', t);
  const { details, title } = ficheLines(await fiche());
  assert.equal(title, '20 Place Bellecour 69002 Lyon');
  assert.ok(details.length >= 6, `expected a full report, got ${details.length} lines`);
  // `cardFromEntity()` splits on ' · ': a line carrying one arrives as two.
  for (const line of details) assert.ok(!line.includes(' · '), `would shatter the card: ${line}`);
  assertNoFrench(details, { allow: PUBLISHED });
});

test('the headline is a bracket in English, and the four counts still add up', async (t) => {
  useTestLocale('en', t);
  const { details } = ficheLines(await fiche());
  assert.ok(details.some((line) => /^Between .* and .* depending on whether whole cells/.test(line)),
    details.join(' | '));
  const partition = details.find((line) => /cells of \d+ m kept by their center/.test(line));
  assert.ok(partition, details.join(' | '));
  const [, counted, touched, inside, straddling] = /(\d+) cells of \d+ m kept by their center out of (\d+) touched \((\d+) whole, (\d+) straddling\)/
    .exec(partition) || [];
  assert.ok(counted, `the partition line does not parse: ${partition}`);
  assert.equal(Number(inside) + Number(straddling), Number(touched),
    'whole + straddling must equal touched, or a reader cannot add them up');
});

test('a truncated page is a floor in English too, and drops the bracket', async (t) => {
  useTestLocale('en', t);
  const composed = await fiche();
  const cut = ficheLines({
    ...composed,
    demand: { ...composed.demand, truncated: true, matched: 12_400 },
  }).details;
  assert.ok(cut.some((line) => /^At least .* residents — the count is incomplete$/.test(line)),
    cut.join(' | '));
  assert.ok(cut.some((line) => line.includes('12,400 cells in the box')), cut.join(' | '));
  assert.ok(cut.some((line) => line.includes('this total is a floor, not a range')), cut.join(' | '));
  assert.ok(!cut.some((line) => /^Between /.test(line)),
    'a bracket that excludes missing cells is not a bracket');
  // And the count that was ranked is now a floor, which the imputation line
  // beside it does not touch: the two refusals are independent.
  assert.ok(cut.some((line) => line.includes('approximated values, not observed')), cut.join(' | '));
});

test('the imputation stays three different English sentences', async (t) => {
  useTestLocale('en', t);
  const composed = await fiche();
  const some = ficheLines(composed).details;
  assert.ok(some.some((line) => /^1 cell imputed out of /.test(line)), some.join(' | '));
  const none = ficheLines({
    ...composed, demand: { ...composed.demand, imputedCells: 0, imputedShare: 0 },
  }).details;
  assert.ok(none.some((line) => /^No cell imputed out of the \d+ kept$/.test(line)), none.join(' | '));
  // "None imputed" is a claim about INSEE's flag; without the flag it is not made.
  const silent = ficheLines({
    ...composed,
    demand: {
      ...composed.demand, imputedCells: 0, imputedShare: 0, imputedUnknown: 2,
    },
  }).details;
  assert.ok(silent.some((line) => line.startsWith('Imputation not reported for 2')), silent.join(' | '));
});

test('the planning and market lines answer in English, the register’s words kept', async (t) => {
  useTestLocale('en', t);
  const { details } = ficheLines(await fiche());
  // The code and the register's own label are data; the date is formatted.
  assert.ok(details.some((line) => line === 'PLU zone UA, centre-ville (approved on Mar 12, 2019)'),
    details.join(' | '));
  // A family the nomenclature table does not know is shown exactly as the
  // register published it — this fixture's `AC1 monument historique` is not
  // one of the eighteen sentences `gpuFeed.i18n.js` carries.
  assert.ok(details.some((line) => line === '1 easement, AC1 monument historique'),
    details.join(' | '));
  assert.ok(details.some((line) => /^DVF median €[\d,]+\/m² over \d+ comparable sales/.test(line)),
    details.join(' | '));
});

test('a silent source is named in English, and the row says the report is partial', async () => {
  const composed = await fiche({ silent: ['/api/dvf', 'api-adresse'] });
  const en = withLocale('en', () => ficheLines(composed)).details;
  assert.ok(en.some((line) => line === 'Silent sources — market, address'), en.join(' | '));
  const fr = withLocale('fr', () => ficheLines(composed)).details;
  assert.ok(fr.some((line) => line === 'Sources muettes — marché, adresse'), fr.join(' | '));
  // The tokens themselves never move: the payload and the tests pin them.
  assert.deepEqual(composed.missing, ['marché', 'adresse']);
  assert.deepEqual(Object.keys(FICHE_MISSING_WORDS.definition),
    ['carroyage', 'carroyage tronqué', 'urbanisme', 'marché', 'adresse']);
});

test('a catchment the isochrone refused says so in English', async (t) => {
  useTestLocale('en', t);
  const { details } = ficheLines(await fiche({ silent: ['/api/isochrone'] }));
  assert.ok(details.includes('Catchment area unavailable — the IGN isochrone service did not answer'),
    details.join(' | '));
});

test('a letter pair is a pair in English, because the band is not settled', () => {
  assert.equal(withLocale('en', () => letterPhrase({ letterLow: 'C', letterHigh: 'B' })), 'B or C');
  assert.equal(withLocale('fr', () => letterPhrase({ letterLow: 'C', letterHigh: 'B' })), 'B ou C');
  assert.equal(withLocale('en', () => letterPhrase({
    letterLow: 'B', letterHigh: 'B', letter: 'B', ferme: true,
  })), 'B');
});

test('a report with no address falls back to the commune, then to a generic title', () => {
  assert.equal(withLocale('en', () => ficheLines({ address: { commune: 'Lyon' } })).title, 'Lyon');
  assert.equal(withLocale('en', () => ficheLines({})).title, 'Site report');
  assert.equal(withLocale('fr', () => ficheLines({})).title, 'Fiche implantation');
});
