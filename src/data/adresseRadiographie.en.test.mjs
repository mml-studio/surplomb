// The Address X-ray in English, composed from the SAME captured scan the
// French tests pin: 48.83 N, 2.376 E (Paris 13e), seventeen live answers taken
// through the very URLs `radiographieRequests` builds.
//
// The wording is the product here, and what matters most is what the sheet
// REFUSES to say — so the refusals are asserted in English one by one, beside
// the same sheet in French, proving one composer answers in both languages.
//
// The last block is the drift guard. Seven routes publish their own French
// labels and the server that composes them has no locale; the catalog repeats
// those words so it can translate them by key, and a repetition nobody checks
// is a repetition that rots. Every table is compared against the payload, and
// the two barème sentences against `baremeNational.js` itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRadiographie, distanceLabel } from './adresseRadiographie.js';
import messages, {
  AMENITY_FAMILIES,
  AMENITY_FAMILY_COUNTS,
  ARCEP_TECHNOLOGIES,
  ATMO_BANDS,
  ATMO_POLLUTANTS,
  LOYERS_BASIS,
  LOYERS_SEGMENTS,
  RADON_LABELS,
  RISK_LABELS,
} from './adresseRadiographie.i18n.js';
import { AMENITY_FAMILY_LABELS, AMENITY_FAMILY_PLURALS } from './amenitiesFamilies.js';
import { BAREME_REASONS, baremeReasonLabel, resolveIndicator } from './baremeNational.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const PARTS = JSON.parse(readFileSync(
  new URL('./fixtures/radiographie-paris13-parts.json', import.meta.url),
  'utf8',
));
const POINT = { lat: 48.83, lon: 2.376 };
const AT = Date.UTC(2026, 8, 8, 12, 45);

const compose = (parts = PARTS) => composeRadiographie({ point: POINT, parts, at: AT });
const english = (parts) => withLocale('en', () => compose(parts));
const theme = (fiche, id) => fiche.themes.find((entry) => entry.id === id);
const rows = (fiche, id) => Object.fromEntries(theme(fiche, id).lines.map((row) => [row.label, row]));
const notes = (fiche, id) => theme(fiche, id).notes.join(' ');

/**
 * Names the DATA carries, which no catalog translates and none should: the
 * schools the ministry publishes, the shops the BPE names, the aerodrome, the
 * PLU's own zone label. They are read off the payload rather than typed here,
 * so this list cannot fall behind the fixture.
 */
const DATA_NAMES = [
  ...PARTS.schools.sites.map((site) => site.name),
  ...PARTS.amenities.sites.flatMap((site) => [...(site.names || []), ...(site.kinds || [])]),
  ...PARTS.gpu.zones.map((zone) => zone.label),
  PARTS.dvf.summary.reference.name,
  PARTS.atmo.agency,
  PARTS.bruit.nearest.name,
  // Names of things this repository points at, in both languages.
  'Transit FR', 'Ma connexion internet', 'La Poste',
].filter(Boolean);

test('the ten headings and their questions read in English', () => {
  const fiche = english();
  assert.deepEqual(fiche.themes.map((entry) => entry.label), [
    'Real estate', 'Transport', 'Education', 'Amenities', 'Nuisances',
    'Risks', 'Digital', 'Employment', 'Planning', 'Neighborhood',
  ]);
  assert.equal(theme(fiche, 'voisinage').question,
    'Who lives around, according to the INSEE 200 m grid.');
  assertNoFrench(fiche.themes.map((entry) => `${entry.label} ${entry.question}`));
});

test('the caveat at the top says, in English, what the sheet may and may not grade', () => {
  const fiche = english();
  assert.equal(fiche.gradingNote,
    'Two figures are placed in the country — the ground reachable on foot in ten minutes '
    + 'and the median price per m² — against a scale drawn on 1,200 residents '
    + '(±2.9 percentile points). Everything else is given as a value: a score demands a '
    + 'national distribution measured on the same geometry, and there is none yet '
    + 'for those indicators.');
  // The same sheet in French prints the sentence it always printed.
  assert.match(compose().gradingNote, /^Deux chiffres sont situés dans le pays/);
  assert.match(compose().gradingNote, /même géométrie/);
});

