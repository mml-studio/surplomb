// The Planning layer in English, read off the SAME two APIcarto captures the
// French tests pin: Ustaritz (the `UB` zone with its two enclaves) and Paris
// 13e (five easements at one address).
//
// What matters here is what the layer REFUSES to say. "No easement here" is a
// strong claim from a layer whose reason to exist is that the state has
// quietly encumbered ground, and there are three different absences behind it;
// "no zoning at this point" has four causes and only one of them is about the
// ground. Each is asserted in English beside the same card in French, so one
// loaded layer is proved to answer in both languages.
//
// The last block is the drift guard: `projectGpu()` also runs on the server,
// which has no locale, so the payload still carries French easement labels and
// the browser relabels the CODE. `SUP_TYPE_LABELS` and the catalog must stay
// the same words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import { SUP_TYPE_LABELS, projectGpu, supTypeLabel } from './gpuFeed.js';
import supMessages from './gpuFeed.i18n.js';
import {
  ZONE_FAMILY_SENTENCES,
  gpuAnswerAt,
  gpuGroundCard,
  gpuRowControls,
  servitudeLines,
  servitudeSentence,
  zoneApprovalDate,
  zoneDescription,
  zoneFamilySentence,
} from './urbanismeGpu.js';

const ENCLAVES = JSON.parse(readFileSync(
  new URL('./fixtures/gpu-zone-urba-enclaves-sample.json', import.meta.url), 'utf8',
));
const PARIS_ZONING = JSON.parse(readFileSync(
  new URL('./fixtures/gpu-zone-urba-sample.json', import.meta.url), 'utf8',
));
const SERVITUDES = JSON.parse(readFileSync(
  new URL('./fixtures/gpu-assiette-sup-s-sample.json', import.meta.url), 'utf8',
));

/** Avenue de France, Paris 13e — the address both Paris fixtures answer for. */
const PARIS = { lon: 2.3760, lat: 48.8300 };
const USTARITZ_BOX = { south: 43.388, west: -1.470, north: 43.402, east: -1.450 };
/** The point APIcarto answers `UB` for that falls outside the decimated ring. */
const DECIMATION_GAP = { lon: -1.462153, lat: 43.39983 };
/** Inside the village-centre zone, 400 m from the gap. */
const IN_THE_ZONE = { lon: -1.45702, lat: 43.39632 };
/** The school enclave: `UE` in the document, a hole punched out of `UB`. */
const THE_SCHOOL = { lon: -1.45669, lat: 43.39522 };

/**
 * The register's OWN names for its zones (`libelong`) and for one easement
 * (`nomsuplitt`). They are data: a commune publishes them in French and this
 * layer relays them rather than inventing a translation of a legal document.
 */
const PUBLISHED_NAMES = [
  'Zone urbaine générale', 'Zone UB', 'Zone UE', 'Zone UYc', 'Zone AUc', 'Zone AUs',
];

const ustaritz = (over = {}) => projectGpu({
  zoning: ENCLAVES, servitudes: null, point: DECIMATION_GAP, box: USTARITZ_BOX, ...over,
});
const paris = () => projectGpu({
  zoning: PARIS_ZONING, servitudes: SERVITUDES, point: PARIS, box: null,
});

/* ── the zone card ────────────────────────────────────────────────────────── */

test('a zone card names the family in English, and the code stays the register’s', (t) => {
  useTestLocale('en', t);
  const card = gpuGroundCard({ payload: ustaritz(), ...IN_THE_ZONE, point: DECIMATION_GAP });
  assert.match(card.title, /^UB — /, 'the code is data and is never translated');
  assert.ok(card.details.includes('urban zone — already built and serviced'), card.details);
  assertNoFrench(card, { allow: PUBLISHED_NAMES });
});

test('the eight zoning families are explained in English, and the letters are not', (t) => {
  useTestLocale('en', t);
  for (const kind of ['U', 'AUc', 'AUs', 'A', 'N', 'Ah', 'Nh']) {
    const sentence = zoneFamilySentence(kind);
    assert.ok(sentence, `${kind} must be explained in words`);
    assertNoFrench(sentence, { message: `${kind} still reads French` });
  }
  assert.equal(zoneFamilySentence('AUc'), 'future urban zone, OPEN — buildable under the PLU as it stands');
  assert.equal(zoneFamilySentence('AUs'), 'future urban zone, CLOSED — buildable only after the PLU is modified or revised');
  // The c/s distinction is the most decision-changing bit in the layer, and it
  // survives the translation in capitals, as it does in French.
  assert.ok(zoneFamilySentence('AUc').includes('OPEN'));
  assert.ok(zoneFamilySentence('AUs').includes('CLOSED'));
  assert.equal(zoneFamilySentence('ZZ'), null, 'an unknown letter stays unexplained');
});

