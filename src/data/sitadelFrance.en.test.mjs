// The drawn Sitadel layer in English, on the SAME Nantes pack the French
// tests pin.
//
// The property the whole layer was written around has to survive translation:
// the RATE at which the join succeeded travels with every object it produced.
// A permit drawn in Paris (91.3% of the municipality placed) and one drawn in
// Toulouse (7.6%) look identical on the globe, so the card carries both the
// municipality's rate and the year's rate — in English exactly as in French,
// with the same numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  SITADEL_METRES_PER_DWELLING,
  SITADEL_PRISM_BASE_M,
  SITADEL_PRISM_MAX_M,
  buildSitadelLoadingLabel,
  sitadelDetectLabel,
  sitadelHeightLegend,
  sitadelJoinLines,
} from './sitadelFrance.js';
import {
  SITADEL_SIZE_CEILING_LGT,
  indexCadastreParcels,
  projectSitadelCommune,
} from './sitadelFeed.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const H44 = read('sitadel-logements-44109-sample.json');
const D44 = read('sitadel-demolir-44109-sample.json');
const C44 = read('sitadel-cadastre-44109-sample.json');
const COMMUNE44 = read('sitadel-commune-44109-sample.json')[0];

const { index, parcels: cadastreParcels } = indexCadastreParcels([C44]);
const PACK = projectSitadelCommune({
  housing: H44,
  demolition: D44,
  index,
  commune: COMMUNE44,
  outline: {
    parts: [[COMMUNE44.contour.coordinates[0]]], simplified: true, sourceParts: 1, servedParts: 1,
  },
  millesime: '2026-08',
  cadastreEdition: '2026-06-01',
  cadastreCommunes: ['44109'],
  cadastreParcels,
});

test('the provenance block carries the same rates in English', (t) => {
  useTestLocale('en', t);
  const lines = sitadelJoinLines(PACK);
  assert.equal(lines[0],
    'Nantes: 9 of 14 permits placed (64.3%) — cadastral join, no coordinate published');
  assert.equal(lines[1], 'Sitadel vintage 2026-08 · Etalab cadastre 2026-06-01');
  assertNoFrench(lines, { allow: ['Nantes'] });
});

test('the year’s own rate is added in English, because the failure is age-dependent', (t) => {
  useTestLocale('en', t);
  const year = PACK.permits[0].y;
  const tally = PACK.years.find((entry) => entry.year === year);
  const lines = sitadelJoinLines(PACK, PACK.permits[0]);
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith(`Permits from ${year} here: ${tally.placed} of ${tally.permits} placed`),
    lines[1]);
  assert.ok(lines[1].endsWith('— a parcel gets divided when somebody builds on it'), lines[1]);
});

test('a municipality where nothing was placed still gets a line, and it says 0', () => {
  const empty = { commune: 'Nulle-Part', summary: { placed: 0, permits: 12 }, millesime: '2026-08' };
  const line = withLocale('en', () => sitadelJoinLines(empty))[0];
  assert.ok(line.startsWith('Nulle-Part: 0 of 12 permits placed (0%)'), line);
  // A permit whose year is not in the tally gets no year line rather than a
  // divide by zero — in either language.
  assert.equal(withLocale('en', () => sitadelJoinLines(empty, { y: '2013' })).length, 2);
});

test('the height key publishes its scale in English, cap and clipping included', (t) => {
  useTestLocale('en', t);
  const legend = sitadelHeightLegend({
    parcels: 14, permits: 14, prisms: 10, clipped: 1, tallestM: 200,
    demolition: 3, noDwellings: 1, coldFloor: 2,
  });
  const [scale, flat, cold] = legend;
  // A height scale is not a colour, so these rows carry none.
  assert.equal(scale.color, null);
  assert.equal(scale.label, `Height = dwellings authorized · 1 dwelling = ${SITADEL_METRES_PER_DWELLING} m`);
  assert.ok(scale.blurb.includes(`${SITADEL_PRISM_BASE_M} m square column per file`), scale.blurb);
  assert.ok(scale.blurb.includes(`capped at ${SITADEL_PRISM_MAX_M} m (${SITADEL_SIZE_CEILING_LGT} dwellings`),
    scale.blurb);
  assert.ok(scale.blurb.endsWith('· 1 column capped, the card keeps the true count.'), scale.blurb);
  assert.equal(flat.label, 'No height — parcel left flat, outlined in its own color');
  assert.ok(flat.blurb.includes('33 columns and not one that counts a dwelling'), flat.blurb);
  assert.equal(cold.label, 'Ground not resolved yet — no column meanwhile');
  assertNoFrench(legend);
});

test('an uncapped key says so, rather than staying silent about the cap', () => {
  const blurb = withLocale('en', () => sitadelHeightLegend({
    parcels: 14, permits: 14, prisms: 10, clipped: 0, demolition: 0, noDwellings: 0, coldFloor: 0,
  })[0].blurb);
  assert.ok(blurb.endsWith('· no column capped here.'), blurb);
});

test('the row line and the DETECT fallback answer in English', (t) => {
  useTestLocale('en', t);
  assert.equal(buildSitadelLoadingLabel({ payload: null, status: 'no-view', loading: false }),
    'The center of the screen does not meet the ground — aim at the terrain');
  const line = buildSitadelLoadingLabel({
    payload: PACK, status: 'ready', loading: false, commune: 'Nantes', tally: null,
  });
  assert.ok(line.startsWith('Nantes · 9 permits placed on'), line);
  assert.ok(line.includes('municipal outline simplified'), line);
  assertNoFrench(line, { allow: ['Nantes'] });
  assert.equal(sitadelDetectLabel(null), 'Planning permit');
  assert.equal(withLocale('fr', () => sitadelDetectLabel(null)), 'Autorisation d’urbanisme');
});