test('exactly two figures carry a rank, and the price says why it carries no letter', () => {
  const fiche = english();
  const ranked = fiche.themes.flatMap((entry) => entry.lines)
    .filter((row) => /percentile nationally/.test(String(row.value)));
  assert.equal(ranked.length, 2);
  const price = rows(fiche, 'immobilier')['This price in the country'];
  assert.equal(price.value, '97th percentile nationally');
  assert.equal(price.note, '94th to 100th percentile. Good news for a seller, '
    + 'bad news for a buyer — one measurement, two readings.');
  assert.equal(/score [A-E]/.test(price.note), false, 'a price never earns a letter');
  const walk = rows(fiche, 'transport')['This walking access in the country'];
  assert.equal(walk.value, '97th percentile nationally');
  assert.match(walk.note, /— score A$/);
});

test('the neighbourhood figures are refused a rank in English too, and say on what rule', () => {
  const fiche = english();
  const ranked = theme(fiche, 'voisinage').lines
    .filter((row) => /percentile/.test(String(row.value)));
  assert.equal(ranked.length, 0);
  assert.match(notes(fiche, 'voisinage'),
    /not on a rectangle of grid cells\. It is the globe’s site report that carries their ranks\./);
  assert.match(notes(fiche, 'voisinage'), /not a catchment area/);
});

test('prices, rents and diagnostics read as US English money', () => {
  const immobilier = rows(english(), 'immobilier');
  assert.equal(immobilier['Median price within 300 m'].value, '€9,063/m²');
  assert.equal(immobilier['Median price within 300 m'].note,
    '119 comparable sales out of 153 transactions');
  assert.equal(immobilier['Middle half of the sales'].value, '€8,001 to €10,505/m²');
  assert.equal(immobilier['Rent — Apartment, 1–2 rooms'].value, '€32.67/m²');
  assert.match(immobilier['Rent — House'].note, /taken from a mesh of neighboring municipalities$/);
  assert.equal(immobilier['Median annual energy cost'].value, '€820');
  assert.match(immobilier['Energy ratings within 200 m'].note, /spread over the 100 ratings read$/);
  assert.match(notes(english(), 'immobilier'), /The labels are not averaged/);
  assert.match(notes(english(), 'immobilier'),
    /1 of the 4 rents was computed for a mesh of neighboring municipalities/);
});

test('a risk report that did not answer is never printed as “no risk”, in English either', () => {
  const degraded = JSON.parse(readFileSync(
    new URL('./fixtures/radiographie-georisques-degrade.json', import.meta.url), 'utf8',
  ));
  const fiche = english({ ...PARTS, risques: degraded });
  const headline = rows(fiche, 'risques')['Risks on record for this point'];
  assert.equal(headline.value, 'not read');
  assert.equal(headline.note, 'the Géorisques report did not answer — this is not “no risk”');
  assert.match(notes(fiche, 'risques'), /The risk statement could not be read for this point\./);
  // The two halves that DID answer are still there, and still in English.
  assert.ok(rows(fiche, 'risques')['Classified facilities (ICPE)']);
  assert.ok(rows(fiche, 'risques')['Radon potential of the municipality']);
});

test('the two Géorisques verdicts are translated and still kept apart', () => {
  const risques = rows(english(), 'risques');
  assert.equal(risques['Clay shrink-swell'].value, 'Risk not known');
  assert.equal(risques['Clay shrink-swell'].note,
    'the municipality is classed “Risk present — major” — the two verdicts differ');
  assert.equal(risques['Radon'].value, 'Risk present — low');
  assert.equal(risques['Hazardous material pipelines'].value, 'Affected');
  assert.equal(risques['Classified industrial facilities (ICPE)'].value, 'Not affected');
  assert.equal(risques['Radon potential of the municipality'].value, 'Low radon potential');
  assert.equal(risques['Radon potential of the municipality'].note, 'class 1 of 3');
});

test('the air, the aircraft, the cable and the mast all answer in English', () => {
  const fiche = english();
  const nuisances = rows(fiche, 'nuisances');
  assert.equal(nuisances['ATMO index of the day'].value, '2 out of 6 — Fair');
  assert.equal(nuisances['ATMO index of the day'].note, 'driven by: ozone');
  assert.equal(nuisances['Ozone'].value, '2 — Fair');
  assert.equal(nuisances['Noise exposure plan'].value, 'none at this point');
  assert.equal(nuisances['Noise exposure plan'].note, 'nearest: ISSY-LES-MOULINEAUX, 7.6 km away');
  assert.match(notes(fiche, 'nuisances'), /the MAXIMUM of the five sub-indices/);
  assert.match(notes(fiche, 'nuisances'), /A PEB is a PLANNING CONSTRAINT, not a measurement/);
  assert.match(notes(fiche, 'nuisances'), /AIRCRAFT noise only\./);

  const numerique = rows(fiche, 'numerique');
  assert.equal(numerique['Fiber (FTTH)'].value, '94.5%');
  assert.equal(numerique['Fiber (FTTH)'].note, '1,575,954 premises');
  assert.notEqual(numerique['Still connectable over copper'].value, '100%');
  assert.match(notes(fiche, 'numerique'), /ARCEP does not publish arrondissements/);
  // The empty ANFR edition is reported as an empty REGISTER, not an empty street.
  assert.match(notes(fiche, 'numerique'),
    /The ANFR register is empty in this edition \(2026-09-03\) — NO mast appears in it ANYWHERE/);
  assert.equal(numerique['ANFR masts around'], undefined);
});

