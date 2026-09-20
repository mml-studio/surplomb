// The selected parcel's card, in both languages.
//
// The card is assembled from three modules — this one, `cadastreFeed.js` and
// `cadastreParcelDetail.js` — and the line that must never be lost is the last
// one: a cadastral boundary is a fiscal document, and a property limit is
// fixed by a surveyor, not by this map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import { buildRecords, createCadastreSelectedOverlayEntry } from './cadastreParcels.js';
import { projectCadastreParcels } from './cadastreFeed.js';

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
const RECORDS = buildRecords(PAYLOAD);
const recordFor = (idu) => RECORDS.find((record) => record.parcel.u === idu);

/** Commune names the register published. */
const PLACES = ['Paris', 'Marseille', 'Toulouse', 'Lyon', 'Ostwald', 'Mamoudzou'];

test('the card answers in English, and still ends on the legal standing', () => {
  const entry = withLocale('en', () => createCadastreSelectedOverlayEntry(
    recordFor('75103000AP0045'), PAYLOAD.communes, PAYLOAD.sheets,
  ));
  assertNoFrench({ title: entry.title, details: entry.details }, { allow: PLACES });
  assert.equal(entry.title, 'Parcel AP 0045');
  assert.equal(entry.details[0], 'Paris 3rd · INSEE 75056');
  assert.equal(entry.details[1], 'IDU 75103000AP0045');
  assert.ok(entry.details.some((line) => /^Registered area /.test(line)), entry.details.join(' | '));
  assert.ok(entry.details.some((line) => /^Drawn /.test(line)), entry.details.join(' | '));
  assert.ok(entry.details.some((line) => /^Sheet AP 01 at 1:500 · edition 2026-06-01$/.test(line)));
  assert.equal(entry.details.at(-1),
    'A fiscal document — a property boundary is fixed by a surveyor’s boundary marking');
});

test('every card of the fixture ends on that same line, in either language', () => {
  for (const locale of ['fr', 'en']) {
    const last = withLocale(locale, () => RECORDS
      .map((record) => createCadastreSelectedOverlayEntry(record, PAYLOAD.communes, PAYLOAD.sheets))
      .map((entry) => entry.details.at(-1)));
    assert.equal(new Set(last).size, 1, `${locale}: ${[...new Set(last)].join(' / ')}`);
  }
  const fr = withLocale('fr', () => createCadastreSelectedOverlayEntry(
    recordFor('75103000AP0045'), PAYLOAD.communes, PAYLOAD.sheets,
  ));
  assert.equal(fr.details.at(-1), 'Document fiscal — la limite de propriété se fixe par bornage');
});

test('the section prefix and the longest dimension read in English', () => {
  // Marseille prefixes its sections with a number, so its card carries one.
  const prefixed = RECORDS.find((record) => record.parcel.b && record.parcel.b !== '000');
  const en = withLocale('en', () => createCadastreSelectedOverlayEntry(
    prefixed, PAYLOAD.communes, PAYLOAD.sheets,
  ));
  assertNoFrench(en.details, { allow: PLACES });
  assert.ok(en.details.some((line) => /^Section prefix \w+$/.test(line)), en.details.join(' | '));
  const span = en.details.find((line) => / long$/.test(line));
  assert.match(span, /^Drawn .* · \d+([.,]\d+)? (m|km) long$/);
  const fr = withLocale('fr', () => createCadastreSelectedOverlayEntry(
    prefixed, PAYLOAD.communes, PAYLOAD.sheets,
  ));
  assert.ok(fr.details.some((line) => /^Préfixe de section \w+$/.test(line)));
  assert.match(fr.details.find((line) => / de long$/.test(line)), /^Tracé .* de long$/);
});
