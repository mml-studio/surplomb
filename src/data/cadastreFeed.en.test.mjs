// The cadastral parcels in both languages, on the captured Api Carto answer:
// the four scale bands, the two areas that disagree, the sheet line, the
// tolerance and the four status lines a row can print.
//
// The claim this layer exists to protect is the one that had to survive the
// translation: a cadastral line is a FISCAL boundary, drawn at a published
// scale, and the tolerance beside it is computed from that scale — never a
// surveyed figure. It is printed with its assumption in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  CADASTRE_SCALE_BANDS,
  CADASTRE_UNKNOWN_BAND,
  cadastreAreaLines,
  cadastreCommuneLine,
  cadastreLoadingLabel,
  cadastreParcelTitle,
  cadastreSheetLine,
  cadastreToleranceLine,
  formatSignedPercent,
  formatSurfaceM2,
  frenchOrdinal,
  projectCadastreParcels,
} from './cadastreFeed.js';

const FIXTURE = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/cadastre-parcelle-sample.json', import.meta.url)),
  'utf8',
));
const PAYLOAD = projectCadastreParcels({
  parcelle: FIXTURE.parcelle,
  feuille: FIXTURE.feuille,
  box: {
    south: -22, west: -62, north: 52, east: 56,
  },
});

const parcelById = (idu) => PAYLOAD.parcels.find((parcel) => parcel.u === idu);

test('the four scale bands say what they were surveyed at', () => {
  const bands = withLocale('en', () => [...CADASTRE_SCALE_BANDS, CADASTRE_UNKNOWN_BAND]
    .map(({ label, blurb }) => ({ label, blurb })));
  assertNoFrench(bands);
  assert.deepEqual(bands.map((band) => band.label),
    ['Fine plan', 'Urban plan', 'Rural plan', 'Extensive plan', 'Scale unknown']);
  assert.equal(bands[0].blurb,
    'Surveyed at 1:250 or 1:500 — dense city centers. Line ±0.13 to 0.25 m.');
  assert.match(bands.at(-1).blurb, /^Sheet not joined, or a scale outside the four bands/);
  assert.deepEqual(withLocale('fr', () => CADASTRE_SCALE_BANDS.map((band) => band.label)),
    ['Plan fin', 'Plan urbain', 'Plan rural', 'Plan étendu']);
});

test('a parcel is named, placed and ranked in English', () => {
  const parcel = parcelById('75103000AP0045');
  const en = withLocale('en', () => ({
    title: cadastreParcelTitle(parcel),
    commune: cadastreCommuneLine(parcel, PAYLOAD.communes),
  }));
  assertNoFrench(en, { allow: ['Paris'] });
  assert.equal(en.title, 'Parcel AP 0045');
  assert.equal(en.commune, 'Paris 3rd · INSEE 75056');
  assert.equal(withLocale('fr', () => cadastreCommuneLine(parcel, PAYLOAD.communes)),
    'Paris 3ᵉ · INSEE 75056');
  assert.equal(withLocale('en', () => frenchOrdinal(1)), '1st');
  assert.equal(withLocale('fr', () => frenchOrdinal(1)), '1ᵉʳ');
});

test('the two areas are both printed, and the gap is signed in each language', () => {
  const disagreeing = PAYLOAD.parcels
    .find((parcel) => parcel.c > 0 && Math.abs(parcel.a / parcel.c - 1) > 0.05);
  const en = withLocale('en', () => cadastreAreaLines(disagreeing));
  assertNoFrench(en);
  assert.match(en[0], /^Registered area /);
  assert.match(en[1], /^Drawn .* against the registered area$/);
  assert.match(en[1], /[+−]\d/);
  const fr = withLocale('fr', () => cadastreAreaLines(disagreeing));
  assert.match(fr[0], /^Contenance déclarée /);
  assert.match(fr[1], /^Tracé .* contre la contenance$/);
});

test('an unpublished or zero area says which of the two it is', () => {
  assert.deepEqual(withLocale('en', () => cadastreAreaLines({ c: null, a: 185 })),
    ['Registered area not published', 'Drawn 185 m²']);
  assert.equal(withLocale('en', () => cadastreAreaLines({ c: 0, a: 0.109 })[0]),
    'Registered area declared 0 m² — published exactly as it came');
  assert.equal(withLocale('en', () => formatSurfaceM2(265_900)), '26.59 ha');
  assert.equal(withLocale('fr', () => formatSurfaceM2(265_900)), '26,59 ha');
  assert.equal(withLocale('en', () => formatSignedPercent(-0.0032)), '−0.32%');
  assert.equal(withLocale('fr', () => formatSignedPercent(-0.0032)), '−0,32 %');
});

test('the sheet and its tolerance never travel without their assumption', () => {
  const parcel = parcelById('75103000AP0045');
  const sheet = PAYLOAD.sheets[parcel.k];
  const en = withLocale('en', () => ({
    sheet: cadastreSheetLine(sheet, parcel),
    tolerance: cadastreToleranceLine(sheet),
    unknown: cadastreToleranceLine({ e: null }),
  }));
  assertNoFrench(en);
  assert.equal(en.sheet, 'Sheet AP 01 at 1:500 · edition 2026-06-01');
  assert.equal(en.tolerance, 'Plan line ±0.25 m (0.5 mm at plan scale)');
  assert.equal(en.unknown, 'Tolerance cannot be computed — the plan’s scale is unknown');
  assert.equal(withLocale('fr', () => cadastreSheetLine(sheet, parcel)),
    'Feuille AP 01 au 1:500 · édition 2026-06-01');
  assert.equal(withLocale('fr', () => cadastreToleranceLine(sheet)),
    'Trait de plan ±0,25 m (0,5 mm à l\'échelle)');
});

test('the four refusals of the row read in English', () => {
  const en = withLocale('en', () => ({
    tooHigh: cadastreLoadingLabel({ status: 'too-high' }),
    offCoverage: cadastreLoadingLabel({ status: 'off-coverage' }),
    tooDense: cadastreLoadingLabel({ status: 'too-dense', totalInBox: 15_977 }),
    empty: cadastreLoadingLabel({ status: 'empty' }),
    loading: cadastreLoadingLabel({ status: 'loading' }),
  }));
  assertNoFrench(en, { allow: ['Api Carto', 'PCI vecteur'] });
  assert.match(en.tooHigh, /^Zoom in below [\d,]+ m to load the parcels$/);
  assert.equal(en.offCoverage,
    'Outside PCI vecteur coverage (mainland France and the overseas departments)');
  assert.equal(en.tooDense, '15,977 parcels here — past the 5,000 Api Carto returns. Zoom in.');
  assert.equal(en.empty, 'No parcel here — public land, or outside France');
  assert.equal(en.loading, 'Api Carto parcels…');
  assert.match(withLocale('fr', () => cadastreLoadingLabel({ status: 'too-dense', totalInBox: 15_977 })),
    /^15 977 parcelles ici — au-delà des 5 000 qu'Api Carto renvoie\. Zoome\.$/);
});
