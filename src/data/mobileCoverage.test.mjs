import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COVERAGE_ALPHA,
  COVERAGE_DRAPE_ALPHA,
  COVERAGE_HATCH,
  COVERAGE_MODES,
  COVERAGE_OPERATORS,
  COVERAGE_RAMP,
  coverageCardText,
  coverageSelectionPanel,
  coverageHatchLut,
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
import { coverageOverzoomSource } from './mobileCoverageImagery.js';
import {
  COVERAGE_TILE_EDGE,
  coverageTileCode,
  decodeCoverageRgba,
  paintCoverageTile,
} from './mobileCoverageTile.js';
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
  const rgba = new Uint8ClampedArray(COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE * 4);
  rgba.set([
    encodeCoverage([0, 3, 3, 3]), 0, 0, 255, // Orange absent → rung 0
    encodeCoverage([3, 0, 0, 0]), 0, 0, 255, // Orange very good → bare
    encodeCoverage([0, 0, 0, 0]), 0, 0, 0, //   sea → bare
  ]);
  const tile = decodeCoverageRgba(rgba);
  assert.equal(coverageTileCode(tile, 0, 0), encodeCoverage([0, 3, 3, 3]));
  assert.equal(coverageTileCode(tile, 2, 0), null);
  const out = paintCoverageTile(tile, lut, new Uint32Array(COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE));
  const bytes = new Uint8Array(out.buffer);
  assert.deepEqual([...bytes.slice(0, 4)], [0xf0, 0x28, 0x7a, Math.round(COVERAGE_ALPHA * 255)]);
  assert.deepEqual([...bytes.slice(4, 12)], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('rung 0 is hatched: its stripes add ink of its own colour, every other code paints as the plain table', () => {
  for (const [mode, alpha] of [['gaps', COVERAGE_ALPHA], ['sfr', COVERAGE_DRAPE_ALPHA]]) {
    const plain = coverageLut(mode, alpha);
    const hatch = coverageHatchLut(mode, alpha);
    const stripeAlpha = Math.round(COVERAGE_HATCH.alpha * 255);
    for (let code = 0; code < 256; code++) {
      if (coverageRung(code, mode) === 0) {
        assert.equal(hatch[code] & 0xffffff, plain[code] & 0xffffff, `code ${code} keeps rung 0's colour`);
        // More ink, never less: the hatched class stays the darkest (B3).
        assert.equal(hatch[code] >>> 24, stripeAlpha);
        assert.ok(stripeAlpha > (plain[code] >>> 24));
      } else {
        assert.equal(hatch[code], plain[code], `code ${code} is not hatched`);
      }
    }
  }
  // The stripe period divides the tile edge, so stripes run on across tiles.
  assert.equal(256 % COVERAGE_HATCH.period, 0);
});

test('painting with the hatch table stripes rung 0 along x + y and leaves every other code alone', () => {
  const lut = coverageLut('gaps');
  const hatch = { lut: coverageHatchLut('gaps'), period: COVERAGE_HATCH.period, width: COVERAGE_HATCH.width };
  const { period, width } = COVERAGE_HATCH;
  const tile = (code) => ({ codes: new Uint8Array(256 * 256).fill(code), land: null });
  const paint = (code, stripes, crop = null) => paintCoverageTile(tile(code), lut, new Uint32Array(256 * 256), crop, stripes);
  const alphaAt = (out, x, y) => out[y * 256 + x] >>> 24;
  const stripe = Math.round(COVERAGE_HATCH.alpha * 255);
  const fill = Math.round(COVERAGE_ALPHA * 255);
  const dead = paint(encodeCoverage([0, 0, 0, 0]), hatch);
  for (const [x, y] of [[0, 0], [1, 1], [5, 250], [255, 255]]) {
    assert.equal(alphaAt(dead, x, y), (x + y) % period < width ? stripe : fill, `(${x}, ${y})`);
  }
  // Without a hatch table the painter is exactly what it was.
  assert.equal(alphaAt(paint(encodeCoverage([0, 0, 0, 0]), null), 0, 0), fill);
  // A rung that is not 0 carries no stripe at all.
  const one = paint(encodeCoverage([3, 0, 0, 0]), hatch);
  assert.equal(alphaAt(one, 0, 0), fill);
  assert.equal(alphaAt(one, 4, 4), fill);
  // Past the pyramid the stripes are laid on the OUTPUT: a quarter magnified
  // twice keeps three pixels in eight, not six in sixteen.
  const magnified = paint(encodeCoverage([0, 0, 0, 0]), hatch, { sx: 128, sy: 128, size: 128 });
  for (const [x, y] of [[0, 0], [3, 0], [7, 0], [8, 0]]) {
    assert.equal(alphaAt(magnified, x, y), (x + y) % period < width ? stripe : fill, `magnified (${x}, ${y})`);
  }
  // Off land stays transparent, stripe or not.
  const coast = { codes: new Uint8Array(256 * 256), land: new Uint8Array(256 * 256 / 8) };
  assert.equal(paintCoverageTile(coast, lut, new Uint32Array(256 * 256), null, hatch)[0], 0);
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
    ['Opérateurs qui captent', null],
    ['Aucun : zone blanche', COVERAGE_RAMP[0]],
    ['1 seul opérateur', COVERAGE_RAMP[1]],
    ['2 opérateurs', COVERAGE_RAMP[2]],
    ['3 opérateurs', COVERAGE_RAMP[3]],
    ['Les 4 : sans teinte', null],
  ]);
  assert.equal(coverageLegend(META, 'gaps')[0].heading, true);
  assert.deepEqual(coverageLegend(META, 'orange').map((e) => e.label), [
    'Réseau Orange', 'Pas de réseau', 'Faible : dehors seulement', 'Bon', 'Très bon : sans teinte',
  ]);
  // Every class paints the ground, so each is keyed by a patch; rung 0 is
  // keyed hatched, as the map draws it, in both modes and nowhere else.
  for (const mode of ['gaps', 'orange']) {
    const classes = coverageLegend(META, mode).filter((entry) => !entry.heading);
    assert.ok(classes.every((entry) => entry.swatch === 'area'), mode);
    assert.deepEqual(classes.map((entry) => entry.pattern ?? null), ['hatch', null, null, null, null].slice(0, classes.length), mode);
  }
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

test('the key card: « Au point sélectionné », who has signal, and one row per operator with bars', () => {
  const at = { lon: 6.8652, lat: 45.8326 };
  const read = coverageSelectionPanel({ ...at, reading: { inside: true, code: encodeCoverage([3, 2, 1, 0]) } });
  assert.equal(read.title, 'Au point sélectionné');
  assert.equal(read.key, 'coverage:6.86520,45.83260', 'the spot keys the card, so a new click is revealed');
  assert.deepEqual(read.lines, ['3 opérateurs sur 4 captent ici']);
  assert.deepEqual(read.rows.items, [
    { label: 'Orange', value: 'très bon', meter: { value: 3, max: 3 } },
    { label: 'SFR', value: 'bon', meter: { value: 2, max: 3 } },
    { label: 'Bouygues', value: 'faible (dehors seulement)', meter: { value: 1, max: 3 } },
    { label: 'Free', value: 'aucun réseau', meter: { value: 0, max: 3 } },
  ]);
  // No source line: the block prints it right above the card.
  assert.equal(read.footnote, undefined);

  // Every other state keeps the same key, and says what it is doing.
  assert.deepEqual(coverageSelectionPanel({ ...at, reading: null }).lines, ['Chargement…']);
  assert.deepEqual(coverageSelectionPanel({ ...at, reading: null, failed: true }).lines,
    ['Lecture impossible pour le moment.']);
  assert.deepEqual(coverageSelectionPanel({ ...at, reading: { inside: false } }).lines,
    ['Pas de données ici', 'La carte couvre la France métropolitaine, hors mer.']);
  assert.equal(coverageSelectionPanel({ ...at, reading: { inside: false } }).rows, undefined);
  assert.equal(coverageSelectionPanel(null), null);
  assert.equal(coverageSelectionPanel({ lon: NaN, lat: 45 }), null);
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
