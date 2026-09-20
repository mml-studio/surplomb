/**
 * Strings of `src/data/bdtopoBuildings.js` — the 3D buildings layer, its
 * selection card and its status line. See docs/i18n/CONVENTIONS.md.
 *
 * TWO TABLES OF DATA VALUES. IGN publishes a building's `usage_1` and its
 * `nature` as French words inside the vector tile; they are the data, they are
 * matched against in `BDTOPO_USAGE_TIERS`, and they stay French everywhere but
 * on screen. The tables below are keyed BY THOSE VALUES, so an unknown one
 * (IGN adds to the nomenclature) is shown as it came.
 *
 * Every number arrives formatted (`formatCount`, `formatMetres`): a message
 * places words around it.
 */
import { defineMessages } from '../i18n/messages.js';

/** IGN's `usage_1` / `usage_2`, as the card reads them. */
export const BDTOPO_USAGE_LABELS = defineMessages({
  Résidentiel: { fr: 'Résidentiel', en: 'Residential' },
  'Commercial et services': { fr: 'Commercial et services', en: 'Commercial and services' },
  Industriel: { fr: 'Industriel', en: 'Industrial' },
  Agricole: { fr: 'Agricole', en: 'Agricultural' },
  Sportif: { fr: 'Sportif', en: 'Sports' },
  Religieux: { fr: 'Religieux', en: 'Religious' },
  Annexe: { fr: 'Annexe', en: 'Outbuilding' },
  Indifférencié: { fr: 'Indifférencié', en: 'Undifferentiated' },
});

/**
 * IGN's `nature`, which names the few buildings that are something in
 * particular. `Indifférenciée` is the common case and never reaches the card.
 */
export const BDTOPO_NATURE_LABELS = defineMessages({
  Indifférenciée: { fr: 'Indifférenciée', en: 'Undifferentiated' },
  'Arc de triomphe': { fr: 'Arc de triomphe', en: 'Triumphal arch' },
  'Arène ou théâtre antique': { fr: 'Arène ou théâtre antique', en: 'Ancient arena or theater' },
  Chapelle: { fr: 'Chapelle', en: 'Chapel' },
  'Château': { fr: 'Château', en: 'Castle' },
  Eglise: { fr: 'Eglise', en: 'Church' },
  'Fort, blockhaus, casemate': { fr: 'Fort, blockhaus, casemate', en: 'Fort, blockhouse, casemate' },
  'Industriel, agricole ou commercial': {
    fr: 'Industriel, agricole ou commercial',
    en: 'Industrial, agricultural or commercial',
  },
  Monument: { fr: 'Monument', en: 'Monument' },
  'Moulin à vent': { fr: 'Moulin à vent', en: 'Windmill' },
  Serre: { fr: 'Serre', en: 'Greenhouse' },
  Silo: { fr: 'Silo', en: 'Silo' },
  'Tour, donjon': { fr: 'Tour, donjon', en: 'Tower, keep' },
  Tribune: { fr: 'Tribune', en: 'Grandstand' },
});

