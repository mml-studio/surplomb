import test from 'node:test';
import assert from 'node:assert/strict';
import { organisationApplicant } from './permitApplicant.js';
import { LOCAL_ADS_PORTALS, normaliseLocalRow } from './adsFeed.js';

// Every personal name below is INVENTED. The filter exists so that real ones
// stay out of what this repository publishes, tests included.

test('a private applicant is never printed, however the portal spells it', () => {
  for (const name of [
    'Monsieur Jean EXEMPLE',
    'Mme Camille TESTEUR',
    'M. Paul FICTIF',
    'Aurélie Marie SPECIMEN',
    'specimen aurelie',
    'FICTIF Jean-Baptiste',
    'VILLEMOT DE TEST JEAN', // a surname that starts like `VILLE`
    'SANCHEZ-EXEMPLE Ana', // `chez` inside a word is not a care-of
    '',
    null,
  ]) {
    assert.equal(organisationApplicant(name), null, String(name));
  }
});

test('an organisation keeps its name', () => {
  for (const name of [
    'SAS EXEMPLE BATIMENT',
    'SCI DU 12 RUE FICTIVE',
    'S.C.I. EXEMPLE',
    'Syndicat de copropriété',
    'SDC DU 3 PLACE FICTIVE',
    'CABINET EXEMPLE',
    'Exemple Immobilière',
    'VILLE DE PARIS - DJS',
    'Office public de l’habitat',
    'ATALANTE HOTELS',
  ]) {
    assert.equal(organisationApplicant(name), name, name);
  }
});

test('a person named after an organisation is cut off with the clause', () => {
  assert.equal(organisationApplicant('SCI EXEMPLE CHEZ Jean FICTIF'), 'SCI EXEMPLE');
  assert.equal(organisationApplicant('SDC DU 3 RUE FICTIVE représenté par M. FICTIF'), 'SDC DU 3 RUE FICTIVE');
  assert.equal(organisationApplicant('SAS EXEMPLE c/o Camille TESTEUR'), 'SAS EXEMPLE');
  // A care-of that leaves nothing behind is not an organisation.
  assert.equal(organisationApplicant('Chez Jean FICTIF'), null);
});

test('a doubt masks: a brand without a legal form loses its name, not a person', () => {
  assert.equal(organisationApplicant('EXEMPLETUDE'), null);
});

test('the city portals pass their applicant through the filter', () => {
  const paris = LOCAL_ADS_PORTALS.find((portal) => portal.key === 'paris');
  const row = (demandeur) => ({
    nom_dossier: 'PC 075 101 26 V0001', type_dossier: 'PC', demandeur,
    adresse: '1 rue Fictive', date_depot: '2026-01-02', etat: 'En cours',
    x: 651000, y: 6862000, geo_point_2d: { lon: 2.34, lat: 48.86 },
  });
  assert.equal(normaliseLocalRow(paris, row('Madame Camille TESTEUR'))?.applicant, null);
  assert.equal(normaliseLocalRow(paris, row('SAS EXEMPLE'))?.applicant, 'SAS EXEMPLE');
});
