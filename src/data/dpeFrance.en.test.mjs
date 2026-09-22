// The energy rating (DPE) layer in both languages: the card of a building,
// the seven-letter key, the coverage line the row prints, and — above 600 m —
// the parcels and cadastral sections painted on the same scale.
//
// The layer's refusals are the part that must survive translation: it never
// averages letters, a shape seen from altitude is painted by its MOST FREQUENT
// class and says so, and the register is not the housing stock. Each of those
// is asserted in English here and in French beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  dpeAreaCard,
  dpeAreaLegendNote,
  dpeAreaRowControls,
  dpeBuildingSummary,
  dpeParcelPanel,
  dpeRowControls,
  dpeScanParams,
  dpeSectionPanel,
  dpeSiteCardDescription,
  dpeSiteTitle,
  dpeSummarize,
  dpeThemeLegend,
} from './dpeFrance.js';
import { dpeSitePlacementLine } from './dpeSites.js';

/** Street names the register published; they stay French inside English. */
const KEEP = ['93 rue du Chevaleret', 'rue du Chevaleret'];

const SITE = {
  address: '93 rue du Chevaleret',
  kind: 'building',
  distanceM: 57,
  points: [
    { etiquetteDpe: 'E', annualCostEur: 900 },
    { etiquetteDpe: 'E', annualCostEur: 700 },
    { etiquetteDpe: 'G', annualCostEur: 1_800 },
    { etiquetteDpe: null },
  ],
  summary: dpeBuildingSummary([
    { etiquetteDpe: 'E' }, { etiquetteDpe: 'E' }, { etiquetteDpe: 'G' }, { etiquetteDpe: null },
  ]),
  shape: { via: 'id', rnbId: 'Q3TWB1672WV4', areaM2: 143, parts: [] },
  parcel: { idu: '75113000BI0020', via: 'idu', contenanceM2: 261 },
};

test('a building card counts ratings, not dwellings, and names its ground', () => {
  const en = withLocale('en', () => dpeSiteCardDescription(SITE));
  assertNoFrench(en, { allow: KEEP });
  assert.equal(en, '4 ratings, from E to G, mostly E · 1 with no published label · '
    + '1 energy-inefficient home (F or G) · €900/yr estimated (median for the site) · '
    + 'footprint 143 m² on the ground · parcel 75113000BI0020 — 261 m² on the cadastre · '
    + 'building named by the rating itself (RNB id) · 57 m from the scan center');
  assert.equal(withLocale('en', () => dpeSiteTitle(SITE)), '93 rue du Chevaleret — 4 ratings');
  // The French is untouched, down to the acronym it counts with.
  assert.match(withLocale('fr', () => dpeSiteCardDescription(SITE)),
    /^4 DPE, de E à G, majorité E · 1 sans étiquette publiée · 1 passoire \(F ou G\)/);
  assert.equal(withLocale('fr', () => dpeSiteTitle(SITE)), '93 rue du Chevaleret — 4 DPE');
});

test('how a site was placed is four different sentences in English too', () => {
  const lines = withLocale('en', () => [
    dpeSitePlacementLine({ kind: 'building' }),
    dpeSitePlacementLine({ kind: 'address' }),
    dpeSitePlacementLine({ shape: { via: 'inside' } }),
    dpeSitePlacementLine({ shape: { via: 'closest', distanceM: 12.4 } }),
  ]);
  assertNoFrench(lines, { allow: KEEP });
  assert.deepEqual(lines, [
    'building named by the register, footprint not published',
    'BAN position — geocoded to the address, not to the building',
    'building found under the BAN point',
    'nearest building to the BAN point — 12 m, an inference',
  ]);
  assert.equal(withLocale('fr', () => dpeSitePlacementLine({ shape: { via: 'inside' } })),
    'bâtiment retrouvé sous le point BAN');
});

