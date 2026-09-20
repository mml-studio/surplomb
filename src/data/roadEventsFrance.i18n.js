/**
 * Strings of `src/data/roadEventsFrance.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Three kinds of words live here, and they are not the same kind of thing.
 *
 * **The eight categories and the four severities** are this app's own reading
 * of the feed: it buckets DATEX II codes into eight things a reader can act
 * on, and each bucket carries a sentence saying what it covers. Prose.
 *
 * **The subtypes and the directions** are DATEX II ENUMERATION VALUES —
 * `rockfalls`, `bothWays` — looked up by their code with `labelFor()`, so a
 * value this build has never met is printed as the code rather than dropped.
 * The keys are the feed's, never translated; only the display words are.
 *
 * **The card sentences** are argued: the feed says a thing has not happened
 * yet (`probable`, `riskOf`) and the card must not show a forecast as fact;
 * it says a section is drawn on the carriageway or merely between two
 * published endpoints, and the card says which. The English makes exactly
 * those claims.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

/**
 * DATEX II subtype → the words an operator would use. Keyed by the feed's
 * own code: `labelFor()` prints an unknown code as itself.
 */
export const ROAD_EVENT_SUBTYPES = defineMessages({
  accident: { fr: 'accident', en: 'accident' },
  brokenDownVehicle: { fr: 'véhicule en panne', en: 'broken-down vehicle' },
  abandonedVehicle: { fr: 'véhicule abandonné', en: 'abandoned vehicle' },
  objectOnTheRoad: { fr: 'objet sur la chaussée', en: 'object on the carriageway' },
  obstructionOnTheRoad: { fr: 'obstacle sur la chaussée', en: 'obstruction on the carriageway' },
  incident: { fr: 'incident', en: 'incident' },
  rockfalls: { fr: 'chutes de pierres', en: 'rockfalls' },
  subsidence: { fr: 'affaissement de chaussée', en: 'carriageway subsidence' },
  fallenTrees: { fr: 'chute d’arbres', en: 'fallen trees' },
  damagedRoadSurface: { fr: 'chaussée dégradée', en: 'damaged road surface' },
  queuingTraffic: { fr: 'file d’attente', en: 'queuing traffic' },
  slowTraffic: { fr: 'trafic ralenti', en: 'slow traffic' },
  stationaryTraffic: { fr: 'trafic à l’arrêt', en: 'stationary traffic' },
  snowOnTheRoad: { fr: 'neige sur la chaussée', en: 'snow on the carriageway' },
  iceOnTheRoad: { fr: 'verglas', en: 'black ice' },
  maintenanceWork: { fr: 'entretien', en: 'maintenance work' },
  repairWork: { fr: 'réparation', en: 'repair work' },
  roadworks: { fr: 'travaux routiers', en: 'roadworks' },
  roadMarkingWork: { fr: 'marquage au sol', en: 'road marking work' },
  resurfacingWork: { fr: 'réfection de chaussée', en: 'resurfacing work' },
  roadsideWork: { fr: 'travaux en accotement', en: 'roadside work' },
  grassCuttingWork: { fr: 'fauchage', en: 'grass cutting' },
  constructionWork: { fr: 'chantier de construction', en: 'construction work' },
  roadClosed: { fr: 'route fermée', en: 'road closed' },
  carriagewayClosed: { fr: 'chaussée fermée', en: 'carriageway closed' },
  laneClosures: { fr: 'voies neutralisées', en: 'lane closures' },
  closedPermanentlyForTheWinter: { fr: 'fermée pour l’hiver', en: 'closed for the winter' },
  singleAlternateLineTraffic: { fr: 'circulation alternée', en: 'alternating one-way traffic' },
  narrowLanes: { fr: 'voies rétrécies', en: 'narrow lanes' },
  contraflow: { fr: 'basculement de circulation', en: 'contraflow' },
  weightRestrictionInOperation: { fr: 'restriction de tonnage', en: 'weight restriction in force' },
  speedRestrictionInOperation: { fr: 'limitation de vitesse', en: 'speed restriction in force' },
  noOvertaking: { fr: 'dépassement interdit', en: 'no overtaking' },
  doNotUseExit: { fr: 'sortie fermée', en: 'exit closed' },
  doNotUseEntry: { fr: 'entrée fermée', en: 'entry closed' },
  useExit: { fr: 'sortie conseillée', en: 'use this exit' },
  followLocalDiversion: { fr: 'déviation locale', en: 'local detour' },
  serviceAreaClosed: { fr: 'aire de service fermée', en: 'service area closed' },
  other: { fr: 'autre', en: 'other', note: 'The DIRs\' bucket when the meaning is only in the text.' },
});

