/**
 * Strings of src/data/layerFusions.js — the chip strip under a fused row.
 *
 * ONE ENTRY PER LAYER, keyed by its id, whether that layer is the row's
 * primary or one of its companions: a layer has exactly one chip in the whole
 * table, and keying by id is what lets `validateLayerFusions` check the
 * catalog without knowing which side of a fusion an id sits on.
 *
 * `chip` is a CONTROL, not a name: it is read at 10 px inside a strip, so it
 * is short in both languages, and it deliberately differs from the row's own
 * label (« Comptages · Paris », not « Comptages routiers »). `title` is the
 * tooltip, and it is where the hedge and the source go — translate the claim,
 * never soften it.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  chips: {
    // Planning — switched by the row's two tiles (`rowTiles`), so these three
    // are read only where a member is named alone: the meta line of a dark
    // row, and the key's heading of a member printed on its own.
    'urbanisme-gpu': { fr: 'PLU & servitudes', en: 'PLU & easements' },
    'ads-fr': { fr: 'Autorisations', en: 'Permits' },
    'sitadel-fr': { fr: 'Sur parcelle', en: 'On the parcel' },
    // Property
    'avis-valeur': { fr: 'Estimer un bien', en: 'Value a property' },
    'comparables-fr': { fr: 'Mes comparables', en: 'My comparables' },
    // Education
    'schools-fr': { fr: 'Écoles et lycées', en: 'Schools and high schools' },
    'sup-fr': { fr: 'Supérieur', en: 'Higher education' },
    // The sea
    'local-ports': { fr: 'Ports', en: 'Ports' },
    'marine-buoys': { fr: 'Bouées', en: 'Buoys' },
    // Catchment
    'isochrone-fr': { fr: 'Anneau', en: 'Ring', note: 'The reachable-area ring the layer draws.' },
    'implantation-fr': { fr: 'Fiche', en: 'Report' },
    // Airports, rivers, weather
    'bruit-fr': { fr: 'Bruit (PEB)', en: 'Noise (PEB)' },
    'hubeau-hydro': { fr: 'Stations', en: 'Stations' },
    'meteofrance-vigilance': { fr: 'Vigilance', en: 'Warnings' },
    'meteo-stations-fr': { fr: 'Stations', en: 'Stations' },
    // Energy — one row since 2026-09-21: the grid is its primary AND a chip
    // (`primaryToggle`), and the output chip says what the column measures
    // rather than who publishes it (« Groupes RTE » was the operator's term).
    'power-grid': { fr: 'Réseau', en: 'Grid', note: 'The lines and substations, beside the power stations on the same row.' },
    'rte-generation': { fr: 'Production', en: 'Output', note: 'What each power station produces right now.' },
    'edf-power-plants': { fr: 'Registre EDF', en: 'EDF register' },
    'fr-hydro-plants': { fr: 'Centrales hydro', en: 'Hydro plants' },
    // Transit and shared vehicles
    'transit-fr': { fr: 'Véhicules en direct', en: 'Live vehicles' },
    'idfm-network': { fr: 'Réseau IDFM', en: 'IDFM network' },
    // Read back as the two sub-titles of the « Mobilités partagées » key, so
    // they are words a rider uses: « Stations GBFS » and « Longue traîne FR »
    // named the pipeline, not the bikes (renamed 2026-09-21).
    bikeshare: { fr: 'Vélos en station', en: 'Docked bikes' },
    'shared-mobility-fr': { fr: 'Flottes partagées', en: 'Shared fleets' },
    'velo-pulse-fr': { fr: 'Semaine type', en: 'Typical week' },
    // Road
    traffic: { fr: 'Débit mesuré', en: 'Measured flow' },
    'road-status-fr': { fr: 'État du réseau', en: 'Network status' },
    'road-events-fr': { fr: 'Événements', en: 'Events' },
    'comptages-fr': { fr: 'Comptages · Paris', en: 'Counts · Paris' },
    // Territory
    'filosofi-fr': { fr: 'Revenus', en: 'Income' },
    'delinquance-fr': { fr: 'Délinquance', en: 'Crime' },
    'petite-enfance-fr': { fr: 'Petite enfance', en: 'Early childcare' },
    // Networks
    'local-datacenters': { fr: 'Data centers', en: 'Data centers' },
    'telegeography-submarine-cables': { fr: 'Câbles', en: 'Cables' },
    'anfr-fr': { fr: 'Antennes', en: 'Antennas' },
    // The sky
    flights: { fr: 'Civils', en: 'Civil' },
    military: { fr: 'Militaires', en: 'Military' },
    // Fires — the two modes of « Incendies », as tiles in the key.
    'local-firms': { fr: 'Détections récentes', en: 'Recent detections' },
    'gironde-megafire-2026': {
      fr: 'Grands incendies',
      en: 'Major fires',
      note: 'Past fires replayed on the map. Only Gironde, July 2026, so far.',
    },
  },

  /** The tooltip on a companion's chip: what it adds, and what it hedges. */
  titles: {
    'ads-fr': {
      fr: 'Permis et déclarations déposés — Sitadel, plus les portails métropolitains',
      en: 'Permits and prior declarations filed — Sitadel, plus the métropole portals',
      keep: ['métropole'],
      note: '“métropole” is the French administrative body, not a generic city.',
    },
    'sitadel-fr': {
      fr: 'Sitadel posé sur la parcelle cadastrale, quand la référence est publiée',
      en: 'Sitadel placed on the cadastral parcel, when the reference is published',
    },
    'avis-valeur': {
      fr: 'Estimer un logement au point cliqué, sur les mêmes ventes — le type suit la '
        + 'puce de la ligne, la surface se choisit ici',
      en: 'Value a dwelling at the clicked point, from the same sales — the type follows '
        + 'the row’s chip, the floor area is chosen here',
    },
    'comparables-fr': {
      fr: 'Dossier de comparables — sélection manuelle, à ouvrir quand on en constitue un',
      en: 'A comparables file — a shortlist made by hand, to open while you are building one',
    },
    'sup-fr': {
      fr: 'Établissements du supérieur — 2 800 lycées à BTS sont dans les deux registres',
      en: 'Higher-education establishments — 2,800 high schools with BTS courses are in both registers',
    },
    'local-ports': {
      fr: 'World Port Index — les escales que les navires déclarent',
      en: 'World Port Index — the calls vessels declare',
    },
    'marine-buoys': {
      fr: "État de la mer mesuré — houle, vent, température de l'eau (NDBC)",
      en: 'Measured sea state — swell, wind, water temperature (NDBC)',
    },
    'implantation-fr': {
      fr: "Fiche implantation — ce que l'anneau contient, en une carte",
      en: 'Site report — what the ring contains, on one card',
    },
    'bruit-fr': {
      fr: "Plans d'exposition au bruit — la contrainte au sol des aéroports",
      en: 'Noise exposure plans — what an airport constrains on the ground',
    },
    'hubeau-hydro': {
      fr: "Hub'Eau — débit et hauteur mesurés sur le tronçon",
      en: "Hub'Eau — flow and level measured on the reach",
      keep: ["Hub'Eau"],
    },
    'meteo-stations-fr': {
      fr: 'Météo-France — les 190 stations qui publient leur relevé',
      en: 'Météo-France — the 190 stations that publish their readings',
    },
    'rte-generation': {
      fr: 'Production des centrales (RTE) — en temps réel, avec une clé',
      en: 'Power station output (RTE) — real time, with a key',
    },
    'edf-power-plants': {
      fr: 'Registre EDF — les 79 sites d’EDF et leur puissance installée, sans la production du moment',
      en: 'EDF register — EDF’s 79 sites and their installed capacity, without what they produce now',
    },
    'fr-hydro-plants': {
      fr: 'Registre ODRÉ — toute la filière hydraulique française, '
        + 'plus 592 centrales cartographiées hors de France',
      en: 'The ODRÉ register — the whole French hydro fleet, '
        + 'plus 592 plants mapped outside France',
    },
    'idfm-network': {
      fr: 'Arrêts, lignes et fréquence horaire d’Île-de-France — 37 956 arrêts',
      en: 'Stops, lines and hourly frequency across Île-de-France — 37,956 stops',
      keep: ['Île-de-France'],
    },
    'shared-mobility-fr': {
      fr: '135 opérateurs français, tous modes — vélo, trottinette, scooter, voiture',
      en: '135 French operators, every mode — bike, e-scooter, moped, car',
    },
    'velo-pulse-fr': {
      fr: 'Remplissage moyen par heure de la semaine — Paris et Lyon',
      en: 'Average occupancy by hour of the week — Paris and Lyon',
    },
    'road-status-fr': {
      fr: 'Traficolor — état déclaré par les DIR, hors autoroutes concédées',
      en: 'Traficolor — status as declared by the DIRs, conceded motorways excluded',
    },
    'road-events-fr': {
      fr: 'Chantiers, accidents et fermetures publiés par Bison Futé',
      en: 'Roadworks, crashes and closures published by Bison Futé',
    },
    'comptages-fr': {
      fr: 'Comptages routiers de Paris — un COMPTAGE de véhicules, pas une congestion',
      en: 'Paris traffic counts — a COUNT of vehicles, not congestion',
      note: 'The capital letters carry the whole point of the layer; keep them.',
    },
    'delinquance-fr': {
      fr: 'Taux enregistrés par les services — à lire avec la garde du module',
      en: 'Rates as recorded by the services — to be read with the layer’s own caveat',
    },
    'petite-enfance-fr': {
      fr: 'Places pour 100 enfants de moins de trois ans',
      en: 'Places per 100 children under three',
    },
    'telegeography-submarine-cables': {
      fr: 'TeleGeography — atterrages et câbles sous-marins (licence non commerciale)',
      en: 'TeleGeography — landing points and submarine cables (non-commercial licence)',
    },
    'anfr-fr': {
      fr: 'Supports ANFR — 2G à 5G, par opérateur',
      en: 'ANFR masts — 2G to 5G, by operator',
    },
    military: {
      fr: 'Aéronefs militaires identifiés — même source, même rendu',
      en: 'Identified military aircraft — same source, same rendering',
    },
    'gironde-megafire-2026': {
      fr: 'Rejouer le feu de Gironde, juillet 2026 — sans clé',
      en: 'Replay the Gironde fire of July 2026 — no key needed',
    },
  },

  /**
   * The tiles a row draws under itself in the Layers panel (`rowTiles` in
   * layerFusions.js), keyed `<primary>:<tile key>`. `label` is the tile,
   * `title` its tooltip, and `hint` the line printed under the tiles while that
   * tile is lit. Words of the approved mock of « Urbanisme » (2026-09-23).
   */
  rowTiles: {
    'ads-fr:permits': {
      label: { fr: 'Permis & travaux', en: 'Permits & works' },
      title: {
        fr: 'Les permis de construire et de démolir, et où en sont les travaux',
        en: 'Building and demolition permits, and how far the work has got',
      },
      hint: { fr: 'Sélectionnez un projet sur la carte.', en: 'Select a project on the map.' },
    },
    'ads-fr:rules': {
      label: { fr: 'Règles d’urbanisme', en: 'Planning rules' },
      title: {
        fr: 'Ce qu’on peut construire ici : le zonage du PLU et les servitudes',
        en: 'What may be built here: the PLU zoning and the easements',
        keep: ['PLU'],
      },
    },
  },

  /**
   * A tile that switches PART of a layer (`part` in layerFusions.js), keyed
   * `<layer id>:<part>`. A part with no entry here is named by its layer's
   * chip, as the masts are.
   */
  tiles: {
    'anfr-fr:coverage': {
      label: { fr: 'Couverture 4G', en: '4G coverage' },
      title: {
        fr: 'Estimation des opérateurs publiée par l’ARCEP — zones sans 4G, ou le réseau d’un opérateur',
        en: 'The operators’ estimate published by ARCEP — areas with no 4G, or one operator’s network',
      },
    },
  },
});
