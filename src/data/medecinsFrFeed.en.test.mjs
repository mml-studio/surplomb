// The vocabulary of `medecins-fr`, in English.
//
// The tariff words are not the register's own: “Secteur 2” tells a reader
// nothing and “OPTAM” tells them less, so both languages say whether the price
// is fixed, capped or free — and both keep the French scheme name in
// parentheses, because that is what a patient sees on the door.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aplStanding,
  aplStandingLabel,
  medecinPrecisionLabel,
  medecinTariffCapped,
  medecinsAplSource,
  medecinsSource,
  practitionerTariff,
} from './medecinsFrFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const en = (fn) => withLocale('en', fn);

test('the four tariff answers and the capped one read as English', () => {
  assert.equal(en(() => practitionerTariff('1', '')), 'set fee (sector 1)');
  assert.equal(en(() => practitionerTariff('3', '')), 'own fees (sector 2)');
  assert.equal(en(() => practitionerTariff('2', '')), 'permanent extra billing');
  assert.equal(en(() => practitionerTariff('0', '')), 'outside the health-insurance agreement');
  assert.equal(en(() => practitionerTariff('3', '3')), 'capped extra billing (OPTAM)');
  assert.equal(en(() => practitionerTariff('9', '')), 'sector not published');
  assert.equal(en(medecinTariffCapped), 'capped extra billing (OPTAM)');
  assert.equal(practitionerTariff('1', ''), 'tarif fixé (secteur 1)');
});

test('BAN’s four precision categories keep their four distinctions', () => {
  const english = en(() => ['numero', 'voie', 'lieu-dit', 'commune'].map((band) => medecinPrecisionLabel(band)));
  assert.deepEqual(english, [
    'exact address', 'street, without the number', 'locality', 'center of the municipality',
  ]);
  assert.equal(new Set(english).size, 4);
  assertNoFrench(english);
  assert.equal(medecinPrecisionLabel('commune'), 'centre de la commune');
});

test('the APL standing names the ARS’s two thresholds in English', () => {
  assert.equal(en(() => aplStandingLabel(aplStanding(2.0, {}))), 'under-served area');
  assert.equal(en(() => aplStandingLabel(aplStanding(3.2, {}))), 'moderately served');
  assert.equal(en(() => aplStandingLabel(aplStanding(4.5, {}))), 'well served');
  assert.equal(aplStandingLabel('sous-dotee'), 'zone sous-dotée');
});

test('the two attributions keep the registers’ own names', () => {
  assert.equal(en(medecinsSource), 'Annuaire santé Ameli — CNAM (data.gouv.fr), geocoded against the BAN');
  assert.equal(en(medecinsAplSource), 'Local potential accessibility (APL) — DREES');
  assert.equal(medecinsSource(), 'Annuaire santé Ameli — CNAM (data.gouv.fr), géocodé BAN');
});
