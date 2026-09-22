import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COVERAGE_ALPHA,
  COVERAGE_DRAPE_ALPHA,
  COVERAGE_MODES,
  COVERAGE_OPERATORS,
  COVERAGE_RAMP,
  coverageCardText,
  coverageLegend,
  coverageLevel,
  coverageLut,
  coverageOperatorCount,
  coverageMonthLabel,
  coverageRung,
  coverageTileAt,
  coverageTileUrl,
  encodeCoverage,
  normalizeCoverageMode,
} from './mobileCoverage.js';
import { paintCoverageRgba, coverageCodeAt, coverageOverzoomSource } from './mobileCoverageImagery.js';
import {
  LAYER_STATE_VERSION,
  createDefaultLayerState,
  decodeLayerStateParams,
  encodeLayerStateParams,
} from './layerState.js';

test('every one of the 256 codes decodes back to the four levels it was built from', () => {
  for (let code = 0; code < 256; code++) {
    const levels = COVERAGE_OPERATORS.map((_, i) => coverageLevel(code, i));
    assert.equal(encodeCoverage(levels), code);
  }
  assert.deepEqual(COVERAGE_OPERATORS.map((op) => op.shift), [0, 2, 4, 6]);
  assert.deepEqual(COVERAGE_OPERATORS.map((op) => op.id), ['orange', 'sfr', 'bouygues', 'free']);
});

test('a dead zone is where no operator reaches even LIMITED coverage', () => {
  assert.equal(coverageOperatorCount(encodeCoverage([0, 0, 0, 0])), 0);
  assert.equal(coverageRung(encodeCoverage([0, 0, 0, 0]), 'gaps'), 0);
  // One operator at "limited" is not a dead zone: it is rung 1.
  assert.equal(coverageRung(encodeCoverage([0, 0, 1, 0]), 'gaps'), 1);
  assert.equal(coverageRung(encodeCoverage([3, 3, 3, 0]), 'gaps'), 3);
  // Four operators, at ANY level: not painted.
  assert.equal(coverageRung(encodeCoverage([1, 1, 1, 1]), 'gaps'), -1);
  assert.equal(coverageRung(encodeCoverage([3, 3, 3, 3]), 'gaps'), -1);
});

test('an operator mode paints that operator only: none, limited, good — and leaves very good bare', () => {
  const code = encodeCoverage([0, 1, 2, 3]);
  assert.equal(coverageRung(code, 'orange'), 0);
  assert.equal(coverageRung(code, 'sfr'), 1);
  assert.equal(coverageRung(code, 'bouygues'), 2);
  assert.equal(coverageRung(code, 'free'), -1);
  assert.equal(coverageRung(code, 'off'), -1);
  assert.equal(coverageRung(code, 'nobody'), -1);
});

