/**
 * Strings of `src/data/airportsPack.js` — see docs/i18n/CONVENTIONS.md.
 *
 * ── THE THREE TIERS ARE THE LAYER'S CLAIM ───────────────────────────────────
 *
 * They are not sizes: they say whether you can buy a ticket. `airline` is a
 * field with at least one scheduled service, `airport` is everything else
 * with a hard surface — air bases, business aviation, freight — and
 * `airfield` is the long tail of flying clubs, altiports and water bases,
 * which this pack carries for France only. The glossary fixes all three.
 *
 * The runway SURFACE is three families and never the upstream column: that
 * column is free text, 627 distinct spellings across 48,230 runways, and
 * quoting it would ship a volunteer database's data-entry history as if it
 * were a specification.
 *
 * Airport, city and country names are data. So is the `usage` the IGN
 * publishes on a footprint.
 */
import { defineMessages } from '../i18n/messages.js';

/** OurAirports' size/kind buckets. */
export const AIRPORT_TYPE_NAMES = defineMessages({
  large_airport: { fr: 'Grand aéroport', en: 'Large airport' },
  medium_airport: { fr: 'Aéroport', en: 'Airport' },
  small_airport: { fr: 'Aérodrome', en: 'Airfield' },
  heliport: { fr: 'Hélistation', en: 'Heliport' },
  seaplane_base: { fr: 'Hydrobase', en: 'Seaplane base' },
  balloonport: { fr: 'Base de ballons', en: 'Balloonport' },
});

/**
 * The three surface families the free-text column can honestly support,
 * keyed by the value the PACK carries.
 *
 * That value is French because the pack is French and committed: changing it
 * would rewrite a data file and every card built from an older one. Only the
 * word a reader sees is the page's language.
 */
export const RUNWAY_SURFACE_NAMES = defineMessages({
  'revêtue': { fr: 'revêtue', en: 'paved' },
  'non revêtue': { fr: 'non revêtue', en: 'unpaved' },
  eau: { fr: 'eau', en: 'water' },
});

export default defineMessages({
  tiers: {
    airline: {
      label: { fr: 'Aéroport de ligne', en: 'Scheduled-service airport' },
      blurb: {
        fr: 'Dessert au moins une ligne régulière — un billet s’y achète.',
        en: 'Serves at least one scheduled route — you can buy a ticket there.',
      },
    },
    airport: {
      label: { fr: 'Aéroport sans ligne', en: 'Airport without scheduled service' },
      blurb: {
        fr: 'Aucune ligne régulière : bases aériennes, aviation d’affaires, terrains de fret.',
        en: 'No scheduled route: air bases, business aviation, freight fields.',
      },
    },
    airfield: {
      label: { fr: 'Aérodrome & aéroclub', en: 'Airfield & flying club' },
      blurb: {
        fr: 'Terrain sans ligne régulière — aéroclubs, altisurfaces, hydrobases. France uniquement dans ce paquet.',
        en: 'A field with no scheduled route — flying clubs, altiports, water bases. France only in this pack.',
      },
    },
  },

  floors: {
    all: {
      label: { fr: 'TOUS', en: 'ALL' },
      title: { fr: 'Tous les terrains du paquet', en: 'Every field in the pack' },
    },
    airports: {
      label: { fr: 'AÉROPORTS', en: 'AIRPORTS' },
      title: { fr: 'Masquer les aérodromes et aéroclubs', en: 'Hide airfields and flying clubs' },
    },
    airlines: {
      label: { fr: 'LIGNES', en: 'ROUTES' },
      title: {
        fr: 'Ne garder que les terrains desservis par une ligne régulière',
        en: 'Keep only fields served by a scheduled route',
      },
    },
  },

  legend: {
    markerRange: {
      fr: (km) => ` Marque affichée sous ${km} km.`,
      en: (km) => ` Mark shown below ${km} km.`,
      note: 'A cap states its CRITERION, not only its count: this one is invisible by construction.',
      sample: ['900'],
    },
    hidden: {
      fr: (count) => ` — ${count} masqué${count > 1 ? 's' : ''}`,
      en: (count) => ` — ${count} hidden`,
      sample: [12],
    },
  },

  /** The four runway-length classes. Not painted today; they name the class. */
  lengths: {
    len3000: { fr: '3 000 m et plus', en: '3,000 m and over' },
    len1800: { fr: '1 800 – 2 999 m', en: '1,800 – 2,999 m' },
    len1000: { fr: '1 000 – 1 799 m', en: '1,000 – 1,799 m' },
    len0: { fr: 'moins de 1 000 m', en: 'under 1,000 m' },
    nolength: { fr: 'Longueur non publiée', en: 'Length not published' },
  },

  card: {
    scheduled: { fr: 'vols réguliers', en: 'scheduled flights' },
    metres: {
      fr: (metres) => `${metres} m`,
      en: (metres) => `${metres} m`,
      sample: ['4,215'],
    },
    hectares: {
      fr: (hectares) => `${hectares} ha`,
      en: (hectares) => `${hectares} ha`,
      sample: ['2,820'],
    },
    runway: {
      fr: (length, surface) => `piste ${length}${surface}`,
      en: (length, surface) => `runway ${length}${surface}`,
      note: '`surface` is " revêtue" / " paved", or an empty string when the column says nothing.',
      sample: ['4,215 m', ' paved'],
    },
    footprint: {
      fr: (hectares) => `emprise IGN ${hectares}`,
      en: (hectares) => `IGN footprint ${hectares}`,
      note: 'The only line on this card that is not OurAirports, so it names the IGN in place.',
      sample: ['2,820 ha'],
    },
    inbound: {
      fr: (count) => `${count} en approche`,
      en: (count) => `${count} inbound`,
      sample: [3],
    },
    outbound: {
      fr: (count) => `${count} au départ`,
      en: (count) => `${count} outbound`,
      note: 'What THIS SESSION is tracking, never a departure board.',
      sample: [2],
    },
    trafficWithNames: {
      fr: (legs, names) => `${legs} — ${names}`,
      en: (legs, names) => `${legs} — ${names}`,
      sample: ['3 inbound · 2 outbound', 'AFR1234, EJU8801'],
    },
  },
});