export default defineMessages({
  /** What a volume is called when neither its nature nor its use says more. */
  building: { fr: 'Bâtiment', en: 'Building' },

  /** The identity block: what the register calls this building. */
  pivot: {
    several: {
      fr: (ids, count) => `RNB ${ids} — ${count} bâtiments pour une emprise`,
      en: (ids, count) => `RNB ${ids} — ${count} buildings for one footprint`,
      note: 'The tile merged what the register splits: one polygon, several identifiers.',
      sample: ['A1B2 · C3D4', 2],
    },
    nearest: {
      fr: (id, distance) => `RNB ${id} — plus proche${distance}, non publié sur cette emprise`,
      en: (id, distance) => `RNB ${id} — nearest${distance}, not published on this footprint`,
      note: 'The identity was GUESSED by proximity; `distance` may be empty.',
      sample: ['A1B2C3D4', ' 12.0 m away'],
    },
    nearestDistance: {
      fr: (metres) => ` à ${metres}`,
      en: (metres) => ` ${metres} away`,
      sample: ['12.0 m'],
    },
    status: {
      fr: (status) => `Statut RNB : ${status}`,
      en: (status) => `RNB status: ${status}`,
      note: 'Anything but a standing building deserves its own line.',
      sample: ['demolished'],
    },
    moreAddresses: {
      fr: (first, more) => `${first} · +${more} autre${more > 1 ? 's' : ''} adresse${more > 1 ? 's' : ''} BAN`,
      en: (first, more) => `${first} · +${more} more BAN address${more > 1 ? 'es' : ''}`,
      sample: ['12 rue de Tolbiac 75013 Paris', 2],
      keep: ['rue de Tolbiac'],
    },
    plot: {
      fr: (id) => `Parcelle ${id}`,
      en: (id) => `Parcel ${id}`,
      note: 'A cadastral parcel, by its fourteen-character id.',
      sample: ['69385000AK0022'],
    },
    plots: {
      fr: (count, first, share) => `${count} parcelles · ${first}${share}`,
      en: (count, first, share) => `${count} parcels · ${first}${share}`,
      sample: [2, '69385000AK0022', ' (99% of the footprint)'],
    },
    plotShare: {
      fr: (percent) => ` (${percent} de l'emprise)`,
      en: (percent) => ` (${percent} of the footprint)`,
      note: 'The share of the BUILDING on that parcel, not of the parcel under the building.',
      sample: ['99%'],
    },
    inherited: {
      fr: 'Adresse et parcelle héritées de ce bâtiment rapproché, non de l\'emprise',
      en: 'Address and parcel inherited from that matched building, not from this footprint',
    },
  },

  /** The selection card: height, dwellings, altitudes, how it is seated. */
  card: {
    height: {
      fr: (metres, floors) => `Hauteur ${metres}${floors}`,
      en: (metres, floors) => `Height ${metres}${floors}`,
      note: '`floors` is empty or ` · 7 floors`.',
      sample: ['18.0 m', ' · 7 floors'],
    },
    floors: {
      fr: (floors) => ` · ${floors} étages`,
      en: (floors) => ` · ${floors} floors`,
      sample: [7],
    },
    heightMissing: { fr: 'Hauteur non publiée', en: 'Height not published' },
    dwellings: {
      fr: (dwellings) => `${dwellings} logements déclarés`,
      en: (dwellings) => `${dwellings} dwellings on record`,
      note: 'From the land-tax files, through BD TOPO.',
      sample: ['12'],
    },
    secondaryUse: {
      fr: (usage) => `Usage secondaire ${usage}`,
      en: (usage) => `Secondary use ${usage}`,
      sample: ['Commercial and services'],
    },
    groundAndRoof: {
      fr: (ground, roof) => `Sol ${ground} m → toit ${roof} m NGF`,
      en: (ground, roof) => `Ground ${ground} m → roof ${roof} m NGF`,
      note: 'NGF is the French vertical datum and stays.',
      sample: ['34.5', '52.1'],
    },
    groundOnly: {
      fr: (ground) => `Sol ${ground} m NGF · toit non publié`,
      en: (ground) => `Ground ${ground} m NGF · roof not published`,
      sample: ['34.5'],
    },
    /** How the volume was seated, which a viewer cannot tell by looking. */
    basis: {
      published: {
        fr: 'Posé sur ses deux altitudes IGN',
        en: 'Seated on both of its IGN altitudes',
      },
      height: {
        fr: 'Posé sur son altitude de sol IGN + sa hauteur',
        en: 'Seated on its IGN ground altitude plus its height',
      },
      surface: {
        fr: 'Posé sur la surface rendue — pas d\'altitude IGN utilisable',
        en: 'Seated on the rendered surface — no usable IGN altitude',
      },
      default: {
        fr: 'Hauteur inconnue : 6 m par défaut',
        en: 'Height unknown: 6 m by default',
      },
    },
    gapBelow: {
      fr: (metres) => `Sol rendu ${metres} sous l'altitude IGN · base prolongée d'autant`,
      en: (metres) => `Rendered ground ${metres} below the IGN altitude · base extended by as much`,
      sample: ['2.4 m'],
    },
    gapAbove: {
      fr: (metres) => `Sol rendu ${metres} au-dessus de l'altitude IGN · toit relevé d'autant`,
      en: (metres) => `Rendered ground ${metres} above the IGN altitude · roof raised by as much`,
      sample: ['2.4 m'],
    },
    altimetry: {
      fr: (method, precision) => `Altimétrie ${method}, ±${precision} m`,
      en: (method, precision) => `Altimetry ${method}, ±${precision} m`,
      note: '`method` is IGN’s own `methode_d_acquisition_altimetrique`, lower-cased.',
      sample: ['interpolation', 2.5],
    },
    altimetryUnspecified: { fr: 'non précisée', en: 'not specified' },
    altimetryMissing: {
      fr: 'Altimétrie non renseignée par l\'IGN',
      en: 'Altimetry not filled in by IGN',
    },
  },

  /** The legend, when a thematic layer is painting the volumes. */
  theme: {
    unpaintedBlurb: {
      fr: (theme) => `Volume sans point ${theme} joint : la teinte d'usage BD TOPO, `
        + 'lavée et assombrie pour qu\'un bâtiment non mesuré ne puisse pas se lire '
        + 'comme un bâtiment mal noté.',
      en: (theme) => `Volume with no ${theme} point joined to it: the BD TOPO use color, `
        + 'washed out and darkened so that a building nobody measured cannot read '
        + 'as a badly rated one.',
      sample: ['property sales'],
    },
    orphanPoints: { fr: 'points sans bâtiment', en: 'points with no building' },
    orphanBlurb: {
      fr: (unmatched, unplaced, offScreen) => `${unmatched} tombent hors de toute emprise `
        + `chargée et ${unplaced} n'ont aucune coordonnée : `
        + `ils existent dans la donnée et ne sont peints nulle part.${offScreen}`,
      en: (unmatched, unplaced, offScreen) => `${unmatched} fall outside every loaded `
        + `footprint and ${unplaced} carry no coordinates at all: `
        + `they exist in the data and are painted nowhere.${offScreen}`,
      sample: ['12', '3', ' 4 name an RNB building that is not in this view.'],
    },
    offScreen: {
      fr: (count) => ` ${count} nomment un bâtiment RNB absent de cette vue.`,
      en: (count) => ` ${count} name an RNB building that is not in this view.`,
      sample: ['4'],
    },
    painted: {
      fr: (painted, theme, unpainted, unknown, unplaced, byId) => `${painted} volume${painted === '1' ? '' : 's'} `
        + `peint${painted === '1' ? '' : 's'} par ${theme}, `
        + `${unpainted} ${unknown}${unplaced}${byId}`,
      en: (painted, theme, unpainted, unknown, unplaced, byId) => `${painted} volume${painted === '1' ? '' : 's'} `
        + `painted by ${theme}, `
        + `${unpainted} ${unknown}${unplaced}${byId}`,
      note: 'The status line of the row while a thematic layer paints the buildings.',
      sample: ['1,204', 'property sales', '318', 'no data', ' — 12 points outside any footprint', ' · 82% by RNB identifier'],
    },
    unplacedPoints: {
      fr: (count, plural) => ` — ${count} point${plural} hors emprise`,
      en: (count, plural) => ` — ${count} point${plural} outside any footprint`,
      note: '`plural` is the `s` the count needs, or nothing.',
      sample: ['12', 's'],
    },
    byIdentifier: {
      fr: (percent) => ` · ${percent} par identifiant RNB`,
      en: (percent) => ` · ${percent} by RNB identifier`,
      note: 'The share joined by the register’s own key rather than by a geocode.',
      sample: ['82%'],
    },
    geometricOnly: {
      fr: ' · jointure géométrique seule',
      en: ' · geometric join only',
      note: 'Nothing on screen carries the register’s key: every color rests on a geocode.',
    },
  },

  /** The status line of the row. */
  status: {
    capped: { fr: 'Plafond de tracé atteint', en: 'Drawing cap reached' },
    cappedDetail: {
      fr: (volumes) => `Plafond de tracé atteint (${volumes} volumes) — `
        + 'le bord droit du bâti est la limite du tracé, pas la limite de la ville. '
        + 'Zoome pour voir le reste.',
      en: (volumes) => `Drawing cap reached (${volumes} volumes) — `
        + 'the straight edge of the buildings is the edge of the drawing, not the edge '
        + 'of the city. Zoom in to see the rest.',
      sample: ['20,000'],
    },
    missingTiles: {
      fr: (missing, requested) => `${missing} tuile${missing > 1 ? 's' : ''} BD TOPO `
        + `refusée${missing > 1 ? 's' : ''} sur ${requested} — bâti incomplet, nouvelle tentative`,
      en: (missing, requested) => `${missing} BD TOPO tile${missing > 1 ? 's' : ''} `
        + `refused out of ${requested} — buildings incomplete, trying again`,
      sample: [2, '64'],
    },
    hiddenByGoogle: {
      fr: 'Masqué : Google 3D dessine déjà ce bâti',
      en: 'Hidden: Google 3D already draws these buildings',
    },
    zoomIn: {
      fr: (degrees) => `Zoome sous ${degrees}° pour charger le bâti`,
      en: (degrees) => `Zoom in below ${degrees}° to load the buildings`,
      sample: [0.08],
    },
    offCoverage: {
      fr: 'Hors couverture BD TOPO (France et DROM)',
      en: 'Outside BD TOPO coverage (mainland France and the overseas departments)',
    },
    loading: { fr: 'Tuiles BD TOPO…', en: 'BD TOPO tiles…' },
  },
});
