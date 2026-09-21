/**
 * Strings of `src/data/bruitFrance.js` — Airport noise (PEB/PGS) on the globe.
 *
 * ── SIX LINES OF SIXTY CHARACTERS, IN BOTH LANGUAGES ────────────────────────
 *
 * `createAddressScanOverlayEntry` slices a card to six details and
 * `worldOverlayDraw` wraps each one at about sixty characters. The module the
 * French was written for counts both, line by line, in the comments above
 * every card it builds: a sentence that runs long does not say more, it costs
 * a row, and the row it costs is the last one — the caveat. So the English is
 * written to the same budget rather than to the French word count, and where
 * a clause had to go it is one the line beside it already carries.
 *
 * ── WHAT NEVER GOES, IN EITHER LANGUAGE ─────────────────────────────────────
 *
 *   · the rule that separated the winning zone from the runner-up — the whole
 *     reason this module exists, and the one thing a reader cannot re-derive
 *     from the picture;
 *   · the difference between “the service answered nothing” and “the service
 *     did not answer”;
 *   · that an outline drawn at an overview scale is a guess near its edge.
 *
 * ── VOCABULARY ──────────────────────────────────────────────────────────────
 *
 * From `docs/GLOSSARY.md`: *noise exposure plan (PEB)*, *gêne très forte →
 * very strong nuisance*, *arrêté préfectoral → prefectoral order*,
 * *aérodrome → aerodrome* (the register's own word, and the English one), and
 * the OACI/ICAO code, which stays `OACI` nowhere — the code itself travels,
 * its acronym is only named in the winner rule below.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * Which clause of `chooseBruitAnswer` separated the winner from the
   * runner-up. Not a debug string: a reader who sees two zones painted under
   * one marker is owed the reason one of them is the headline.
   */
  winnerRules: {
    only: { fr: 'seule zone sous le repère', en: 'the only zone under the marker' },
    zone: { fr: 'la plus exposée', en: 'the most exposed' },
    arrete: {
      fr: 'même zone, arrêté le plus récent',
      en: 'same zone, most recent order',
    },
    oaci: {
      fr: 'même zone et date, OACI alphabétique',
      en: 'same zone and date, ICAO code alphabetical',
    },
    id: {
      fr: 'même tout, départage sur l’identifiant',
      en: 'everything equal, settled on the identifier',
    },
  },

  /** The headline over one band, wherever that band is the answer. */
  headline: {
    peb: {
      fr: 'Bruit des avions',
      en: 'Aircraft noise',
      note: 'The subject of a PEB band. Leads the card because “Zone A” on a '
        + 'coloured polygon does not say what the polygon is about.',
    },
    pgs: {
      fr: 'Aide à l’insonorisation',
      en: 'Soundproofing grant',
      note: 'The PGS is a different document with a different purpose — who '
        + 'the noise tax pays to soundproof — so it gets its own subject '
        + 'rather than a qualified “aircraft noise”.',
    },
    line: {
      fr: (subject, zone) => `${subject} · zone ${zone}`,
      en: (subject, zone) => `${subject} · zone ${zone}`,
      sample: ['Aircraft noise', 'A'],
    },
    withAirport: {
      fr: (head, airport) => `${head} — ${airport}`,
      en: (head, airport) => `${head} — ${airport}`,
      sample: ['Aircraft noise · zone A', 'PARIS CHARLES DE GAULLE'],
    },
    serviceDown: {
      fr: 'Bruit des avions — service sans réponse',
      en: 'Aircraft noise — service did not answer',
    },
    nothingHere: {
      fr: 'Bruit des avions — aucun plan sur ce point',
      en: 'Aircraft noise — no plan at this point',
    },
  },

  /** One band's short name, for a secondary mention in a list. */
  band: {
    zone: {
      fr: (zone) => `zone ${zone}`,
      en: (zone) => `zone ${zone}`,
      sample: ['A'],
    },
    pgsZone: {
      fr: (zone) => `PGS zone ${zone}`,
      en: (zone) => `PGS zone ${zone}`,
      sample: ['1'],
      note: 'The PGS is named on its own bands: “zone 3” beside “zone C” '
        + 'invites reading two documents as one scale.',
    },
    withThreshold: {
      fr: (name, threshold) => `${name} — ${threshold}`,
      en: (name, threshold) => `${name} — ${threshold}`,
      sample: ['zone A', '70 dB(A) and above'],
    },
  },

  /** The lines of the card that a single band carries. */
  bandCard: {
    nearby: {
      fr: 'zone voisine — le repère n’est pas dedans',
      en: 'neighboring zone — the marker is not inside it',
    },
    chosen: {
      fr: (rule) => `retenue : ${rule}`,
      en: (rule) => `chosen: ${rule}`,
      sample: ['the most exposed'],
    },
    order: {
      fr: (day) => `arrêté préfectoral du ${day}`,
      en: (day) => `prefectoral order of ${day}`,
      sample: ['Apr 3, 2007'],
    },
    orderWithCode: {
      fr: (day, oaci) => `arrêté préfectoral du ${day} · ${oaci}`,
      en: (day, oaci) => `prefectoral order of ${day} · ${oaci}`,
      sample: ['Apr 3, 2007', 'LFPG'],
      note: 'The ICAO code rides with the order because that is what it '
        + 'identifies: the file is named PEB_<ICAO>_<date>.pdf.',
    },
    orderRevised: {
      fr: (day) => `arrêté préfectoral du ${day} (date reprise du document, `
        + 'le registre affiche l’ancienne)',
      en: (day) => `prefectoral order of ${day} (date taken from the document; `
        + 'the register still shows the old one)',
      sample: ['Apr 3, 2007'],
    },
    registerStillShows: {
      fr: (day) => `le registre affiche encore ${day} — date reprise du document`,
      en: (day) => `the register still shows ${day} — date taken from the document`,
      sample: ['Nov 9, 1985'],
    },
    inverted: {
      fr: 'seuils publiés à l’envers dans le registre, remis dans l’ordre',
      en: 'thresholds published the wrong way round in the register, put back in order',
    },
    pieces: {
      fr: (count) => `publiée en ${count} polygones, fusionnés`,
      en: (count) => `published as ${count} polygons, merged`,
      sample: [3],
    },
    holes: {
      fr: (count) => `${count} découpe${count > 1 ? 's' : ''} — la zone plus exposée commence là`,
      en: (count) => `${count} ${plural(count, 'cut-out', 'cut-outs')} `
        + '— the more exposed zone starts there',
      sample: [2],
    },
    airport: {
      fr: (oaci, airport) => `${oaci} — ${airport}`,
      en: (oaci, airport) => `${oaci} — ${airport}`,
      sample: ['LFPG', 'PARIS CHARLES DE GAULLE'],
    },
    producer: {
      fr: (producer) => `producteur ${producer}`,
      en: (producer) => `published by ${producer}`,
      sample: ['DGAC'],
    },
  },

  /** The nearest aerodrome that HAS a plan, when nothing covers the point. */
  nearest: {
    unnamed: { fr: 'un aérodrome sans nom', en: 'an unnamed aerodrome' },
    unnamedShort: { fr: 'sans nom', en: 'unnamed' },
    orderSuffix: {
      fr: (day) => `, arrêté ${day}`,
      en: (day) => `, order of ${day}`,
      sample: ['Apr 3, 2007'],
    },
    standingOnIt: {
      fr: (who) => `le repère est sur ${who} — le service ne renvoie aucun polygone ici`,
      en: (who) => `the marker is on ${who} — the service returns no polygon here`,
      sample: ['TOUSSUS-LE-NOBLE (LFPN), order of Apr 3, 2007'],
      note: 'Measured: 9 of the 224 aerodromes answer an empty collection at '
        + 'their own published reference point. The order exists; the polygon '
        + 'does not, or does not reach this point.',
    },
    away: {
      fr: (who, km, order) => `plan le plus proche : ${who}, à ${km} km${order}`,
      en: (who, km, order) => `nearest plan: ${who}, ${km} km away${order}`,
      sample: ['BORDEAUX-MERIGNAC (LFBD)', '12.4', ', order of Apr 3, 2007'],
      note: 'The order rides AFTER the distance, which is the order the '
        + 'French has always printed: the reader asks how far first.',
    },
  },

  /** What the scan marker says, in the order a reader needs it. */
  scan: {
    pebDown: {
      fr: 'le service PEB n’a pas répondu — ce n’est pas « aucune zone ici »',
      en: 'the PEB service did not answer — this is not “no zone here”',
    },
    noPlan: {
      fr: 'aucun plan d’exposition au bruit ne couvre ce point',
      en: 'no noise exposure plan covers this point',
    },
    chosenFrom: {
      fr: (count, rule) => `${count} zones ici, retenue : ${rule}`,
      en: (count, rule) => `${count} zones here, chosen: ${rule}`,
      sample: [2, 'the most exposed'],
      note: 'Only ever printed when there was a choice, so the count is at '
        + 'least two in both languages.',
    },
    alsoUnderMarker: {
      fr: (band) => `aussi sous le repère : ${band}`,
      en: (band) => `also under the marker: ${band}`,
      sample: ['zone C — 56 to 65 dB(A)'],
    },
    overlapping: {
      fr: 'le registre publie ici deux zones qui se recouvrent, sans découpe entre elles',
      en: 'the register publishes two overlapping zones here, with no cut between them',
    },
    twoAirports: {
      fr: (codes) => `deux aéroports ici : ${codes} — deux arrêtés distincts`,
      en: (codes) => `two airports here: ${codes} — two separate orders`,
      sample: ['LFPB, LFPG'],
    },
    drawnDashed: {
      fr: (count) => `${count} zone${count > 1 ? 's' : ''} renvoyée${count > 1 ? 's' : ''} `
        + `à côté du repère, dessinée${count > 1 ? 's' : ''} en tirets`,
      en: (count) => `${count} ${plural(count, 'zone', 'zones')} returned beside the marker, `
        + 'drawn dashed',
      sample: [2],
    },
    pgsWinner: {
      fr: (band) => `insonorisation financée : ${band}`,
      en: (band) => `soundproofing funded: ${band}`,
      sample: ['PGS zone 1 — 70 dB(A) and above'],
    },
    pgsDown: {
      fr: 'service PGS sans réponse : rien à dire de l’insonorisation',
      en: 'PGS service did not answer: nothing to say about soundproofing',
    },
    mixedIndex: {
      fr: 'deux indices ici — les seuils ne se comparent pas entre eux',
      en: 'two indices here — their thresholds do not compare',
    },
    disputed: {
      fr: 'unité incertaine : l’arrêté et les seuils ne concordent pas',
      en: 'unit uncertain: the order and the thresholds disagree',
    },
    registerShort: {
      fr: 'registre des arrêtés incomplet : « le plus proche » peut en manquer un',
      en: 'order register incomplete: “the nearest” may be missing one',
    },
  },

  /** The one caveat every card in this module ends on, in both modes. */
  caveat: {
    aircraftOnly: {
      fr: 'avions seulement, ni route ni train',
      en: 'aircraft only, neither road nor rail',
      note: 'It used to name the document it is missing — “la carte de bruit '
        + 'stratégique n’est pas publiée ici”. True, and two rendered rows of '
        + 'six. The reason survives in the data credits.',
    },
    drawnAt: {
      fr: (scale) => `avions seulement, ni route ni train — tracé à ~${scale} près`,
      en: (scale) => `aircraft only, neither road nor rail — drawn to ~${scale}`,
      sample: ['11 m'],
    },
    mixedScale: {
      fr: (coarse, refined, fine) => `avions seulement — tracé à ~${coarse} près, `
        + `${refined} zone${refined > 1 ? 's' : ''} à ~${fine}`,
      en: (coarse, refined, fine) => `aircraft only — drawn to ~${coarse}, `
        + `${refined} ${plural(refined, 'zone', 'zones')} to ~${fine}`,
      sample: ['1.1 km', 4, '11 m'],
      note: 'An overview serves coarse outlines and sharpens them band by '
        + 'band, so one number understates the sharpened ones. The coarsest '
        + 'is the only one true of every shape on screen; the mixture is named.',
    },
  },

  /** One aerodrome's whole plan, in the overview. */
  aerodrome: {
    untitled: { fr: 'Aérodrome sans code', en: 'Aerodrome with no code' },
    zonesPublished: {
      fr: (count, bands) => `${count} zone${count > 1 ? 's' : ''} `
        + `publiée${count > 1 ? 's' : ''} : ${bands}`,
      en: (count, bands) => `${count} ${plural(count, 'zone', 'zones')} published: ${bands}`,
      sample: [4, 'zone A — 70 dB(A) and above ; zone B — 65 to 70 dB(A)'],
    },
    pgsZones: {
      fr: (count) => `insonorisation financée : ${count} zone${count > 1 ? 's' : ''}`,
      en: (count) => `soundproofing funded: ${count} ${plural(count, 'zone', 'zones')}`,
      sample: [3],
    },
    notProbed: {
      fr: 'renvoyé par la sonde d’un aérodrome voisin — son plan peut être incomplet ici',
      en: 'returned by a neighboring aerodrome’s probe — its plan may be incomplete here',
    },
    zoomForAnswer: {
      fr: 'zoome sous 12 km pour savoir quelle zone s’applique à une adresse',
      en: 'zoom below 12 km to see which zone applies to an address',
    },
  },

  /** What the overview says about itself. */
  area: {
    silent: {
      fr: (count) => `${count} aérodrome${count > 1 ? 's' : ''} `
        + `n’${count > 1 ? 'ont' : 'a'} pas répondu — la vue est incomplète`,
      en: (count) => `${count} ${plural(count, 'aerodrome', 'aerodromes')} `
        + 'did not answer — the view is incomplete',
      sample: [3],
    },
    drawn: {
      fr: (count, radiusKm) => `${count} aérodrome${count > 1 ? 's' : ''} `
        + `avec un plan dans un rayon de ${radiusKm} km`,
      en: (count, radiusKm) => `${count} ${plural(count, 'aerodrome', 'aerodromes')} `
        + `with a plan within ${radiusKm} km`,
      sample: [12, 60],
    },
    empty: {
      fr: 'aucun plan de bruit aérien dans ce cadre',
      en: 'no aircraft-noise plan in this frame',
    },
    dropped: {
      fr: (count) => `${count} aérodrome${count > 1 ? 's' : ''} de plus dans le cadre, `
        + `non demandé${count > 1 ? 's' : ''}`,
      en: (count) => `${count} more ${plural(count, 'aerodrome', 'aerodromes')} in the frame, `
        + 'not requested',
      sample: [7],
      note: 'The line that keeps a capped map from reading as a complete one.',
    },
    mixedIndex: {
      fr: 'plusieurs indices dans ce cadre — les seuils ne se comparent pas d’un aérodrome à l’autre',
      en: 'several indices in this frame — thresholds do not compare between aerodromes',
    },
  },

  /** What a click on an arbitrary piece of ground answers. */
  ground: {
    alsoHere: {
      fr: (bands) => `aussi sur ce point : ${bands}`,
      en: (bands) => `also at this point: ${bands}`,
      sample: ['zone C — 56 to 65 dB(A)'],
    },
    refining: {
      fr: 'contour encore large : l’affinage n’a pas fini, patientez',
      en: 'outline still coarse: sharpening is not finished, please wait',
    },
    descend: {
      fr: (km) => `contour d’ensemble : près d’une limite, descendez sous ${km} km`,
      en: (km) => `overview outline: near an edge, descend below ${km} km`,
      sample: [12],
      note: 'At an overview scale a hundred metres of boundary is well under '
        + 'one vertex, so near an edge this answer is a guess.',
    },
  },

  /**
   * The colour key on the map, written for a reader who has never heard of a
   * PEB or a PGS. Each document is named by what it is FOR, each zone by how
   * loud it is and — for the PEB — what that means for a home. The official
   * names and their acronyms stay one hover away, on the two headings.
   */
  legend: {
    pebHeading: { fr: 'Ce qu’on peut construire', en: 'What can be built' },
    pebHeadingTitle: {
      fr: 'Plan d’exposition au bruit (PEB) : la règle d’urbanisme autour de l’aéroport',
      en: 'Noise exposure plan (PEB): the planning rule around the airport',
    },
    pgsHeading: { fr: 'Aide pour isoler son logement', en: 'Help to soundproof a home' },
    pgsHeadingTitle: {
      fr: 'Plan de gêne sonore (PGS) : les logements dont l’isolation peut être financée',
      en: 'Noise nuisance plan (PGS): the homes whose soundproofing can be funded',
    },
    /** How loud each zone is, in words. PEB letters, then PGS figures. */
    loudness: {
      A: { fr: 'Bruit très fort', en: 'Very loud' },
      B: { fr: 'Bruit fort', en: 'Loud' },
      C: { fr: 'Bruit modéré', en: 'Moderate noise' },
      D: {
        fr: 'Bruit plus faible',
        en: 'Quieter',
        note: 'The law grades zones A and B as loud and C as moderate, and gives '
          + 'zone D no grade at all: it is only the plan’s outermost ring. '
          + '“Quieter” is relative on purpose.',
      },
      1: { fr: 'Bruit très fort', en: 'Very loud' },
      2: { fr: 'Bruit fort', en: 'Loud' },
      3: { fr: 'Bruit modéré', en: 'Moderate noise' },
    },
    /** What a PEB zone means for a new home, in a few words. */
    pebRule: {
      A: { fr: 'pas de nouveaux logements', en: 'no new homes' },
      B: { fr: 'presque pas de nouveaux logements', en: 'almost no new homes' },
      C: {
        fr: 'quelques logements neufs, isolation obligatoire',
        en: 'a few new homes, insulation required',
      },
      D: { fr: 'construction libre, isolation obligatoire', en: 'building allowed, insulation required' },
    },
    unknown: { fr: 'Zone non précisée', en: 'Zone not given' },
    unknownBlurb: {
      fr: 'le plan officiel ne dit pas laquelle',
      en: 'the official plan does not say which',
    },
    aside: {
      fr: (count) => `${count} en pointillés : à côté du repère, pas dessous`,
      en: (count) => `${count} dashed: beside the marker, not under it`,
      sample: [2],
    },
  },

  /** The guidance line the panel shows beside the row. Never a fault. */
  guidance: {
    zoomIn: {
      fr: (km) => `Zoome sous ${km} km : au-delà, les zones ne font plus une forme à l’écran`,
      en: (km) => `Zoom in below ${km} km: above that, the zones are no longer a shape on screen`,
      sample: ['80'],
    },
    serviceDownArea: {
      fr: (count) => `Le service DGAC n’a pas répondu pour ${count} `
        + `aérodrome${count > 1 ? 's' : ''} — la vue est incomplète`,
      en: (count) => `The DGAC service did not answer for ${count} `
        + `${plural(count, 'aerodrome', 'aerodromes')} — the view is incomplete`,
      sample: [3],
    },
    serviceDown: {
      fr: 'Le service DGAC n’a pas répondu — ce n’est pas « aucune zone ici »',
      en: 'The DGAC service did not answer — this is not “no zone here”',
    },
    noneInFrame: {
      fr: (km) => `Aucun plan dans ce cadre — le plus proche est à ${km} km`,
      en: (km) => `No plan in this frame — the nearest is ${km} km away`,
      sample: ['48.2'],
    },
    emptyFrame: {
      fr: 'Aucun plan de bruit aérien dans ce cadre',
      en: 'No aircraft-noise plan in this frame',
    },
    nonePoint: {
      fr: (km) => `Aucun plan sur ce point — le plus proche est à ${km} km`,
      en: (km) => `No plan at this point — the nearest is ${km} km away`,
      sample: ['48.2'],
    },
    emptyPoint: {
      fr: 'Aucun plan de bruit aérien sur ce point',
      en: 'No aircraft-noise plan at this point',
    },
    drawnAndDropped: {
      fr: (drawn, dropped) => `${drawn} aérodromes dessinés · ${dropped} de plus dans le cadre, `
        + 'non demandés',
      en: (drawn, dropped) => `${drawn} aerodromes drawn · ${dropped} more in the frame, `
        + 'not requested',
      sample: [12, 7],
    },
    refining: {
      fr: (count) => `contours en cours d’affinage — ${count} `
        + `aérodrome${count > 1 ? 's' : ''} encore au tracé large`,
      en: (count) => `outlines being sharpened — ${count} `
        + `${plural(count, 'aerodrome', 'aerodromes')} still coarsely drawn`,
      sample: [4],
      note: 'Said out loud because the shape is about to change under the '
        + 'reader: a coarse overview is complete, but its outlines redraw.',
    },
  },
});
