// src/data/adsCityPortals.test.mjs
// Pins the two city portals added on 2026-10-01 — Tours (Opendatasoft, one row
// per parcel and per step, a five-digit commune in its dossier numbers) and
// Brest (an ArcGIS map service answering GeoJSON) — against rows shaped like
// the ones they answered that day. Addresses and parcels are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_ADS_PORTALS,
  SITADEL_FILES,
  buildLocalAdsExcludedCountUrl,
  buildLocalAdsUrl,
  foldLocalRows,
  localDossier,
  localRows,
  localState,
  mergeRegisters,
  supplementLocalHistory,
  normaliseLocalRow,
  normaliseSitadelRow,
  portalsForCommune,
} from './adsFeed.js';

const TOURS = LOCAL_ADS_PORTALS.find((portal) => portal.key === 'tours');
const BREST = LOCAL_ADS_PORTALS.find((portal) => portal.key === 'brest');
const PARIS = LOCAL_ADS_PORTALS.find((portal) => portal.key === 'paris');
const HOUSING_FILE = SITADEL_FILES.find((file) => file.key === 'logements');

/** One Tours dossier on two parcels: filed (two rows), then decided (two). */
const TOURS_ROWS = Object.freeze([
  {
    numero_de_dossier: 'DP 37261 26 T1186', code_insee: '37261',
    type_de_demande_d_autorisation: 'Déclaration Préalable de Construction',
    recu_en_mairie: '2026-09-28', adresse_des_travaux: '12 Rue des Exemples', cp_des_travaux: '37000',
    objet_des_travaux: 'Remplacement des menuiseries', surface_de_plancher_creee: null,
    nature_de_la_decision: null, date_de_la_decision: null, ref_cadastre: 'AO0045',
  },
  {
    numero_de_dossier: 'DP 37261 26 T1186', code_insee: '37261',
    type_de_demande_d_autorisation: 'Déclaration Préalable de Construction',
    recu_en_mairie: '2026-09-28', adresse_des_travaux: '12 Rue des Exemples', cp_des_travaux: '37000',
    objet_des_travaux: 'Remplacement des menuiseries', surface_de_plancher_creee: null,
    nature_de_la_decision: null, date_de_la_decision: null, ref_cadastre: 'AO99',
  },
  {
    numero_de_dossier: 'DP 37261 26 T1186', code_insee: '37261',
    type_de_demande_d_autorisation: 'Déclaration Préalable de Construction',
    recu_en_mairie: '2026-09-28', adresse_des_travaux: '12 Rue des Exemples', cp_des_travaux: '37000',
    objet_des_travaux: 'Remplacement des menuiseries', surface_de_plancher_creee: null,
    nature_de_la_decision: 'Accord avec prescription', date_de_la_decision: '2026-10-20', ref_cadastre: 'AO0045',
  },
  {
    numero_de_dossier: 'DP 37261 26 T1186', code_insee: '37261',
    type_de_demande_d_autorisation: 'Déclaration Préalable de Construction',
    recu_en_mairie: '2026-09-28', adresse_des_travaux: '12 Rue des Exemples', cp_des_travaux: '37000',
    objet_des_travaux: 'Remplacement des menuiseries', surface_de_plancher_creee: null,
    nature_de_la_decision: 'Accord avec prescription', date_de_la_decision: '2026-10-20', ref_cadastre: '0',
  },
]);

/** A Brest answer: one granted permit, its dates in milliseconds. */
const BREST_ANSWER = Object.freeze({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 1,
    geometry: { type: 'Point', coordinates: [-4.4437, 48.4219] },
    properties: {
      NOM_DOSSIER: 'PC 029 075 24 00053', TYPE_DOSSIER: 'PC', ADRESSE: 'RUE DES EXEMPLES',
      PARCELLE: '75 G 865', OBJET_DEMANDE: 'Autre permis de construire',
      PRECISION_TRAVAUX: 'Construction d’un équipement sportif', SF_CREEE: 38949, NB_LOGEMENTS: null,
      // 2024-06-27 22:00 UTC and 2025-12-18 23:00 UTC: the 28th and the 19th in Brest.
      DATE_DEPOT: 1719525600000, DECISION_ARRETE: 'Favorable avec réserve', DATE_ARRETE: 1766098800000,
    },
  }],
});

