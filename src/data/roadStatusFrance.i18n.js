/**
 * Strings of `src/data/roadStatusFrance.js` — the declared state of the
 * State-run national road network. See docs/i18n/CONVENTIONS.md.
 *
 * The card is an argument about provenance, not a readout: it says who
 * declared the state, when it was declared, and — when the dot is not where
 * the publisher put it — that the position was derived from a kilometer post
 * and to what median error. The English keeps every one of those claims.
 *
 * The four state words are NOT here: they come from the shared congestion
 * ladder (`congestionLadder.i18n.js`), because this layer prints them on one
 * fused row beside `traffic`, and one rung may not carry two names.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  legendNote: {
    fr: 'état déclaré par les DIR, rafraîchi toutes les 60 à 360 s',
    en: 'state declared by the DIRs, refreshed every 60 to 360 s',
    note: 'The block\'s provenance and clock, stated once for the whole key. 60–360 s is measured.',
  },
  unknownBlurb: {
    fr: 'aucun centre ne publie d’état pour ce point',
    en: 'no center publishes a state for this point',
    note: 'The off-scale row: not a rung of the ladder, the absence of a publisher.',
  },
  zoomIn: {
    fr: (degrees) => `Zoome sous ${degrees}° pour charger l’état du réseau`,
    en: (degrees) => `Zoom in below ${degrees}° to load the network state`,
    note: 'Viewport gate, in the tutoiement the other gated layers settled on.',
    sample: [1.2],
  },
  card: {
    unnamedRoad: { fr: 'Voie sans nom', en: 'Unnamed road' },
    noVehicles: {
      fr: 'aucun véhicule compté sur la dernière fenêtre de 6 min',
      en: 'no vehicle counted in the last 6 min window',
      note: '114 of 1,192 stations at 22:30. A fact about the hour, not a broken sensor.',
    },
    average: {
      fr: (measures) => `${measures} (moyenne sur 6 min)`,
      en: (measures) => `${measures} (6 min average)`,
      note: '`measures` is the already-formatted flow and speed pair.',
      sample: ['1,350 veh/h · 88 km/h'],
    },
    reportedBy: {
      fr: (centers) => `⌖ ${centers}`,
      en: (centers) => `⌖ ${centers}`,
      note: 'Which traffic-management centers reported this segment. Names only.',
      sample: ['Bordeaux · Toulouse'],
    },
    operator: {
      fr: (name) => `Exploitant ${name}`,
      en: (name) => `Operator ${name}`,
      sample: ['DIR Atlantique'],
    },
    fromPointRepere: {
      fr: 'position déduite de son point de repère (PR), médiane 4 m',
      en: 'position derived from its kilometer post (PR), median 4 m',
      note: 'The dot is not the publisher\'s: it was resolved from the national kilometer-post survey.',
    },
    stateRead: {
      fr: (ago) => `état relevé ${ago}`,
      en: (ago) => `state read ${ago}`,
      note: '`ago` comes from formatAge (il y a 12 s / 12 s ago).',
      sample: ['12 s ago'],
    },
    stateNotReported: {
      fr: 'état non communiqué pour ce site',
      en: 'state not reported for this site',
    },
    credit: {
      fr: 'Bison Futé / DIR — Licence Ouverte 2.0',
      en: 'Bison Futé / DIR — Licence Ouverte 2.0',
      note: 'Publisher and license, both proper nouns: the same line in either language.',
      keep: ['Futé'],
    },
  },
});
