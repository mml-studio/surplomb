/**
 * Strings of src/data/layerTaxonomy.js — the Data Layers panel's vocabulary:
 * the seven group headers, one display name per registered layer, the scope
 * chips, and the source lines that needed words rather than a publisher name.
 *
 * WHY THE PANEL'S NAMES LIVE HERE AND NOT ON EACH LAYER MODULE. Same reason the
 * taxonomy itself is one table: naming the rows is a decision about the WHOLE
 * set — « Enseignement » and « Enseignement supérieur » only read as a pair
 * when they are written side by side. Sixty modules cannot hold that.
 *
 * `sources` is deliberately PARTIAL. A source line is mostly publisher names,
 * which stay as published in both languages (`OpenSky Network`, `Bison Futé /
 * DIR (DATEX II)`, `INSEE Filosofi (Géoplateforme)`); only the lines that carry
 * FRENCH WORDS a reader has to understand are listed, and their `fr` is the
 * layer module's own `source` byte for byte — `layerTaxonomy.test.mjs` fails
 * when the two drift apart. Dataset titles keep their French inside the
 * English (« Annuaire de l’éducation » is the name of a file, not a phrase).
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The group headers, UPPERCASE in both languages. Stored accented
   * (`ÉNERGIE`), because `text-transform: uppercase` keeps an accent that is
   * already there and invents none.
   */
  categories: {
    'air-space': { fr: 'CIEL & MER', en: 'SKY & SEA', note: 'One group for what flies and what floats.' },
    'built-environment': { fr: 'BÂTI & TERRITOIRE', en: 'BUILDINGS & LAND' },
    'ground-mobility': { fr: 'MOBILITÉ TERRESTRE', en: 'GROUND MOBILITY' },
    energy: { fr: 'ÉNERGIE', en: 'ENERGY' },
    hazards: { fr: 'RISQUES & ENVIRONNEMENT', en: 'RISKS & ENVIRONMENT' },
    'comms-sensors': { fr: 'RÉSEAUX & CAPTEURS', en: 'NETWORKS & SENSORS' },
    plugged: { fr: 'JEUX BRANCHÉS', en: 'PLUGGED DATASETS', note: 'Where a dataset the reader plugged in lands.' },
  },

  /** The scope chip, by coverage value. `global` carries none and is not here. */
  coverageChips: {
    france: { fr: 'FR', en: 'FR', note: 'The layer only has data over France.' },
    unitedStates: { fr: 'US', en: 'US' },
    cities: { fr: 'VILLES', en: 'CITIES', note: 'The layer only has data over a handful of cities.' },
  },

  /**
   * One display name per registered layer, in panel order. Sentence case in
   * both languages, and no `(FR)` suffix — the scope chip says that once.
   */
  labels: {
    // ── SKY & SEA ──
    flights: { fr: 'Vols en direct', en: 'Live flights' },
    satellites: { fr: 'Satellites', en: 'Satellites' },
    'local-airports': { fr: 'Aéroports', en: 'Airports' },
    'rocket-launches': { fr: 'Missions spatiales', en: 'Space missions' },
    military: { fr: 'Vols militaires', en: 'Military flights' },
    'military-installations': {
      fr: 'Sites militaires',
      en: 'Military sites',
      note: 'Volunteer OSM tagging. The hedge is on the source line and the card, not in the name.',
    },
    'military-awareness': {
      fr: 'Contexte global',
      en: 'Global context',
      note: 'The coordinator behind the CONTACTS panel — it has no row of its own.',
    },
    'ais-live-vessels': { fr: 'Navires et ports', en: 'Ships and ports' },
    'marine-buoys': { fr: 'Bouées marines', en: 'Marine buoys' },
    'local-ports': { fr: 'Ports', en: 'Ports' },

    // ── GROUND MOBILITY ──
    traffic: { fr: 'Trafic routier', en: 'Road traffic' },
    'road-status-fr': { fr: 'État du réseau routier', en: 'Road network status' },
    'transit-fr': { fr: 'Transports en commun', en: 'Public transit' },
    'idfm-network': { fr: 'Réseau et fréquence IDFM (Paris)', en: 'IDFM network and frequency (Paris)' },
    bikeshare: { fr: 'Vélos et véhicules partagés', en: 'Bikes and shared vehicles' },
    'shared-mobility-fr': {
      fr: 'Véhicules partagés',
      en: 'Shared vehicles',
      note: 'Six silhouettes — bike, e-bike, e-scooter, moped, car, other — so not “bikes”.',
    },
    'velo-pulse-fr': { fr: 'Pouls vélo (semaine type)', en: 'Cycling pulse (typical week)' },
    'road-events-fr': { fr: 'Événements routiers', en: 'Road events' },
    'comptages-fr': { fr: 'Comptages routiers', en: 'Traffic counts' },

    // ── ENERGY ──
    'france-energy': { fr: 'Mix électrique', en: 'Electricity mix' },
    'rte-generation': { fr: 'Groupes de production', en: 'Generating units' },
    'edf-power-plants': { fr: 'Centrales électriques', en: 'Power plants' },
    'fr-hydro-plants': { fr: 'Centrales hydro', en: 'Hydro plants' },
    'power-grid': { fr: 'Réseau électrique', en: 'Power grid' },
    'gas-fr': { fr: 'Réseau gaz', en: 'Gas network' },
    'irve-fr': { fr: 'Bornes de recharge', en: 'EV charging stations' },
    'local-dams': { fr: 'Barrages & digues', en: 'Dams & levees' },

    // ── RISKS & ENVIRONMENT ──
    earthquakes: { fr: 'Séismes (24 h)', en: 'Earthquakes (24 h)' },
    'local-firms': { fr: 'Feux actifs (FIRMS)', en: 'Active fires (FIRMS)' },
    'gironde-megafire-2026': {
      fr: 'Mégafeu de Gironde (juil. 2026)',
      en: 'Gironde megafire (Jul. 2026)',
      note: 'The July 2026 fire, reconstructed day by day. Gironde is a place name.',
    },
    vigicrues: {
      fr: "Cours d'eau",
      en: 'Rivers (Vigicrues)',
      note: 'The English names the publisher, which is what tells a reader whose rivers these are.',
    },
    'hubeau-hydro': { fr: "Stations Hub'Eau", en: "Hub'Eau stations", keep: ["Hub'Eau"] },
    georisques: { fr: 'Risques (Géorisques)', en: 'Risks (Géorisques)' },
    'meteofrance-vigilance': { fr: 'Météo', en: 'Weather' },
    'bruit-fr': { fr: 'Bruit des aéroports', en: 'Airport noise' },
    'fraicheur-fr': { fr: 'Îlots de fraîcheur', en: 'Cool islands' },
    'delinquance-fr': { fr: 'Délinquance enregistrée', en: 'Recorded crime' },

    // ── NETWORKS & SENSORS ──
    'telegeography-submarine-cables': { fr: 'Câbles sous-marins', en: 'Submarine cables' },
    'local-datacenters': { fr: 'Infrastructure numérique', en: 'Digital infrastructure' },
    cctv: { fr: 'Caméras publiques', en: 'Public cameras' },
    radio: { fr: 'Radio', en: 'Radio' },
    'meteo-stations-fr': { fr: 'Stations météo', en: 'Weather stations' },
    'anfr-fr': { fr: 'Antennes mobiles', en: 'Mobile antennas' },

    // ── BUILDINGS & LAND ──
    'dvf-sales': { fr: 'Prix de l’immobilier', en: 'Property prices' },
    'avis-valeur': { fr: 'Estimation d’un bien', en: 'Property valuation' },
    'dpe-fr': { fr: 'Performance énergétique (DPE)', en: 'Energy rating (DPE)' },
    'urbanisme-gpu': { fr: 'Urbanisme', en: 'Planning' },
    'ads-fr': { fr: 'Autorisations d’urbanisme', en: 'Planning permits' },
    'isochrone-fr': { fr: 'Zone de chalandise', en: 'Catchment area' },
    'implantation-fr': { fr: 'Fiche implantation', en: 'Site report' },
    'comparables-fr': { fr: 'Comparables (sélection conseiller)', en: 'Comparables (agent’s selection)' },
    'bdtopo-buildings': { fr: 'Bâti 3D', en: '3D buildings' },
    'filosofi-fr': { fr: 'Territoire (carroyage INSEE)', en: 'Territory (INSEE 200 m grid)' },
    'medecins-fr': { fr: 'Santé & secours', en: 'Health & emergency services' },
    'schools-fr': { fr: 'Enseignement', en: 'Schools' },
    'amenities-fr': { fr: 'Équipements du quotidien', en: 'Everyday amenities' },
    'sitadel-fr': { fr: 'Autorisations d’urbanisme (Sitadel)', en: 'Planning permits (Sitadel)' },
    'sup-fr': { fr: 'Enseignement supérieur', en: 'Higher education' },
    'petite-enfance-fr': { fr: 'Accueil du jeune enfant', en: 'Early childcare' },
    'cadastre-fr': { fr: 'Parcelles cadastrales', en: 'Cadastral parcels' },
  },

  /**
   * The source lines the panel prints under a row, for the layers whose own
   * `source` is French WORDS rather than publisher names. Each `fr` repeats the
   * module's string exactly; the English keeps every publisher, licence and
   * dataset title as published.
   */
  sources: {
    'ais-live-vessels': {
      fr: 'AISStream + ANFR (Données radiomaritimes, Licence Ouverte v2.0)',
      en: 'AISStream + ANFR (maritime radio data, Licence Ouverte v2.0)',
    },
    'avis-valeur': {
      fr: 'Estimation Surplomb — comparables DVF (Etalab / DGFiP)',
      en: 'Surplomb valuation — DVF comparables (Etalab / DGFiP)',
    },
    'ads-fr': {
      fr: 'Sitadel — SDES + portails ADS',
      en: 'Sitadel — SDES + planning-permit portals',
    },
    'bruit-fr': {
      fr: 'Plans d’exposition au bruit et plans de gêne sonore — DGAC, via la Géoplateforme (data.geopf.fr)',
      en: 'Noise exposure and noise nuisance plans — DGAC, through the Géoplateforme (data.geopf.fr)',
      keep: ['Géoplateforme'],
    },
    'cadastre-fr': {
      fr: 'IGN Api Carto — cadastre PCI vecteur',
      en: 'IGN Api Carto — PCI vector cadastre',
    },
    'comparables-fr': {
      fr: 'DGFiP DVF · saisie conseiller',
      en: 'DGFiP DVF · the agent’s own entries',
    },
    'delinquance-fr': {
      fr: 'Délinquance enregistrée — SSMSI (ministère de l’Intérieur)',
      en: 'Recorded crime — SSMSI (ministère de l’Intérieur)',
      keep: ['ministère de l’Intérieur'],
      note: 'The ministry keeps its French name, as every organization does.',
    },
    'dpe-fr': {
      fr: 'ADEME — Observatoire DPE',
      en: 'ADEME — DPE observatory',
    },
    'fraicheur-fr': {
      fr: 'Îlots de fraîcheur, espaces verts frais et fontaines — Ville de Paris & Eau de Paris (opendata.paris.fr)',
      en: 'Cool islands, cool green spaces and fountains — Ville de Paris & Eau de Paris (opendata.paris.fr)',
      keep: ['Ville de Paris', 'Eau de Paris'],
      note: 'The two publishers keep their names; only the dataset titles are put into English.',
    },
    'idfm-network': {
      fr: 'Île-de-France Mobilités — référentiel (ODbL 1.0) et offre horaire (Licence Ouverte v2.0)',
      en: 'Île-de-France Mobilités — stop referential (ODbL 1.0) and timetable offer (Licence Ouverte v2.0)',
    },
    'isochrone-fr': {
      fr: 'IGN Géoplateforme (BD TOPO®) · OpenStreetMap / OSRM pour le vélo',
      en: 'IGN Géoplateforme (BD TOPO®) · OpenStreetMap / OSRM for cycling',
      keep: ['Géoplateforme'],
    },
    'petite-enfance-fr': {
      fr: 'Taux de couverture — Cnaf',
      en: 'Coverage rate — Cnaf',
    },
    'sitadel-fr': {
      fr: 'Sitadel — permis de construire et de démolir, SDES/CGDD · parcelles cadastrales Etalab (DGFiP)',
      en: 'Sitadel — building and demolition permits, SDES/CGDD · Etalab cadastral parcels (DGFiP)',
    },
  },
});