test('Tours and Brest are gated by the communes they publish, and by nothing else', () => {
  assert.deepEqual(portalsForCommune('37261').map((portal) => portal.key), ['tours']);
  // The métropole's other communes publish no file.
  assert.deepEqual(portalsForCommune('37122'), []);
  for (const code of ['29011', '29019', '29061', '29069', '29189', '29212', '29235']) {
    assert.deepEqual(portalsForCommune(code).map((portal) => portal.key), ['brest'], code);
  }
  assert.deepEqual(portalsForCommune('29075'), [], 'Guipavas uses its municipal registers');
  // No commune is claimed twice across the portals.
  const seen = new Set();
  for (const portal of LOCAL_ADS_PORTALS) {
    for (const code of portal.communes) {
      assert.ok(!seen.has(code), `${code} in two portals`);
      seen.add(code);
    }
  }
});

test('Tours is asked by commune, on the date it received the dossier', () => {
  const url = new URL(buildLocalAdsUrl(TOURS, { communeCode: '37261', since: '2023-10-01' }));
  assert.equal(url.host, 'data.tours-metropole.fr');
  assert.match(url.pathname, /dossiers-deposes-urbanisme-tours\/exports\/json$/);
  assert.equal(url.searchParams.get('where'), 'code_insee = "37261" and recu_en_mairie >= date\'2023-10-01\'');
  // The applicant's name and home address are never even asked for.
  assert.ok(!url.searchParams.get('select').includes('demandeur'));
  assert.equal(buildLocalAdsExcludedCountUrl(TOURS, { communeCode: '37261', since: '2023-10-01' }), null);
});

test('Brest is asked by radius, in metres, on its own SQL, for GeoJSON in WGS 84', () => {
  const url = new URL(buildLocalAdsUrl(BREST, { lon: -4.4861, lat: 48.3904, radiusM: 400.4, since: '2023-10-01' }));
  assert.equal(url.origin, 'https://geo.brest-metropole.fr');
  assert.match(url.pathname, /\/MapServer\/2811003\/query$/);
  assert.equal(url.searchParams.get('where'), "DATE_DEPOT >= DATE '2023-10-01'");
  assert.equal(url.searchParams.get('geometry'), '-4.4861,48.3904');
  assert.equal(url.searchParams.get('distance'), '400');
  assert.equal(url.searchParams.get('units'), 'esriSRUnit_Meter');
  assert.equal(url.searchParams.get('inSR'), '4326');
  assert.equal(url.searchParams.get('outSR'), '4326');
  assert.equal(url.searchParams.get('f'), 'geojson');
  assert.equal(buildLocalAdsExcludedCountUrl(BREST, { lon: 0, lat: 0, radiusM: 1, since: '2023-10-01' }), null);
});

test('an ArcGIS answer becomes flat rows, its dates the Paris day they fall on', () => {
  const rows = localRows(BREST, BREST_ANSWER);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].DATE_DEPOT, '2024-06-28');
  assert.equal(rows[0].DATE_ARRETE, '2025-12-19');
  assert.deepEqual(rows[0].geometry.coordinates, [-4.4437, 48.4219]);
  // An error object is a failure, never an empty list — for both kinds.
  assert.equal(localRows(BREST, { error: { code: 400, message: 'Invalid query' } }), null);
  assert.equal(localRows(BREST, []), null);
  assert.deepEqual(localRows(PARIS, []), []);
  assert.equal(localRows(PARIS, { error_code: 'ODSQLError' }), null);
  assert.deepEqual(localRows(BREST, { type: 'FeatureCollection', features: [] }), []);
});

test('a Brest permit is placed by its own point, granted, and keeps its figures', () => {
  const [permit] = localRows(BREST, BREST_ANSWER).map((row) => normaliseLocalRow(BREST, row));
  assert.equal(permit.dossier, 'PC 029 075 24 00053');
  assert.equal(permit.key, 'DAU|0290752400053');
  assert.equal(permit.kind, 'PC');
  assert.equal(permit.state, 'accorde');
  assert.equal(permit.depositedOn, '2024-06-28');
  assert.equal(permit.decidedOn, '2025-12-19');
  assert.equal(permit.lon, -4.4437);
  assert.equal(permit.lat, 48.4219);
  assert.equal(permit.precision, 'published');
  assert.equal(permit.purpose, 'Construction d’un équipement sportif');
  assert.equal(permit.surfaceCreatedM2, 38949);
  // A blank housing count is unknown, not zero.
  assert.equal(permit.housing, null);
  assert.deepEqual(permit.parcels, ['75 G 865']);
  assert.deepEqual(permit.parcelIdus, [], 'a point already places it');
  assert.equal(permit.source, 'brest');
});