test('the volume disagreeing with the badge is said in English', () => {
  const en = withLocale('en', () => dpeSiteCardDescription(SITE, { grade: 'D' }, true));
  assertNoFrench(en, { allow: KEEP });
  assert.match(en, /3D buildings volume painted D/);
  assert.match(withLocale('en', () => dpeSiteCardDescription(
    { address: 'somewhere', points: [{ etiquetteDpe: 'G' }], summary: dpeBuildingSummary([{ etiquetteDpe: 'G' }]) },
    null, true,
  )), /outside the BD TOPO footprints loaded/);
});

test('the seven letters keep their bounds and their caveat', () => {
  const legend = withLocale('en', () => dpeRowControls({ distribution: { D: 3, F: 1 } }).legend);
  assertNoFrench(legend, { allow: KEEP });
  assert.deepEqual(legend.map((entry) => entry.label),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'no label']);
  assert.equal(legend[3].blurb, '181 to 250 kWh/m²/yr — the published class is the worse of '
    + 'the two axes, energy and greenhouse gas.');
  assert.match(legend.at(-1).blurb, /^A rating present in the register with no usable label/);
  assert.match(withLocale('fr', () => dpeRowControls({}).legend)[3].blurb,
    /^181 à 250 kWh\/m²\/an — la classe publiée est la pire des deux axes/);
});

test('a volume painted from disagreeing ratings says so, singular and plural', () => {
  const values = [
    { grade: 'E', mixed: true }, { grade: 'E', mixed: true }, { grade: 'D', mixed: true },
  ];
  const en = withLocale('en', () => dpeThemeLegend(values));
  assertNoFrench(en, { allow: KEEP });
  assert.match(en.find((entry) => entry.label === 'E').blurb,
    / 2 buildings painted E are not unanimous: the ratings that differ keep their full-size badge on the roof\.$/);
  assert.match(en.find((entry) => entry.label === 'D').blurb,
    / 1 building painted D is not unanimous/);
  assert.match(withLocale('fr', () => dpeThemeLegend(values)).find((e) => e.label === 'E').blurb,
    /2 immeubles peints E ne sont pas unanimes/);
});

test('the coverage line says what was served, painted and outlined', () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, etiquetteDpe: 'D' }));
  const en = withLocale('en', () => dpeSummarize({
    entries,
    total: 2_805,
    distribution: { D: 200 },
    siteCoverage: { sites: 10, outlined: 8, parcelled: 6 },
  }).coverage);
  assertNoFrench(en, { allow: KEEP });
  assert.equal(en, '200 ratings served out of 2,805 within 200 m (the nearest to the center) '
    + '· 10 addresses · 8 with a building footprint');
  assert.match(withLocale('fr', () => dpeSummarize({
    entries, total: 2_805, distribution: { D: 200 }, siteCoverage: { sites: 10, outlined: 8 },
  }).coverage), /^200 DPE servis sur 2 805 dans 200 m \(les plus proches du centre\)/);
});

/* ── the area regimes ──────────────────────────────────────────────────── */

const PARCELS = {
  box: { south: 45.75, west: 4.82, north: 45.77, east: 4.84 },
  band: 'fine',
  parcels: [
    {
      id: '69382000AV0052',
      counts: [0, 0, 1, 5, 6, 0, 0],
      ungraded: 0,
      snapped: 12,
      addresses: ['11 Rue Général Plessier 69002 Lyon', '2 Rue Franklin 69002 Lyon'],
      moreAddresses: 1,
      communeCode: '69382',
      parts: [],
    },
    { id: '69382000AV0053', counts: [0, 0, 0, 3, 3, 0, 0], ungraded: 0, snapped: 0, communeCode: '69382', parts: [] },
    { id: '69382000AV0054', counts: [0, 0, 0, 0, 0, 0, 0], ungraded: 2, snapped: 0, communeCode: '69382', parts: [] },
  ],
  summary: {
    basis: 'parcels', parcels: 3, total: 20, graded: 18, ungraded: 2,
    distribution: { A: 0, B: 0, C: 1, D: 8, E: 9, F: 0, G: 0 },
    inside: 6, snapped: 12, unplaced: 2, tiles: 4, tilesMissing: 1, tilesPartial: 0,
  },
};