test('a neighbouring zone says so in English, and French says it unchanged', () => {
  const entry = { kind: 'A', code: 'A', atPoint: false };
  assert.ok(withLocale('en', () => zoneDescription(entry)).includes('neighboring zone'));
  assert.ok(withLocale('fr', () => zoneDescription(entry)).includes('zone voisine'));
});

test('an approval date is a date in both languages, and eight digits in neither', () => {
  // The same national schema, two spellings, measured: Ustaritz publishes
  // `20240323` and Paris `2026-06-16`.
  assert.equal(withLocale('en', () => zoneApprovalDate('20240323')), 'Mar 23, 2024');
  assert.equal(withLocale('en', () => zoneApprovalDate('2026-06-16')), 'Jun 16, 2026');
  assert.equal(withLocale('fr', () => zoneApprovalDate('20240323')), '23/03/2024');
  // Anything that is neither spelling is the register's own text, passed
  // through untouched rather than mangled into a guess — in both languages.
  assert.equal(withLocale('en', () => zoneApprovalDate('en cours')), 'en cours');
});

/* ── the four ways to have no zoning ──────────────────────────────────────── */

test('four ways to have no zoning, all four of them in English', (t) => {
  useTestLocale('en', t);
  const point = DECIMATION_GAP;
  const outside = gpuGroundCard({ payload: ustaritz(), lon: -1.44, lat: 43.39, point });
  assert.equal(outside.title, 'Outside the block queried');
  assert.ok(outside.details.some((line) => line.includes('the block drawn')), outside.details);

  const pointRegime = projectGpu({ zoning: ENCLAVES, servitudes: null, point, box: null });
  const away = gpuGroundCard({ payload: pointRegime, lon: -1.44, lat: 43.39, point });
  assert.equal(away.title, 'Zoning not queried here');
  // The ceiling is a measured number and it is grouped the English way.
  assert.ok(away.details.some((line) => line.includes('above 1,500 m')), away.details);

  const refused = ustaritz({ zoningRefused: { found: 17182, limit: 5000 } });
  const capped = gpuGroundCard({ payload: refused, ...IN_THE_ZONE, point });
  assert.equal(capped.title, 'Zoning not drawn');
  assert.ok(capped.details.some((line) => line.includes('17,182 zones in this frame')), capped.details);

  const covered = gpuGroundCard({ payload: ustaritz(), ...THE_SCHOOL, point });
  assert.equal(covered.title, 'No zoning at this point');
  assert.ok(covered.details.some((line) => line.includes('the block was indeed queried')),
    'the one case that IS about the ground says so, rather than blaming the layer');
  assertNoFrench([outside, away, capped, covered], { allow: PUBLISHED_NAMES });
});

/* ── the easements ────────────────────────────────────────────────────────── */

test('the three easement absences are three different English sentences', (t) => {
  useTestLocale('en', t);
  const payload = paris();
  assert.equal(payload.servitudes.length, 5);

  const atMarker = gpuGroundCard({ payload, ...PARIS, point: PARIS });
  assert.ok(atMarker.details.some((line) => line.startsWith('5 easements here:')), atMarker.details);

  // Somewhere none of the five envelopes reaches: the register was never asked
  // about it, and "no easement" there would be a survey this layer has not done.
  const elsewhere = gpuAnswerAt(payload, 2.30, 48.90, PARIS);
  assert.equal(elsewhere.servitudes.length, 0);
  assert.equal(servitudeSentence(elsewhere),
    'none of the marker’s 5 easements reaches this point');

  // At the marker, and only there, the absence is a fact about the ground.
  assert.equal(servitudeSentence({ fromRegister: true, servitudes: [] }),
    'no easement at this point');
  // And with nothing scanned at all, the sentence names the limit instead.
  assert.equal(servitudeSentence({ servitudes: [], servitudesScanned: 0 }),
    'no easement found at the marker — they are only ever queried at the marker');
});

test('the easement list yields its rows to the zone, in English too', (t) => {
  useTestLocale('en', t);
  const payload = paris();
  const answer = gpuAnswerAt(payload, PARIS.lon, PARIS.lat, PARIS);
  assert.deepEqual(servitudeLines(answer, 4), [
    '5 easements here:',
    '· Historic monument protection zone',
    '· Railway — protection strip',
    '· Risk prevention plan (natural or technological)',
  ]);
  assert.deepEqual(servitudeLines(answer, 3), [
    '5 easements here:',
    '· Historic monument protection zone',
    '· and 2 more',
  ]);
  for (const budget of [2, 3, 4, 5]) {
    assert.ok(servitudeLines(answer, budget).length <= budget, `overran ${budget}`);
  }
});