test('Tours numbers meet Sitadel’s, which write the département on three digits', () => {
  assert.equal(localDossier(TOURS, 'DP 37261 26 T1181'), 'DP 037 261 26 T1181');
  assert.equal(localDossier(TOURS, 'DP 37261 26 T0020 M01'), 'DP 037 261 26 T0020 M01');
  // Only the flagged portal, and only that exact shape.
  assert.equal(localDossier(PARIS, 'DP 37261 26 T1181'), 'DP 37261 26 T1181');
  assert.equal(localDossier(TOURS, 'DP0441662600106'), 'DP0441662600106');
  assert.equal(localDossier(TOURS, 'DP 075 108 26 V0143'), 'DP 075 108 26 V0143');

  const permit = normaliseLocalRow(TOURS, TOURS_ROWS[0]);
  const twin = normaliseSitadelRow(HOUSING_FILE, {
    NUM_DAU: '03726126T1186', TYPE_DAU: 'DP', ETAT_DAU: '2', COMM: '37261',
    DATE_REELLE_AUTORISATION: '2026-10-20',
  });
  assert.equal(permit.key, twin.key);
  const { permits, merged } = mergeRegisters([twin], [permit]);
  assert.equal(merged, 1);
  assert.equal(permits.length, 1, 'one dossier, not the same one twice');
});

test('a Tours row is filed until a decision says otherwise, and stands on its parcel', () => {
  const filed = normaliseLocalRow(TOURS, TOURS_ROWS[0]);
  assert.equal(filed.kind, 'DP');
  assert.equal(filed.state, 'depose');
  assert.equal(filed.depositedOn, '2026-09-28');
  assert.equal(filed.decidedOn, null);
  assert.equal(filed.postcode, '37000');
  assert.equal(filed.communeCode, '37261');
  assert.equal(filed.cadastreCommune, '37261');
  assert.deepEqual(filed.parcelIdus, [{ idu: '37261000AO0045', provisional: false, label: 'AO 45' }]);
  assert.deepEqual(normaliseLocalRow(TOURS, TOURS_ROWS[1]).parcelIdus.map((ref) => ref.idu), ['37261000AO0099']);

  const decided = normaliseLocalRow(TOURS, TOURS_ROWS[3]);
  assert.equal(decided.state, 'accorde');
  assert.equal(decided.decidedOn, '2026-10-20');
  // `0` is the decision row's blank, not a parcel.
  assert.deepEqual(decided.parcels, []);
  assert.deepEqual(decided.parcelIdus, []);
  assert.equal(decided.cadastreCommune, null);
});

test('four Tours rows are one dossier: the decision leads, the parcels are pooled', () => {
  const { permits, folded } = foldLocalRows(TOURS_ROWS.map((row) => normaliseLocalRow(TOURS, row)));
  assert.equal(permits.length, 1);
  assert.equal(folded, 3);
  const [dossier] = permits;
  assert.equal(dossier.state, 'accorde');
  assert.equal(dossier.decidedOn, '2026-10-20');
  assert.equal(dossier.cadastreCommune, '37261');
  assert.deepEqual(dossier.parcelIdus.map((ref) => ref.idu).sort(), ['37261000AO0045', '37261000AO0099']);
  // A PC and a DP of the same number are two dossiers.
  const pc = normaliseLocalRow(TOURS, {
    ...TOURS_ROWS[0],
    numero_de_dossier: 'PC 37261 26 T1186',
    type_de_demande_d_autorisation: 'Permis de Construire',
  });
  assert.equal(foldLocalRows([pc, normaliseLocalRow(TOURS, TOURS_ROWS[0])]).permits.length, 2);
});

test('the decision words of Tours and Brest land on the ladder, refusals first', () => {
  assert.equal(localState('Défavorable').state, 'refuse');
  assert.equal(localState('Rejet tacite pour incomplétude').state, 'refuse');
  assert.equal(localState('Refus').state, 'refuse');
  assert.equal(localState('Favorable avec réserve').state, 'accorde');
  assert.equal(localState('Favorable tacite').state, 'accorde');
  assert.equal(localState('Accord tacite').state, 'accorde');
  assert.equal(localState('Non opposition').state, 'accorde');
  assert.equal(localState('Opposition').state, 'refuse');
  assert.equal(localState('Annulation').state, 'annule');
  // The Nantes and Paris vocabularies are untouched.
  assert.equal(localState('Dossier avec décision (- de 2 mois)').state, 'depose');
  assert.equal(localState("Dossier déposé (en cours d'instruction)").state, 'instruction');
  assert.equal(localState('Accordé').state, 'accorde');
  assert.equal(localState('Refusé').state, 'refuse');
});