const SECTIONS = {
  box: { south: 45.72, west: 4.8, north: 45.8, east: 4.88 },
  band: 'coarse',
  communeNames: { 69387: 'Lyon 7e Arrondissement' },
  sections: [
    { id: '69387000AP', counts: [0, 0, 46, 159, 140, 63, 30], ungraded: 0, snapped: 0, whole: 250, communeCode: '69387', parts: [] },
    { id: '693870000B', counts: [0, 0, 0, 89, 0, 0, 0], ungraded: 0, snapped: 0, communeCode: '69387', parts: [] },
  ],
  summary: {
    basis: 'sections', sections: 2, total: 527, graded: 527, ungraded: 0,
    distribution: { A: 0, B: 0, C: 46, D: 248, E: 140, F: 63, G: 30 }, gridM: 50,
    inside: 527, snapped: 0, unplaced: 0, tiles: 4, tilesMissing: 0,
  },
};

test('the parcel key counts parcels on the A–G scale and names its rule', () => {
  const { legend, legendNote, note } = withLocale('en', () => dpeAreaRowControls(PARCELS));
  assertNoFrench({ legend, legendNote, note }, { allow: KEEP });
  assert.deepEqual(legend.map((entry) => entry.label), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'no label']);
  // 6 E against 5 D paints E; 3 D and 3 E is a tie, and a tie goes to the worse.
  assert.deepEqual(legend.map((entry) => entry.count), [0, 0, 0, 0, 2, 0, 0, 1]);
  assert.equal(legend[0].channel, 'Parcels painted');
  assert.equal(legendNote, 'Classes published by the ADEME: the worse of the two grades, energy '
    + 'and greenhouse gas · tinted ground = the parcel, painted by the most frequent class of its '
    + 'ratings (a tie goes to the worse) · 0% energy-inefficient homes (F or G) here, 9.75% in '
    + 'the national register · a rating is compulsory on a sale or a new let: the register is '
    + 'not the housing stock');
  assert.equal(note, 'View over 2.2 km a side: 20 ratings on 3 parcels · 12 ratings placed on '
    + 'the parcel whose frontage their address point touches (under 3 m) · 2 ratings with no '
    + 'parcel under their address point, not drawn · 1 tile of 4 did not answer: this ground is '
    + 'empty for want of data, not for want of a rating · drop below 600 m to get each building '
    + 'and its labels back.');
  assert.match(withLocale('fr', () => dpeAreaLegendNote(PARCELS)),
    /sol teinté = la parcelle, peinte par la classe la plus fréquente de ses DPE \(à égalité, la plus mauvaise\)/);
});

test('the parcel card names its addresses, its classes and how it was placed', () => {
  const panel = withLocale('en', () => dpeParcelPanel(PARCELS.parcels[0]));
  assertNoFrench(panel, { allow: [...KEEP, 'Rue Général Plessier', '69002 Lyon', 'Rue Franklin'] });
  assert.equal(panel.title, '11 Rue Général Plessier');
  assert.equal(panel.meta, '69002 Lyon');
  assert.equal(panel.headline, '12 ratings');
  assert.deepEqual(panel.chips.items.map((item) => item.label), ['C', 'D', 'E']);
  assert.equal(panel.chips.text, 'From C to E');
  assert.deepEqual(panel.lines, [
    '2 Rue Franklin · and 1 other address',
    'Most frequent class: E',
    '12 placed from the frontage: address point just outside the parcel, on its boundary',
  ]);
  assert.match(panel.footnote, /^Each rating describes one dwelling, not the whole building · parcel 69382000AV0052/);
  const tie = withLocale('en', () => dpeParcelPanel(PARCELS.parcels[1]));
  assert.ok(tie.lines.includes('Most frequent class: E, tied with D (the worse one is kept)'));
  const fr = withLocale('fr', () => dpeParcelPanel(PARCELS.parcels[0]));
  assert.equal(fr.headline, '12 diagnostics');
  assert.ok(fr.lines.includes('Classe la plus fréquente : E'));
});