test('an English card stays inside the box the overlay paints', (t) => {
  useTestLocale('en', t);
  // The card is exactly as wide as its longest detail — the overlay neither
  // wraps nor truncates — and the bound is the layer's own widest sentence,
  // measured in the language being drawn rather than in French.
  const widest = Math.max(...Object.values(zoneFamilySentencesEn()).map((line) => line.length));
  for (const [payload, point] of [[paris(), PARIS], [ustaritz(), DECIMATION_GAP]]) {
    for (const at of [point, IN_THE_ZONE, THE_SCHOOL, { lon: 2.30, lat: 48.90 }]) {
      const card = gpuGroundCard({ payload, ...at, point });
      assert.ok(card.details.length <= 6, `${card.title}: ${card.details.length} lines`);
      for (const line of [card.title, ...card.details]) {
        assert.ok(line.length <= widest, `${line.length} chars, over ${widest}: ${line}`);
      }
      assertNoFrench(card, { allow: PUBLISHED_NAMES });
    }
  }
});

/** The eight family sentences in the locale in force. */
function zoneFamilySentencesEn() {
  return Object.fromEntries(
    Object.keys(ZONE_FAMILY_SENTENCES).map((kind) => [kind, zoneFamilySentence(kind)]),
  );
}

/* ── the chips and the key ────────────────────────────────────────────────── */

test('the two chips and the key answer in English', (t) => {
  useTestLocale('en', t);
  const payload = paris();
  const { chips, legend } = gpuRowControls({ plu: 'on', sup: 'on' }, payload);
  assert.deepEqual(chips.map((chip) => chip.label), ['PLU zoning', 'Easements']);
  assert.equal(chips[0].title,
    'Hide the PLU zoning — the colored fill, its outlines and the codes written on the ground');
  assert.equal(gpuRowControls({ plu: 'off', sup: 'on' }, payload).chips[0].title,
    'Show the PLU zoning — the colored fill, its outlines and the codes written on the ground');
  // A key row is the family in plain words, its letter in brackets because
  // the map writes the codes on the ground — and no sentence under it.
  const zoneRow = legend.find((row) => row.label === 'Urban zone (U)');
  assert.ok(zoneRow, legend.map((row) => row.label).join(', '));
  assert.equal(zoneRow.blurb, undefined);
  const easementRow = legend.find((row) => row.label === 'Public utility easement (SUP)');
  assert.ok(easementRow, 'the easement key names itself with its acronym glossed');
  assertNoFrench(legend);
});

test('a hidden half says what it hid, and that the marker still answers', (t) => {
  useTestLocale('en', t);
  const payload = paris();
  assert.equal(gpuRowControls({ plu: 'on', sup: 'off' }, payload).note,
    '5 easements hidden — the marker still carries the register’s answer.');
  const both = gpuRowControls({ plu: 'off', sup: 'off' }, payload).note;
  // One zone at this Paris address, five easements: the two halves each count
  // their own, and English agrees with its own singular.
  assert.equal(both,
    '1 PLU zone hidden · 5 easements hidden — the marker still carries the register’s answer.');
});

/* ── the drift guard: one table, a server with no locale ──────────────────── */

test('the payload keeps the producer’s French, and the browser relabels the code', () => {
  // `projectGpu` runs in `vite.config.js` too, so the label it bakes into the
  // payload is French by construction. A repetition nobody checks is a
  // repetition that rots: every entry is compared against the catalog.
  for (const [code, label] of Object.entries(SUP_TYPE_LABELS)) {
    assert.equal(label, supMessages('fr')[code], `SUP_TYPE_LABELS.${code} drifted`);
    assert.equal(withLocale('fr', () => supTypeLabel(code)), label, `supTypeLabel(${code})`);
    assertNoFrench(withLocale('en', () => supTypeLabel(code)), { message: `${code} in English` });
  }
  assert.equal(withLocale('en', () => supTypeLabel('pm1')),
    'Risk prevention plan (natural or technological)');
  // A code the nomenclature adds next month reads as a reference, not a typo,
  // and it reads the same in both languages because it is data.
  assert.equal(withLocale('en', () => supTypeLabel('pm4')), 'PM4');
  assert.equal(withLocale('fr', () => supTypeLabel('pm4')), 'PM4');
  assert.equal(supTypeLabel(''), null);
});