// --- dODu: the Basque agglomeration's open-data harvest (2026-11-16) --------

const DODU = LOCAL_ADS_PORTALS.find((portal) => portal.key === 'dodu');

/** Two Boucau rows as the portal answered them on 2026-11-16; addresses and works invented. */
const DODU_ROWS = Object.freeze([
  {
    insee: '64140', commune: 'Boucau', code_postal: '64340', numero_dossier: 'PC6414024B0025I',
    type_dossier: 'Permis de construire', date_depot: '2024-10-02', date_de_decision: '2025-01-13',
    decision_autorite: 'Avis favorable avec prescriptions', adresse_du_terrain: '4 impasse des Exemples  64340 BOUCAU',
    parcelle_s_cadastrale_s: 'AM 0140, AM 0141', description_travaux: 'Construction d’une maison\r\nExtension',
    nombre_de_logement: 1,
  },
  {
    insee: '64140', commune: 'Boucau', code_postal: '64340', numero_dossier: 'DP641402600055I',
    type_dossier: 'Déclaration préalable', date_depot: '2026-04-15', date_de_decision: null,
    decision_autorite: null, adresse_du_terrain: '30 rue des Exemples  64340 Boucau',
    parcelle_s_cadastrale_s: 'BD 099P', description_travaux: 'Pose d’une fenêtre chez M. Exemple',
    nombre_de_logement: null,
  },
]);

test('dODu is asked for all five published communes, by commune, without the applicant', () => {
  for (const code of ['64024', '64140', '64160', '64256', '64547']) {
    assert.deepEqual(portalsForCommune(code).map((portal) => portal.key), ['dodu'], code);
  }
  assert.deepEqual(portalsForCommune('64483'), [], 'unpublished communes are not invented');
  const url = new URL(buildLocalAdsUrl(DODU, { communeCode: '64140', since: '2023-11-01' }));
  assert.equal(url.host, 'opendatapaysbasque.opendatasoft.com');
  assert.match(url.pathname, /\/datasets\/dodu\/exports\/json$/);
  assert.equal(url.searchParams.get('where'), 'insee = "64140" and date_depot >= date\'2023-11-01\'');
  const select = url.searchParams.get('select').split(',');
  assert.ok(!select.includes('nom_demandeur'));
  assert.ok(!select.includes('personne_phys_mor'));
});

test('local history fills absent dossiers while a current board keeps its newer decision', () => {
  const older = normaliseLocalRow(DODU, DODU_ROWS[0]);
  const current = { ...older, id: 'board:current', source: 'permit-list',
    state: 'annule', decidedOn: '2026-10-01', address: '8 rue du Projet' };
  const missing = normaliseLocalRow(DODU, DODU_ROWS[1]);
  const result = supplementLocalHistory([current], [older, missing, missing]);
  assert.equal(result.overlaps, 2);
  assert.equal(result.permits.length, 2);
  assert.deepEqual(result.permits[1], missing);
  assert.deepEqual(result.permits[0].sources, ['permit-list', 'dodu']);
  assert.equal(result.permits[0].state, 'annule');
  assert.equal(result.permits[0].decidedOn, '2026-10-01');
  assert.equal(result.permits[0].address, '8 rue du Projet');
  assert.deepEqual(supplementLocalHistory([], [older]).permits, [older], 'a board outage does not hide history');
});

test('historical decisions complete older filing notices and keep their attribution after the Sitadel join', () => {
  const history = normaliseLocalRow(DODU, DODU_ROWS[0]);
  const filed = { ...history, source: 'publication-actes', sourceLabel: 'Municipal board',
    state: 'depose', stateLabel: 'Déposé', decidedOn: null, housing: null };
  const { permits } = supplementLocalHistory([filed], [history]);
  assert.equal(permits[0].state, history.state);
  assert.equal(permits[0].decidedOn, history.decidedOn);
  assert.equal(permits[0].housing, 1);
  assert.equal(filed.decidedOn, null, 'the current input is not mutated');
  assert.deepEqual(mergeRegisters([], permits).permits[0].sources, ['publication-actes', 'dodu']);
  const twin = { ...history, source: 'sitadel' };
  assert.deepEqual(mergeRegisters([twin], permits).permits[0].sources, ['publication-actes', 'dodu', 'sitadel']);
  for (const current of [
    { ...filed, state: 'instruction', stateLabel: 'En cours d’instruction' },
    { ...filed, stateLabel: 'Décision signée' },
    { ...filed, depositedOn: '2026-01-01' },
  ]) {
    assert.equal(supplementLocalHistory([current], [history]).permits[0].state, current.state);
    assert.equal(supplementLocalHistory([current], [history]).permits[0].decidedOn, null);
  }
});