test('the lookup table paints each rung with one alpha, and leaves the unpainted fully transparent', () => {
  const lut = coverageLut('gaps');
  const alpha = Math.round(COVERAGE_ALPHA * 255);
  const rgba = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24];
  const hex = (value) => `#${rgba(value).slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  assert.equal(hex(lut[encodeCoverage([0, 0, 0, 0])]), COVERAGE_RAMP[0]);
  assert.equal(hex(lut[encodeCoverage([3, 0, 0, 0])]), COVERAGE_RAMP[1]);
  assert.equal(hex(lut[encodeCoverage([3, 3, 0, 0])]), COVERAGE_RAMP[2]);
  assert.equal(hex(lut[encodeCoverage([3, 3, 3, 0])]), COVERAGE_RAMP[3]);
  assert.equal(lut[encodeCoverage([1, 1, 1, 1])], 0);
  for (let code = 0; code < 256; code++) {
    const a = lut[code] >>> 24;
    assert.ok(a === 0 || a === alpha, `code ${code} has alpha ${a}`);
  }
});

test('the draped table is the same ramp at the drape’s one alpha, lighter than the globe’s', () => {
  const globe = coverageLut('gaps');
  const drape = coverageLut('gaps', COVERAGE_DRAPE_ALPHA);
  const drapeAlpha = Math.round(COVERAGE_DRAPE_ALPHA * 255);
  assert.ok(COVERAGE_DRAPE_ALPHA < COVERAGE_ALPHA, 'a linear-light blend weighs the same alpha more');
  for (let code = 0; code < 256; code++) {
    assert.equal(drape[code] & 0xffffff, globe[code] & 0xffffff, `code ${code} keeps its colour`);
    const a = drape[code] >>> 24;
    assert.ok(a === 0 || a === drapeAlpha, `code ${code} has alpha ${a}`);
  }
});

test('painting decoded pixels uses the code in R and leaves sea transparent whatever its code', () => {
  const lut = coverageLut('orange');
  const pixels = new Uint8ClampedArray([
    encodeCoverage([0, 3, 3, 3]), 0, 0, 255, // Orange absent → rung 0
    encodeCoverage([3, 0, 0, 0]), 0, 0, 255, // Orange very good → bare
    encodeCoverage([0, 0, 0, 0]), 0, 0, 0, //   sea → bare
  ]);
  assert.equal(coverageCodeAt(pixels, 0, 0), encodeCoverage([0, 3, 3, 3]));
  paintCoverageRgba(pixels, lut);
  assert.deepEqual([...pixels.slice(0, 4)], [0xf0, 0x28, 0x7a, Math.round(COVERAGE_ALPHA * 255)]);
  assert.deepEqual([...pixels.slice(4, 12)], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('a tile past the finest zoom magnifies the quarter of its zoom-12 ancestor that it covers', () => {
  // Within the pyramid: the tile itself, whole.
  assert.deepEqual(coverageOverzoomSource(12, 2074, 1409, 12), { z: 12, x: 2074, y: 1409, sx: 0, sy: 0, size: 256 });
  // Zoom 13, the drape's finest: the south-east child reads the south-east quarter.
  assert.deepEqual(coverageOverzoomSource(13, 4149, 2819, 12), { z: 12, x: 2074, y: 1409, sx: 128, sy: 128, size: 128 });
  assert.deepEqual(coverageOverzoomSource(13, 4148, 2819, 12), { z: 12, x: 2074, y: 1409, sx: 0, sy: 128, size: 128 });
  // Two levels past: a sixteenth, 64 pixels a side.
  assert.deepEqual(coverageOverzoomSource(14, 8299, 5636, 12), { z: 12, x: 2074, y: 1409, sx: 192, sy: 0, size: 64 });
});

test('Paris lands on the zoom-12 tile Web Mercator puts it on', () => {
  const tile = coverageTileAt(2.3522, 48.8566, 12);
  assert.deepEqual({ x: tile.x, y: tile.y }, { x: 2074, y: 1409 });
  assert.ok(tile.px >= 0 && tile.px < 256 && tile.py >= 0 && tile.py < 256);
  assert.equal(coverageTileAt(0, 89, 12), null);
  assert.equal(coverageTileUrl('2026_T1', 12, 2074, 1409), '/tiles/mobile-coverage/2026_T1/12/2074/1409.png');
  // Each build is its own URL: the tiles are immutable, so a rebuilt quarter must not hide behind the old one.
  assert.equal(coverageTileUrl('2026_T1', 12, 2074, 1409, '2026-09-22T10:11:12.000Z'),
    '/tiles/mobile-coverage/2026_T1/12/2074/1409.png?b=20260922T101112000Z');
});

const META = {
  edition: '2026_T1',
  quarterEnd: '2026-03-31',
  stats: {
    landKm2: 1000,
    histogramKm2: Array.from({ length: 256 }, (_, code) => {
      if (code === encodeCoverage([0, 0, 0, 0])) return 10;
      if (code === encodeCoverage([2, 0, 0, 0])) return 20;
      if (code === encodeCoverage([1, 3, 3, 3])) return 70;
      if (code === encodeCoverage([3, 3, 3, 3])) return 900;
      return 0;
    }),
  },
};

test('the French key names each colour in everyday words, and the uncoloured class too', () => {
  assert.deepEqual(coverageLegend(META, 'gaps').map((e) => [e.label, e.color ?? null]), [
    ['Réseau 4G : opérateurs qui captent', null],
    ['Aucun opérateur : zone blanche', COVERAGE_RAMP[0]],
    ['1 seul opérateur', COVERAGE_RAMP[1]],
    ['2 opérateurs', COVERAGE_RAMP[2]],
    ['3 opérateurs', COVERAGE_RAMP[3]],
    ['Les 4 opérateurs : pas de couleur', null],
  ]);
  assert.equal(coverageLegend(META, 'gaps')[0].heading, true);
  assert.deepEqual(coverageLegend(META, 'orange').map((e) => e.label), [
    'Réseau 4G Orange', 'Pas de réseau', 'Faible : dehors seulement', 'Bon', 'Très bon : pas de couleur',
  ]);
  // A key names colours; it carries no paragraph under them.
  for (const entry of coverageLegend(META, 'gaps')) assert.equal(entry.blurb, undefined);
  assert.deepEqual(coverageLegend(META, 'off'), []);
});

test('the card answers first — who has signal here — then one short line per operator', () => {
  const dead = coverageCardText(META, { inside: true, code: encodeCoverage([0, 0, 0, 0]) }).split('\n');
  assert.deepEqual(dead, [
    'Zone blanche : pas de 4G ici',
    'Orange : aucun réseau',
    'SFR : aucun réseau',
    'Bouygues : aucun réseau',
    'Free : aucun réseau',
    'Estimation des opérateurs (ARCEP, mars 2026)',
  ]);
  const three = coverageCardText(META, { inside: true, code: encodeCoverage([3, 2, 1, 0]) }).split('\n');
  assert.equal(three[0], '3 opérateurs sur 4 captent ici');
  assert.equal(three[1], 'Orange : très bon');
  assert.equal(three[3], 'Bouygues : faible (dehors seulement)');
  assert.equal(coverageCardText(META, { inside: true, code: encodeCoverage([0, 0, 0, 2]) }).split('\n')[0],
    'Seul Free capte ici');
  assert.equal(coverageCardText(META, { inside: true, code: 255 }).split('\n')[0], 'Les 4 opérateurs captent ici');
  assert.deepEqual(coverageCardText(META, { inside: false }).split('\n'),
    ['Pas de données ici', 'La carte couvre la France métropolitaine, hors mer.']);
});

test('an unknown mode is off, and the month the map describes prints in words', () => {
  assert.equal(normalizeCoverageMode('gaps'), 'gaps');
  assert.equal(normalizeCoverageMode('5g'), 'off');
  assert.equal(normalizeCoverageMode(undefined), 'off');
  assert.equal(coverageMonthLabel('2026-03-31'), 'mars 2026');
});

test('every coverage mode survives a share link, and the link does not carry the default', () => {
  for (const mode of COVERAGE_MODES) {
    const state = createDefaultLayerState();
    state.enabledLayerIds = ['anfr-fr'];
    state.options['anfr-fr'] = { coverage: mode };
    const params = encodeLayerStateParams(new URLSearchParams(`v=${LAYER_STATE_VERSION}`), state);
    if (mode === 'off') assert.ok(!String(params.get('lo') || '').includes('an.c.'), 'the default travels as absence');
    const back = decodeLayerStateParams(params);
    assert.equal(back.options['anfr-fr'].coverage, mode, `mode ${mode} through ${params}`);
  }
});