/** Severity, in the DIRs' own five levels. Keyed by the feed's code. */
export const ROAD_EVENT_SEVERITY_LABELS = defineMessages({
  lowest: { fr: 'très faible', en: 'very low' },
  low: { fr: 'faible', en: 'low' },
  medium: { fr: 'moyenne', en: 'medium' },
  high: { fr: 'forte', en: 'high' },
  highest: { fr: 'majeure', en: 'major' },
});

/** TPEG direction values, keyed by the feed's code. */
export const ROAD_EVENT_DIRECTION_LABELS = defineMessages({
  bothWays: { fr: 'dans les deux sens', en: 'both directions' },
  northBound: { fr: 'sens nord', en: 'northbound' },
  southBound: { fr: 'sens sud', en: 'southbound' },
  eastBound: { fr: 'sens est', en: 'eastbound' },
  westBound: { fr: 'sens ouest', en: 'westbound' },
  innerRing: { fr: 'sens intérieur', en: 'inner ring' },
  outerRing: { fr: 'sens extérieur', en: 'outer ring' },
});

export default defineMessages({
  categories: {
    accident: {
      label: { fr: 'Accident', en: 'Accident' },
      blurb: { fr: 'collision déclarée par l’exploitant', en: 'collision declared by the operator' },
    },
    bouchon: {
      label: { fr: 'Bouchon', en: 'Traffic jam' },
      blurb: { fr: 'trafic anormal constaté', en: 'abnormal traffic observed' },
    },
    fermeture: {
      label: { fr: 'Fermeture', en: 'Closure' },
      blurb: { fr: 'route ou chaussée fermée', en: 'road or carriageway closed' },
    },
    obstacle: {
      label: { fr: 'Obstacle', en: 'Obstacle' },
      blurb: {
        fr: 'obstacle, véhicule ou chaussée endommagée',
        en: 'obstacle, vehicle or damaged carriageway',
      },
    },
    intemperie: {
      label: { fr: 'Intempérie', en: 'Bad weather' },
      blurb: { fr: 'conditions météo affectant la route', en: 'weather conditions affecting the road' },
    },
    travaux: {
      label: { fr: 'Travaux', en: 'Roadworks' },
      blurb: { fr: 'chantier en cours ou programmé', en: 'work under way or scheduled' },
    },
    restriction: {
      label: { fr: 'Restriction', en: 'Restriction' },
      blurb: {
        fr: 'limitation, alternat, voie neutralisée',
        en: 'speed limit, alternating traffic, closed lane',
      },
    },
    deviation: {
      label: { fr: 'Déviation', en: 'Detour' },
      blurb: {
        fr: 'itinéraire de déviation ou bretelle fermée',
        en: 'detour route or closed slip road',
      },
    },
    inconnu: {
      label: { fr: 'Non classé', en: 'Unclassified' },
      blurb: {
        fr: 'code d’événement inconnu de cette version',
        en: 'event code this build does not know',
        note: 'Not a ninth category: the refusal to name one. It draws a question mark on the map.',
      },
    },
  },

  /** Who publishes, and how often the layer re-reads them. */
  legendNote: {
    fr: (minutes) => `publié par Bison Futé et les DIR, relu toutes les ${minutes} min`,
    en: (minutes) => `published by Bison Futé and the DIRs, re-read every ${minutes} min`,
    note: 'The aggregate upstream is republished hourly; the number is the poll.',
    sample: [10],
  },

  /** The three scopes: what the visitor is looking at. */
  scopes: {
    active: {
      label: { fr: 'En cours', en: 'Under way' },
      title: { fr: 'Uniquement les événements en cours', en: 'Only events under way' },
    },
    upcoming: {
      label: { fr: '+ À venir', en: '+ Upcoming' },
      title: {
        fr: 'Ajouter les chantiers et fermetures programmés',
        en: 'Add scheduled roadworks and closures',
      },
    },
    all: {
      label: { fr: 'Tout', en: 'All' },
      title: {
        fr: 'Ajouter les événements que l’exploitant a clôturés',
        en: 'Add the events the operator has closed',
      },
    },
  },

  card: {
    title: {
      fr: (head, road) => `${head} — ${road}`,
      en: (head, road) => `${head} — ${road}`,
      note: 'What happened, then the road it happened on. `road` is data (A10, N20).',
      sample: ['Obstacle · rockfalls', 'N20'],
    },
    headWithSubtype: {
      fr: (category, subtype) => `${category} · ${subtype}`,
      en: (category, subtype) => `${category} · ${subtype}`,
      sample: ['Obstacle', 'rockfalls'],
    },
    marker: {
      fr: (marker) => `PR ${marker}`,
      en: (marker) => `PR ${marker}`,
      note: 'Point repère / kilometer post, as the record publishes it. The abbreviation is on French signs.',
      sample: ['05PR91U + 941 m'],
    },
    severity: {
      fr: (level) => `gravité ${level}`,
      en: (level) => `severity ${level}`,
      sample: ['high'],
    },
    lanes: {
      fr: (restricted, total) => `${restricted} voie${restricted > 1 ? 's' : ''} neutralisée${restricted > 1 ? 's' : ''}${total}`,
      en: (restricted, total) => `${restricted} ${plural(restricted, 'lane', 'lanes', { locale: 'en' })} closed${total}`,
      note: '`total` is already the " sur N" / " of N" tail, or an empty string.',
      sample: [2, ' of 2'],
    },
    lanesTotal: {
      fr: (total) => ` sur ${total}`,
      en: (total) => ` of ${total}`,
      sample: [2],
    },
    probable: {
      fr: 'Prévision — non confirmé',
      en: 'Forecast — not confirmed',
      note: 'The feed says it has not happened yet. A card that shows a forecast as fact is the one lie this layer must not tell.',
    },
    riskOf: { fr: 'Risque signalé — non confirmé', en: 'Risk reported — not confirmed' },
    consequences: {
      fr: (list) => `Conséquences déclarées : ${list}`,
      en: (list) => `Declared consequences: ${list}`,
      note: '`list` is already "2 travaux, 1 fermeture" / "2 roadworks, 1 closure".',
      sample: ['2 roadworks, 1 closure'],
    },
    sectionShaped: {
      fr: (distance) => `Section de ${distance} — tracé relevé sur la chaussée`,
      en: (distance) => `Section of ${distance} — traced on the carriageway itself`,
      note: 'The line follows the State\'s own survey, resolved from the point-repère addresses the record publishes.',
      sample: ['3.2 km'],
    },
    sectionChord: {
      fr: (distance) => `Section de ${distance} — extrémités publiées, tracé non fourni`,
      en: (distance) => `Section of ${distance} — endpoints published, no route supplied`,
      sample: ['12 km'],
    },
    section: {
      fr: (distance) => `Section de ${distance}`,
      en: (distance) => `Section of ${distance}`,
      sample: ['600 m'],
    },
    source: {
      fr: (operator) => `Source : ${operator}`,
      en: (operator) => `Source: ${operator}`,
      note: 'Which DIR published the record. The operator name is data.',
      keep: ['Méditerranée'],
      sample: ['DIR Méditerranée'],
    },
    safety: { fr: 'Message lié à la sécurité', en: 'Safety-related message' },
  },

  window: {
    plannedFrom: {
      fr: (stamp) => `Prévu à partir du ${stamp}`,
      en: (stamp) => `Scheduled from ${stamp}`,
      sample: ['Sep 21, 14:05'],
    },
    planned: { fr: 'Programmé', en: 'Scheduled' },
    endedOn: {
      fr: (stamp) => `Terminé le ${stamp}`,
      en: (stamp) => `Ended on ${stamp}`,
      sample: ['Sep 19, 08:30'],
    },
    ended: { fr: 'Clôturé par l’exploitant', en: 'Closed by the operator' },
    between: {
      fr: (start, end) => `De ${start} à ${end}`,
      en: (start, end) => `From ${start} to ${end}`,
      sample: ['09:00', '17:30'],
    },
    since: {
      fr: (stamp) => `Depuis ${stamp}`,
      en: (stamp) => `Since ${stamp}`,
      sample: ['09:00'],
    },
  },

  errors: {
    http: {
      fr: (status) => `Bison Futé HTTP ${status}`,
      en: (status) => `Bison Futé HTTP ${status}`,
      sample: [503],
    },
    malformed: { fr: 'Réponse Bison Futé malformée', en: 'Malformed Bison Futé response' },
    unreachable: { fr: 'Réseau Bison Futé indisponible', en: 'Bison Futé network unavailable' },
  },

  coverage: {
    fr: 'RRN non concédé',
    en: 'State-run national road network',
    note: 'The edge of the data: the non-conceded national road network, what the State operates directly.',
  },
});
