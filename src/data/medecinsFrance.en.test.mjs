// What Health & emergency services claims, in English.
//
// The honesty rule the French suite pins holds unchanged: the register carries
// no identifier and no appointment book, so a card may say who is listed at an
// address and what they charge, and must never imply availability, a headcount
// or a precision BAN did not return. Each of those three refusals is checked
// here in English.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aplBinLabel,
  buildDepartementCard,
  buildHospitalCard,
  buildSiteCard,
  tariffLine,
} from './medecinsFrance.js';
import { MEDECIN_FAMILIES, medecinFamilyLabel, practitionerTariff } from './medecinsFrFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const SPECIALITES = { '01': 'Médecin généraliste', 15: 'Ophtalmologiste' };
const PRECISION = ['numero', 'voie', 'lieu-dit', 'commune'];
const APL = {
  seuils: { sousDotee: 2.5, bienDotee: 4 },
  bornes: [1.76, 2.18, 2.54, 2.85, 3.19, 3.51, 3.83, 4.3, 4.87, 23.9],
  communes: { 12345: [2.4, 2.1, 1.8, 1.6, 5000, 5100] },
};

const site = ({
  precision = 0, insee = '12345', voie = '12 RUE DES LILAS', ville = 'Ambert',
  cp = '63600', tel = '0473000000', kind = 'liberal', specialties = [['01', 2]],
  practitioners = 2, registre = '',
} = {}) => [45, 3, precision, insee, cp, ville, voie, tel, kind, specialties, practitioners, registre];

const en = (fn) => withLocale('en', fn);

test('a practice card leads with where and who, in English', () => {
  const card = en(() => buildSiteCard(
    site(),
    [['MARTIN CLAIRE', 'F', '01', '1', ''], ['DURAND PAUL', 'M', '01', '1', '']],
    { specialites: SPECIALITES, precision: PRECISION, apl: APL },
  ));
  const lines = card.split('\n');
  assert.equal(lines[0], '12 RUE DES LILAS');
  assert.ok(lines.includes('2 doctors'));
  // English has one doctor’s title; the register's own specialty wording stays.
  assert.ok(lines.some((line) => line.startsWith('Dr MARTIN CLAIRE — Médecin généraliste, set fee (sector 1)')));
  assert.ok(lines.some((line) => line.startsWith('Dr DURAND PAUL')));
  assert.equal(lines.filter((line) => line.startsWith('Dre ')).length, 0);
});

test('the three precision refusals survive the translation', () => {
  assert.equal(/⚠/.test(en(() => buildSiteCard(site({ precision: 0 }), [], { precision: PRECISION }))), false);
  assert.match(en(() => buildSiteCard(site({ precision: 3 }), [], { precision: PRECISION })),
    /⚠ position at the center of the municipality, not at the practice/);
  assert.match(en(() => buildSiteCard(site({ precision: 1 }), [], { precision: PRECISION })),
    /⚠ position on the voie, not at the number/);
});

test('an unnamed practice is not an empty one', () => {
  const card = en(() => buildSiteCard(
    site({ kind: 'centre-de-sante', practitioners: 0, specialties: [['01', 3]] }),
    [],
    { specialites: SPECIALITES, precision: PRECISION },
  ));
  assert.match(card, /Health center/);
  assert.match(card, /Practitioners not named by the register/);
  assert.equal(/0 doctor/.test(card), false);
});

test('local access is a position and a decile, not a raw unit', () => {
  const card = en(() => buildSiteCard(site(), [], { specialites: SPECIALITES, precision: PRECISION, apl: APL }));
  assert.match(card, /Local access: under-served area · 3rd tenth of France/);
  assert.match(card, /If the doctors aged 62 and over left: -25%/);
  assertNoFrench(card, { allow: ['Ambert', 'RUE DES LILAS', 'Médecin généraliste'] });
  // French keeps its own bare ordinal.
  assert.match(buildSiteCard(site(), [], { precision: PRECISION, apl: APL }), /3ᵉ dixième de France/);
});

test('a hospital card says what the place IS, and never claims its staff', () => {
  // [lat, lon, precision, names, kinds, finess, commune, practitioners, _, updated]
  const etab = [45, 3, 3, 'CH DE LYON+HÔPITAL NORD',
    'Centre hospitalier+Centre de lutte contre le cancer+Hôpital local+Autre',
    '690780010+690780028', 'LYON', 12, 0, '2026-07-01'];
  const card = en(() => buildHospitalCard(etab, { precision: PRECISION }));
  assert.match(card, /· and 1 more categories/);
  assert.match(card, /2 entities on this site: HÔPITAL NORD/);
  assert.match(card, /12 practitioners in private practice at this address/);
  assert.match(card, /⚠ position at the center of the municipality, not at the establishment/);
  assert.match(card, /· the health-insurance register does not count the hospital’s salaried staff/);
  assert.match(card, /FINESS geolocation updated on 2026-07-01/);
});

test('the department card gives the indicator, the standing and the cliff', () => {
  const card = en(() => buildDepartementCard('69', 'Rhône', [4182, 2910], [3.5, 3.1, 2.8, 1412000],
    { seuils: { sousDotee: 2.5, bienDotee: 4 } }));
  assert.match(card, /APL 3\.10 consultations per inhabitant per year/);
  assert.match(card, /moderately served/);
  assert.match(card, /Retirements of the 62-and-over: -20%/);
  assert.match(card, /1,412,000 inhabitants/);
  assert.match(card, /4,182 doctors · 2,910 addresses/);
  assertNoFrench(card, { allow: ['Rhône'] });
});

test('the tariff line, the APL ramp and the seven families all speak English', () => {
  const practitioners = [
    ['A', 'M', '01', '1', ''], ['B', 'F', '01', '3', '3'], ['C', 'M', '01', '3', ''], ['D', 'M', '01', '0', ''],
  ];
  const line = en(() => tariffLine(practitioners));
  assert.equal(line, '1 at the set fee · 1 capped (OPTAM) · 1 setting their own fees · 1 with no published sector');
  assert.equal(en(() => tariffLine([['A', 'M', '01', '1', '']])), 'set fee for everyone (sector 1)');
  assert.equal(en(() => practitionerTariff('0', '')), 'outside the health-insurance agreement');

  const rungs = en(() => [0, 1, 2, 3, 4].map((index) => aplBinLabel(index)));
  assert.deepEqual(rungs, [
    'under 2.0 — severely under-served',
    '2.0 to 2.5 — under-served',
    '2.5 to 3.3 — below the national mean',
    '3.3 to 4.0 — above it',
    'over 4.0 — well served',
  ]);

  const families = en(() => MEDECIN_FAMILIES.map((family) => medecinFamilyLabel(family)));
  assert.deepEqual(families, ['General practice', 'Women and children', 'Mental health',
    'Medical specialty', 'Surgery', 'Imaging and laboratory', 'Hospital']);
  assertNoFrench([line, rungs, families]);
});

test('a server without names, or mid-rebuild, says so in English', () => {
  const unavailable = en(() => buildSiteCard(site(), [], { precision: PRECISION, names: 'unavailable' }));
  const unavailableLine = unavailable.split('\n').find((text) => text.includes('names'));
  assert.equal(unavailableLine, 'Practitioners’ names are not available on this server');
  const stale = en(() => buildSiteCard(site(), null, { precision: PRECISION, names: 'stale' }));
  const staleLine = stale.split('\n').find((text) => text.includes('directory'));
  assert.equal(staleLine, 'The directory was just updated: reopen the card to see the names');
  assertNoFrench([unavailableLine, staleLine]);
});
