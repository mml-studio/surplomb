import test from 'node:test';
import assert from 'node:assert/strict';
import { organisationApplicant, withoutPersonMentions } from './permitApplicant.js';
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

test('a representative named after the company goes, the company stays (archive audit, 2026-11-15)', () => {
  for (const [written, kept] of [
    ['SCI EXEMPLE-FICTIF - M. TESTEUR Paul', 'SCI EXEMPLE-FICTIF'],
    ['SCI EXEMPLE (Mme SPECIMEN Jeanne)', 'SCI EXEMPLE'],
    ['VILLE DE FICTIVILLE M. TESTEUR Gérard', 'VILLE DE FICTIVILLE'],
    ['SNC EXEMPLE MEDITERRANEE MONSIEUR FICTIF PAUL', 'SNC EXEMPLE MEDITERRANEE'],
    ['SNC - SNC IMMOBILIERE EXEMPLE, REPRESENTANT MONSIEUR TESTEUR YANN', 'SNC - SNC IMMOBILIERE EXEMPLE'],
    ['SNC M FICTIF JEAN-CLAUDE - SNC IMMOBILIERE EXEMPLE', 'SNC - SNC IMMOBILIERE EXEMPLE'],
    ['SAS EXEMPLE ENERGY rerpesentée par Mme SPECIMEN Ana', 'SAS EXEMPLE ENERGY'],
    ['SAS EXEMPLE SOL rep par M TESTEUR Ana', 'SAS EXEMPLE SOL'],
    ['SASU EXEMPLE SOLAIRES - Mme FICTIVE Marie', 'SASU EXEMPLE SOLAIRES'],
    ['VILLE DE PARIS - DJS', 'VILLE DE PARIS - DJS'],
    ['SCI M2CB', 'SCI M2CB'],
  ]) {
    assert.equal(organisationApplicant(written), kept, written);
  }
  // A legal form left alone once the person is cut names nobody.
  assert.equal(organisationApplicant('SAS MONSIEUR FICTIF'), null);
});

test('a description keeps the work and loses the private person it names', () => {
  for (const [written, kept] of [
    ['isolation thermique extérieure chez Jean FICTIF', 'isolation thermique extérieure chez […]'],
    ['panneaux noirs chez notre client M TESTEUR au 15 impasse', 'panneaux noirs chez notre client […] au 15 impasse'],
    ['TRANSFERT AU NOM DE M Paul Claude FICTIF', 'TRANSFERT AU NOM DE […]'],
    ['CU VENTE / SCI EXEMPLE (M FICTIF & M TESTEUR)', 'CU VENTE / SCI EXEMPLE ([…] & […])'],
    ['chez mes voisins, Monsieur FICTIF et Madame TESTEUR', 'chez mes voisins, […] et […]'],
    ['M. Fictif souhaite agrandir', '[…] souhaite agrandir'],
  ]) {
    assert.equal(withoutPersonMentions(written), kept, written);
  }
  // Measurements, suppliers and a neighbour without a name are not people.
  for (const text of [
    'PISCINE 7.10 M X 3.40 M PROFONDEUR 1.50 M COLORIS SABLE',
    'LONGUEUR 8,26 M   LARGEUR 3,08 M   HAUTEUR 2,50 M',
    'PERGOLA 4X3 M INSTALLATION SUR TERRASSE',
    'HAUTEUR MAXIMUM 2.50 M. COLORIS GRIS',
    'MUR DE 2 M DE HAUT',
    'enduit ton pierre de chez PRB',
    'visible chez le voisin',
  ]) {
    assert.equal(withoutPersonMentions(text), text, text);
  }
  assert.equal(withoutPersonMentions(null), null);
  // Run twice, it changes nothing more: the archive restores rows on every read.
  const once = withoutPersonMentions('rénovation chez Jean FICTIF');
  assert.equal(withoutPersonMentions(once), once);
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