test('the mast rows count what radiates, and say so in English', () => {
  const fiche = english({
    ...PARTS,
    anfr: {
      ...PARTS.anfr,
      edition: '2026-08-27',
      inBox: 3,
      national: { ...PARTS.anfr.national, count: 72_700 },
      supports: [
        { id: 1, live: 0b1100, plan: 0 },
        { id: 2, live: 0b0100, plan: 0b1000 },
        { id: 3, live: 0, plan: 0b1000 },
      ],
    },
  });
  const numerique = rows(fiche, 'numerique');
  assert.equal(numerique['ANFR masts around'].value, '3');
  assert.equal(numerique['ANFR masts around'].note, 'in a box 668 m across · edition 2026-08-27');
  assert.equal(numerique['5G masts'].value, '1');
  assert.equal(numerique['5G masts'].note, '2 more approved, not yet in service');
  assert.equal(numerique['3G masts'], undefined, 'a generation nobody has draws no row');
  assert.match(notes(fiche, 'numerique'), /A mast is a TOWER, not an antenna/);
});

test('schools, amenities, census and permits: the rest of the sheet, in English', () => {
  const fiche = english();
  const education = rows(fiche, 'education');
  assert.equal(education['Schools in the scan box'].value, '14');
  assert.match(education['Schools in the scan box'].note, /high school 3/);
  assert.match(notes(fiche, 'education'),
    /IPS published for 4 of the 6 nearest schools — a missing IPS is never read as an average one\./);
  assert.ok(theme(fiche, 'education').lines.some((row) => row.note === 'IPS not published'));
  assert.ok(theme(fiche, 'education').lines
    .some((row) => /IPS 128 against 120\.2 nationwide/.test(String(row.note))));

  const commodites = rows(fiche, 'commodites');
  assert.equal(commodites['Amenities in the scan box'].note, '39 distinct points');
  assert.match(commodites['Pharmacy'].note, /^6 pharmacies in the box — nearest: /);
  assert.match(notes(fiche, 'commodites'), /The BPE publishes no bar, no café and no museum/);

  const emploi = rows(fiche, 'emploi');
  assert.equal(emploi['Unemployment rate'].value, '11.9%');
  assert.equal(emploi['Unemployment rate'].note, '11,280 unemployed out of 94,521 economically active');
  assert.equal(emploi['Since the previous census'].value, '-1 point');
  assert.equal(emploi['Since the previous census'].note, 'unemployment falling');
  assert.ok(emploi['Census 2012']);
  assert.match(notes(fiche, 'emploi'), /not the ILO rate\./);

  const urbanisme = rows(fiche, 'urbanisme');
  assert.equal(urbanisme['Planning permits within 500 m'].note, 'filed over the last 36 months');
  assert.equal(urbanisme['By type'].note,
    'PC building permit, DP prior declaration, PA development permit, PD demolition permit');
  assert.equal(urbanisme['PLU zoning'].value, 'UG');
  assert.equal(urbanisme['PLU zoning'].note, 'Zone urbaine générale',
    'the zone’s own label is the PLU document’s words, and stays them');

  const voisinage = rows(fiche, 'voisinage');
  assert.equal(voisinage['Residents'].note, '105 cells of 200 m, that is 4.2 km²');
  assert.equal(voisinage['Average standard of living'].value, '€25,361/year');
  assert.equal(voisinage['Under 18'].value, '19.9%');
});

test('nothing French is left on the English sheet but the names the data carries', () => {
  const fiche = english();
  for (const entry of fiche.themes) {
    assertNoFrench({ label: entry.label, question: entry.question, notes: entry.notes },
      { allow: DATA_NAMES, message: `French in the English ${entry.id} theme` });
    for (const row of entry.lines) {
      assertNoFrench(row, { allow: DATA_NAMES, message: `French in the English ${entry.id} row` });
    }
  }
  assertNoFrench(fiche.gradingNote);
});

