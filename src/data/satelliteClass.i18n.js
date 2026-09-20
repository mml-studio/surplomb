/**
 * Labels and glosses of `src/data/satelliteClass.js` — the satellite classes.
 *
 * INHERITED IN ENGLISH, AND THE FIVE LABELS STAY THAT WAY.
 * This layer came from the upstream project with English strings, so the
 * French globe has been showing them; this catalog adds the French that was
 * missing. The five CLASS LABELS are the exception and are deliberately the
 * same in both languages: they are all-caps chips read at a glance, and two of
 * the five (`STARLINK`, a brand, and `GEO`, the orbit's own abbreviation)
 * cannot be translated at all. Turning one of a five-chip family French would
 * read as a bug, not as a translation — the same decision the glossary already
 * records for `DÉGRADÉ / STALE`-style state badges. The prose beside them, on
 * the other hand, was unreadable to a French reader and is now French.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  station: {
    label: {
      fr: 'STATION',
      en: 'STATION',
      note: 'Identical in both languages: an all-caps class chip. Same word in French.',
    },
    blurb: {
      fr: 'Stations habitées et leurs véhicules de desserte',
      en: 'Crewed stations and their visiting vehicles',
    },
  },
  nav: {
    label: {
      fr: 'NAV',
      en: 'NAV',
      note: 'Identical in both languages: the abbreviation of navigation in both.',
    },
    blurb: {
      fr: 'Navigation GNSS — GPS, GLONASS, Galileo',
      en: 'GNSS navigation — GPS, GLONASS, Galileo',
    },
  },
  geo: {
    label: {
      fr: 'GEO',
      en: 'GEO',
      note: 'Identical in both languages: the orbit’s own abbreviation.',
    },
    blurb: {
      fr: 'Ceinture géostationnaire — télécoms et météo, fixes au-dessus de l’équateur',
      en: 'Geostationary belt — comms and weather, fixed over the equator',
    },
  },
  visual: {
    label: {
      fr: 'VISUAL',
      en: 'VISUAL',
      note: 'Identical in both languages: it names the CelesTrak group `visual`, '
        + 'which is what the blurb says. A French VISUEL would name nothing in the catalog.',
    },
    blurb: {
      fr: 'Objets les plus brillants à l’œil nu — groupe visual de CelesTrak',
      en: 'Brightest naked-eye objects — CelesTrak visual group',
      keep: ['visual'],
    },
  },
  comms: {
    label: {
      fr: 'STARLINK',
      en: 'STARLINK',
      note: 'A brand. Never translated, in either direction.',
    },
    blurb: {
      fr: 'Constellation haut débit Starlink — affichée seulement quand la puce STARLINK est allumée',
      en: 'Starlink broadband shell — shown only while the STARLINK chip is on',
    },
  },
});
