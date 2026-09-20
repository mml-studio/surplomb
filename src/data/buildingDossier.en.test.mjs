// The three lines a building card gains once the RNB has named its ground —
// what it last sold for, what has been authorized, what the PLU allows — in
// English, with the French beside them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildingDossierLines,
  dossierMonthLabel,
  dossierPermitLine,
  dossierSaleLine,
  dossierZoningLine,
} from './buildingDossier.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('a sale is dated to the month in both languages, and priced in each one’s money', () => {
  assert.equal(withLocale('en', () => dossierMonthLabel('2024-03-18')), 'March 2024');
  assert.equal(withLocale('fr', () => dossierMonthLabel('2024-03-18')), 'mars 2024');
  const en = withLocale('en', () => dossierSaleLine({ date: '2024-03-18', valeur: 465000, prixM2: 8214 }));
  assert.equal(en, 'Sold March 2024 · €465,000 · €8,214/m² — DVF, on this parcel');
  assertNoFrench(en);
  // Never a day, and never a price per m² DVF itself refused to compute.
  assert.equal(withLocale('en', () => dossierSaleLine({ date: '2024-03-18', valeur: 465000, prixM2: null })),
    'Sold March 2024 · €465,000 — DVF, on this parcel');
});

test('the permits line names the newest and counts the rest, in English', () => {
  const one = withLocale('en', () => dossierPermitLine({
    count: 1, newest: { date: '2023-06-02', label: 'PC · Autorisé' },
  }));
  assert.equal(one, 'Permits: PC · Autorisé · June 2023 — Sitadel, on this parcel',
    'the permit’s own label is composed by adsFeed.js and printed as it came');
  const many = withLocale('en', () => dossierPermitLine({ count: 34, newest: { date: '2025-01-09' } }));
  assert.equal(many, 'Permits: 34 permits · +33 more since 2013 — Sitadel, on this parcel');
  assert.equal(withLocale('en', () => dossierPermitLine({ count: 1, newest: { date: '2025-01-09' } })),
    'Permits: 1 permit — Sitadel, on this parcel');
  // French, unchanged.
  assert.equal(withLocale('fr', () => dossierPermitLine({ count: 34, newest: { date: '2025-01-09', label: 'PC' } })),
    'Permis : PC · janvier 2025 · +33 autres depuis 2013 — Sitadel, sur cette parcelle');
});

test('the three zoning answers stay three different facts in English', () => {
  const zoned = withLocale('en', () => dossierZoningLine({
    insideBox: true,
    zones: [{ code: 'UA', label: 'Zone urbaine' }, { code: 'UB' }],
    servitudes: [{}, {}],
  }));
  assert.equal(zoned, 'PLU: UA — Zone urbaine · +1 more zoning at this point · 2 easements');
  assert.equal(withLocale('en', () => dossierZoningLine({ insideBox: true, zones: [] })),
    'PLU: no zoning published at this point');
  assert.equal(withLocale('en', () => dossierZoningLine({ insideBox: false, zones: [] })), null,
    'never asked about this ground is not the same as no zoning');
});

test('the dossier keeps its reading order, whatever the language', () => {
  const dossier = {
    sale: { date: '2024-03-18', valeur: 465000 },
    permits: { count: 2, newest: { date: '2025-01-09', label: 'PC' } },
    zoning: { insideBox: true, zones: [{ code: 'UA' }], servitudes: [] },
  };
  const lines = withLocale('en', () => buildingDossierLines(dossier));
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Sold/);
  assert.match(lines[1], /^Permits/);
  assert.match(lines[2], /^PLU/);
  assertNoFrench(lines);
});