test('a silent source is named in English, and nine themes still stand', () => {
  const fiche = english({ ...PARTS, atmo: null, loyers: null });
  assert.equal(theme(fiche, 'nuisances').status, 'partial');
  assert.deepEqual(theme(fiche, 'nuisances').silent, ['atmo']);
  assert.match(notes(fiche, 'nuisances'),
    /No AASQA publishes an index for this municipality or around it\./);
  assert.match(notes(fiche, 'immobilier'), /The rent map is silent for this municipality\./);
  assert.equal(fiche.answered, 8);
});

test('an empty scan says why in English, ten times', () => {
  const fiche = english({});
  assert.equal(fiche.absent.length, 10);
  for (const entry of fiche.themes) {
    assert.ok(entry.notes.length >= 1, `${entry.id} must say why it is empty`);
    assertNoFrench(entry.notes, { allow: DATA_NAMES, message: `French in the empty ${entry.id}` });
  }
  assert.match(notes(fiche, 'urbanisme'), /The Géoportail de l’urbanisme did not answer\./);
  assert.match(notes(fiche, 'emploi'), /The Melodi API did not answer\./);
});

test('distances and numbers switch with the language, and the French bytes do not move', () => {
  assert.equal(withLocale('en', () => distanceLabel(1240)), '1.2 km');
  assert.equal(withLocale('fr', () => distanceLabel(1240)), '1,2 km');
  assert.equal(withLocale('en', () => distanceLabel(94)), '90 m');
  assert.equal(withLocale('en', () => distanceLabel(null)), '—');
});

// ── The drift guard ────────────────────────────────────────────────────────

test('the tables repeat the producers’ own French, word for word', () => {
  const fr = (table, key) => table('fr')[key];
  for (const segment of PARTS.loyers.segments) {
    assert.equal(fr(LOYERS_SEGMENTS, segment.key), segment.label, `loyers ${segment.key}`);
    assert.equal(fr(LOYERS_BASIS, segment.basis), segment.basisLabel, `basis ${segment.basis}`);
  }
  for (const pollutant of PARTS.atmo.pollutants) {
    assert.equal(fr(ATMO_POLLUTANTS, pollutant.key), pollutant.label, `atmo ${pollutant.key}`);
    assert.equal(fr(ATMO_BANDS, pollutant.band.code), pollutant.band.label);
  }
  assert.equal(fr(ATMO_BANDS, PARTS.atmo.band.code), PARTS.atmo.band.label);
  for (const technology of PARTS.arcep.technologies) {
    assert.equal(fr(ARCEP_TECHNOLOGIES, technology.key), technology.label, `arcep ${technology.key}`);
  }
  for (const risk of [...PARTS.risques.naturalRisks, ...PARTS.risques.technologicalRisks]) {
    assert.equal(fr(RISK_LABELS, risk.id), risk.label, `risk ${risk.id}`);
  }
  assert.equal(fr(RADON_LABELS, PARTS.risques.radon.class), PARTS.risques.radon.label);
  // `amenitiesFamilies.js` is another batch's file and not bilingual yet; the
  // English lives here until it is, so the French beside it must be its own.
  for (const [family, label] of Object.entries(AMENITY_FAMILY_LABELS)) {
    assert.equal(fr(AMENITY_FAMILIES, family), label, `family ${family}`);
  }
  for (const [family, plural] of Object.entries(AMENITY_FAMILY_PLURALS)) {
    assert.equal(fr(AMENITY_FAMILY_COUNTS, family), plural, `family plural ${family}`);
  }
});

test('the barème’s two sentences come from the barème, in both languages', () => {
  // They used to be repeated in this catalog with a drift test. They are not
  // any more: `baremeNational.i18n.js` publishes them, and this sheet prints
  // whatever the score carries — so there is nothing left to drift.
  assert.equal(withLocale('fr', () => BAREME_REASONS.GEOMETRY),
    'échelle mesurée sur une autre géométrie');
  assert.equal(withLocale('en', () => baremeReasonLabel('geometry')),
    'scale measured on a different geometry');
  for (const id of ['acces', 'prixM2']) {
    const indicator = resolveIndicator(id);
    if (indicator.direction) continue;
    const note = withLocale('en', () => resolveIndicator(id).directionNote);
    assertNoFrench(note, { message: `${id} prints an untranslated note` });
  }
});