test('local history distinguishes families and amendments and never matches unkeyed rows', () => {
  const permit = normaliseLocalRow(DODU, DODU_ROWS[0]);
  const otherFamily = { ...permit, kind: 'DP' };
  const amendment = { ...permit, key: `${permit.key}M01` };
  const unkeyed = { ...permit, key: null };
  const result = supplementLocalHistory([permit], [otherFamily, amendment, unkeyed, unkeyed]);
  assert.equal(result.overlaps, 0);
  assert.equal(result.permits.length, 5);
});

test('dODu numbers meet Sitadel’s: the commune on six digits, the initial step dropped', () => {
  assert.equal(localDossier(DODU, 'PC6414024B0025I'), 'PC 064 140 24 B0025');
  assert.equal(localDossier(DODU, 'DP641402600059I'), 'DP 064 140 26 00059');
  assert.equal(localDossier(DODU, 'PC6414021B0087M03'), 'PC 064 140 21 B0087 M03');
  assert.equal(localDossier(DODU, 'PC6414021B0069T01'), 'PC 064 140 21 B0069 T01');
  // An unknown suffix is left as written rather than guessed at.
  assert.equal(localDossier(DODU, 'DP6425624B0005PP'), 'DP6425624B0005PP');
  // Only a portal that runs its numbers together is read this way.
  assert.equal(localDossier(TOURS, 'PC6414024B0025I'), 'PC6414024B0025I');

  const permit = normaliseLocalRow(DODU, DODU_ROWS[0]);
  const twin = normaliseSitadelRow(HOUSING_FILE, {
    NUM_DAU: '06414024B0025', TYPE_DAU: 'PC', ETAT_DAU: '2', COMM: '64140',
    DATE_REELLE_AUTORISATION: '2025-01-13',
  });
  assert.equal(permit.key, twin.key);
  const { permits, merged } = mergeRegisters([twin], [permit]);
  assert.equal(merged, 1);
  assert.equal(permits.length, 1, 'one dossier, not the same one twice');
});

test('a dODu row stands on every parcel it names, and its works name no one', () => {
  const decided = normaliseLocalRow(DODU, DODU_ROWS[0]);
  assert.equal(decided.kind, 'PC');
  assert.equal(decided.state, 'accorde');
  assert.equal(decided.depositedOn, '2024-10-02');
  assert.equal(decided.decidedOn, '2025-01-13');
  assert.equal(decided.postcode, '64340');
  assert.equal(decided.communeCode, '64140');
  assert.equal(decided.housing, 1);
  assert.equal(decided.applicant, null);
  assert.deepEqual(decided.parcelIdus.map((ref) => ref.idu), ['64140000AM0140', '64140000AM0141']);
  assert.deepEqual(decided.parcels, ['AM 140', 'AM 141']);
  assert.equal(decided.purpose, 'Construction d’une maison Extension');

  const filed = normaliseLocalRow(DODU, DODU_ROWS[1]);
  assert.equal(filed.kind, 'DP');
  assert.equal(filed.state, 'depose', 'a blank decision is a dossier under review');
  // `099P` is a part of parcel 99.
  assert.deepEqual(filed.parcelIdus, [{ idu: '64140000BD0099', provisional: false, label: 'BD 99' }]);
  assert.ok(!/Exemple/.test(filed.purpose), filed.purpose);
});

test('dODu’s decision words land on the ladder', () => {
  assert.equal(localState('Avis favorable').state, 'accorde');
  assert.equal(localState('Avis favorable avec prescriptions').state, 'accorde');
  assert.equal(localState('favorable sans prescription').state, 'accorde');
  assert.equal(localState('Avis défavorable').state, 'refuse');
  assert.equal(localState('Rejet tacite').state, 'refuse');
  assert.equal(localState('Retrait après décision').state, 'annule');
  assert.equal(localState('Classement sans suite').state, 'annule');
  assert.equal(localState('Irrecevable').state, 'annule');
  // A stay keeps its own words.
  assert.deepEqual(localState('Sursis à statuer'), { state: 'depose', label: 'Sursis à statuer' });
});