test('the section key and card say which sections the grid could not vouch for', () => {
  const { legend, note } = withLocale('en', () => dpeAreaRowControls(SECTIONS));
  assertNoFrench({ legend, note }, { allow: [...KEEP, 'Lyon 7e Arrondissement'] });
  assert.equal(legend.at(-1).label, 'fewer than 3 certain ratings');
  assert.equal(legend.at(-1).count, 1, 'a section fed only by squares astride its edge stays neutral');
  assert.equal(legend[3].count, 1);
  assert.equal(legend[0].channel, 'Sections painted');
  assert.match(legend.at(-1).blurb, /^A section is painted only when at least 3 ratings fall in 50 m squares/);
  assert.equal(note, 'View over 8.8 km a side: 2 cadastral sections, 527 ratings · ratings '
    + 'counted per 50 m square, each square given to the section under its centre · drop below '
    + '1,800 m to see each parcel.');
  const panel = withLocale('en', () => dpeSectionPanel(SECTIONS.sections[0], SECTIONS));
  assert.equal(panel.title, 'Section AP · Lyon 7e Arrondissement');
  assert.equal(panel.headline, '438 ratings');
  assert.ok(panel.lines.includes('250 ratings in squares lying wholly inside the section'));
  const neutral = withLocale('en', () => dpeSectionPanel(SECTIONS.sections[1], SECTIONS));
  assert.equal(neutral.title, 'Section B · Lyon 7e Arrondissement');
  assert.ok(neutral.lines.includes('too few certain ratings to paint the section (fewer than 3)'));
  const card = withLocale('fr', () => dpeAreaCard({ kind: 'section', record: SECTIONS.sections[0] }, SECTIONS));
  assert.equal(card.title, 'Section AP · Lyon 7e Arrondissement');
  assert.match(card.details.join(' | '), /438 diagnostics · De C à G/);
});

test('the key filter keeps the counts whole and dims what it hides', () => {
  const { legend, legendSegments } = withLocale('en',
    () => dpeAreaRowControls(PARCELS, { classes: 'E' }));
  assert.deepEqual(legend.map((entry) => entry.count), [0, 0, 0, 0, 2, 0, 0, 1]);
  assert.deepEqual(legendSegments.filter((segment) => segment.active).map((segment) => segment.label), ['E']);
});

test('above 600 m the scan asks only for the tiles on screen', () => {
  const point = { lat: 45.7620, lon: 4.8355, altitudeM: 900 };
  const whole = dpeScanParams(point, null);
  assert.equal(whole.tiles, undefined, 'an unknown view asks for the whole box');
  assert.equal(whole.south, '45.750000');
  // The point snaps to the box 45.75–45.77 × 4.83–4.85; this view sits in its
  // north-west tile, more than the ~100 m margin from every other one.
  const narrow = dpeScanParams(point, { south: 45.763, west: 4.8335, north: 45.769, east: 4.8385 });
  assert.equal(narrow.tiles, '0010');
  assert.deepEqual(dpeScanParams({ ...point, altitudeM: 300 }, null), { radius: '200', limit: '200' });
});

test('the key says when only the part on screen was loaded', () => {
  const partial = { ...PARCELS, summary: { ...PARCELS.summary, tiles: 2, tilesInBox: 4, tilesMissing: 0 } };
  assert.match(withLocale('en', () => dpeAreaRowControls(partial).note),
    /only the part on screen is loaded: 2 of 4 tiles/);
  assert.match(withLocale('fr', () => dpeAreaRowControls(partial).note),
    /seule la partie à l’écran est chargée : 2 tuile\(s\) sur 4/);
});
