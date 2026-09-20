/**
 * Strings of `src/data/fraicheurFeed.js` — Cool islands (Paris).
 *
 * ── THREE REGISTERS, AND ONLY THEIR LABELS ARE TRANSLATED ───────────────────
 *
 * Everything this module reads is keyed on a value the Ville de Paris or Eau
 * de Paris publishes: the twelve `type` strings, the ten `type_objet` codes,
 * the three `modele` strings, the seven `horaires_*` columns. Those stay
 * exactly as published, in the code, in the cache and in the URL — only the
 * display label is worded here, and a value nobody has worded is printed as
 * it came, which is information a blank would not be.
 *
 * ── THE THREE THINGS THIS LAYER REFUSES TO SAY ──────────────────────────────
 *
 * The French was written to keep three distinctions that a translation could
 * quietly lose, and each has a test:
 *
 *   · “not published” is never “no”. An unmeasured canopy, a fountain whose
 *     availability was never stated and a park with no readable timetable all
 *     say so, and none of them reads as zero, shut or dry.
 *   · a timetable read out of an EXPIRED window carries the window on the same
 *     line as the answer, because 682 of 984 green spaces are in that state.
 *   · the register's two vegetation figures disagree on 903 of 953 rows, and
 *     the card prints BOTH rather than picking one.
 *
 * ── AND THE CLOCK IS PARIS'S ───────────────────────────────────────────────
 *
 * Every hour on this layer is Paris local time, whoever is reading. The line
 * says so in both languages rather than letting a reader in another zone
 * assume it is theirs.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/** The three families the twelve published types fold onto. */
export const FRAICHEUR_FAMILIES_WORDS = defineMessages({
  pierre: {
    label: { fr: 'Intérieur frais', en: 'Cool indoors' },
    blurb: {
      fr: 'Lieux de culte (125), musées (65), mairies (19), bibliothèques (16). '
        + 'Ils sont sur la liste parce que la pierre est froide, et on y entre.',
      en: 'Places of worship (125), museums (65), town halls (19), libraries (16). '
        + 'They are on the list because stone is cold, and you can go inside.',
    },
  },
  ombre: {
    label: { fr: 'Ombre et plein air', en: 'Shade and open air' },
    blurb: {
      fr: 'Ombrières pérennes (127) et temporaires (12), terrains de boules (13), '
        + 'sites Découverte & Initiation (4). Dehors, sans porte ni horaire.',
      en: 'Permanent shade structures (127) and temporary ones (12), pétanque '
        + 'courts (13), Découverte & Initiation sites (4). Outdoors, no door, no hours.',
      keep: ['Découverte & Initiation', 'pétanque'],
    },
  },
  eau: {
    label: { fr: 'Eau', en: 'Water' },
    blurb: {
      fr: 'Brumisateurs (87), piscines (39), bains-douches (17), baignades '
        + 'extérieures (11). Les 67 bassins où l’on entre sont ce que ce registre '
        + 'publie de plus fiable : 64 sur 67 donnent un horaire lisible. '
        + 'Aucun brumisateur n’en donne.',
      en: 'Misters (87), swimming pools (39), public baths (17), outdoor bathing '
        + 'spots (11). The 67 pools you can get into are the most reliable thing '
        + 'this register publishes: 64 of 67 give a readable timetable. '
        + 'Not one mister does.',
    },
  },
});

/**
 * The canopy bands, keyed by band id.
 *
 * `clair` swallowed a band of its own: 66 spaces measure EXACTLY zero tall
 * vegetation, which is a different statement from “a little”. That statement
 * is not lost — it is in this blurb, on each of the 66 cards, and in the
 * heatwave row's own figure.
 */
export const FRAICHEUR_CANOPY_WORDS = defineMessages({
  clair: {
    label: { fr: 'Parc peu ombragé', en: 'Lightly shaded park' },
    blurb: {
      fr: 'Moins d’un quart du sol sous un arbre de plus de 8 m — 401 espaces sur 984, '
        + 'dont 66 à EXACTEMENT zéro : rien de plus haut que 8 m au relevé 2024.',
      en: 'Less than a quarter of the ground under a tree taller than 8 m — 401 spaces '
        + 'of 984, of which 66 at EXACTLY zero: nothing over 8 m in the 2024 survey.',
    },
  },
  ombrage: {
    label: { fr: 'Parc ombragé', en: 'Shaded park' },
    blurb: {
      fr: 'Au moins un quart du sol sous une canopée de plus de 8 m — 582 espaces. '
        + 'Les bois en tiennent l’essentiel : 6 159 289 m² des 8 734 377 m² de '
        + 'canopée mesurée à Paris.',
      en: 'At least a quarter of the ground under a canopy taller than 8 m — 582 spaces. '
        + 'The two woods hold most of it: 6,159,289 m² of the 8,734,377 m² of '
        + 'canopy measured in Paris.',
    },
  },
  inconnue: {
    label: { fr: 'Canopée non mesurée', en: 'Canopy not measured' },
    blurb: {
      fr: 'indice_veget_sup8m_2024 absent — un espace sur 984. La surface, elle, manque sur 65.',
      en: 'indice_veget_sup8m_2024 missing — one space of 984. The area itself is '
        + 'missing on 65.',
      keep: ['indice_veget_sup8m_2024'],
    },
  },
});

/**
 * The ten `type_objet` codes of the fountain register, keyed as published.
 *
 * The field is capped at 15 characters upstream and four values are ELIDED
 * rather than truncated (`FONTAINE_WALLACE` arrives as `FONTNE_WALLACE`), so
 * every one is mapped; an unknown code is shown verbatim rather than guessed.
 */
export const FRAICHEUR_FOUNTAIN_KINDS = defineMessages({
  FONTAINE_BOIS: { fr: 'Fontaine de parc', en: 'Park fountain' },
  FONTNE_WALLACE: {
    fr: 'Fontaine Wallace',
    en: 'Wallace fountain',
    keep: ['Wallace'],
  },
  FONTAINE_2EN1: { fr: 'Fontaine 2-en-1', en: '2-in-1 fountain' },
  FONTAINE_ARCEAU: { fr: 'Fontaine arceau', en: 'Arch fountain' },
  BORNE_FONTAINE: { fr: 'Borne-fontaine', en: 'Standpipe' },
  FTNE_PETILLANTE: { fr: 'Fontaine pétillante', en: 'Sparkling-water fountain' },
  FONTAINE_TOTEM: { fr: 'Fontaine totem', en: 'Totem fountain' },
  FTNE_POING_EAU: {
    fr: 'Fontaine « poing d’eau »',
    en: '“Poing d’eau” fountain',
    keep: ['Poing d’eau'],
    note: 'The model’s own name, kept: it is what the register calls it and '
      + 'what is written on the object.',
  },
  FONTAINE_ALBIEN: {
    fr: 'Puits de l’Albien',
    en: 'Albian aquifer well',
    note: 'Water drawn from the Albian aquifer, 600 m under Paris.',
  },
  FTNE_MILLENAIRE: {
    fr: 'Fontaine du Millénaire',
    en: 'Millénaire fountain',
    keep: ['Millénaire'],
    note: 'The model’s own name, kept: it is what the register calls it.',
  },
});

export default defineMessages({
  /** A fountain whose `type_objet` is empty. */
  fountainGeneric: { fr: 'Fontaine', en: 'Drinking fountain' },

  /** The opening line: what the clock says, and how much that is worth. */
  opening: {
    always: {
      fr: 'Ouvert 24 h/24 selon le registre',
      en: 'Open 24 hours a day according to the register',
      note: 'The flag and the seven timetable strings DISAGREE on 244 of 984 '
        + 'spaces; the flag wins, and the line says whose claim it is.',
    },
    openUntil: {
      fr: (time) => `Ouvert maintenant — ferme à ${time}`,
      en: (time) => `Open now — closes at ${time}`,
      sample: ['19:30'],
    },
    closedUntilToday: {
      fr: (time) => `Fermé maintenant — ouvre à ${time}`,
      en: (time) => `Closed now — opens at ${time}`,
      sample: ['08:00'],
    },
    closedUntilDay: {
      fr: (day, time) => `Fermé maintenant — ouvre ${day} à ${time}`,
      en: (day, time) => `Closed now — opens ${day} at ${time}`,
      sample: ['Monday', '08:00'],
    },
    closed: { fr: 'Fermé maintenant', en: 'Closed now' },
    unknown: {
      fr: 'Aucun horaire hebdomadaire publié',
      en: 'No weekly timetable published',
      note: 'The honest answer for 423 of 535 equipment rows and 269 of 984 '
        + 'green spaces. Never dressed up as “closed”.',
    },
    expired: {
      fr: (window) => `⚠ Horaires publiés pour ${window} — période expirée`,
      en: (window) => `⚠ Timetable published for ${window} — the period has expired`,
      sample: ['April 1 to October 31'],
      note: 'The window is the register’s own French sentence, printed as '
        + 'published (`du 1er avril au 31 octobre`) — a data value, not a '
        + 'message. 682 of 984 green spaces are in this state, which is why '
        + 'the caveat rides on the same line as the answer.',
    },
    window: {
      fr: (window) => `Horaires valables ${window}`,
      en: (window) => `Timetable valid ${window}`,
      sample: ['April 1 to October 31'],
    },
    openEnded: {
      fr: (window) => `Horaires ${window}`,
      en: (window) => `Timetable ${window}`,
      sample: ['from April 1'],
    },
  },

  /** The card for one green space. */
  space: {
    untitled: { fr: 'Espace vert frais', en: 'Cool green space' },
    heatwaveNoCanopy: {
      fr: '🔥 Ouverture canicule déclarée — mais 0 % de canopée mesurée ici',
      en: '🔥 Heatwave opening declared — but 0% canopy measured here',
      note: 'Eleven of the 23 spaces that declare a heatwave opening have '
        + 'exactly zero tall vegetation. The card says so on those eleven.',
    },
    heatwave: {
      fr: '🔥 Ouverture canicule déclarée',
      en: '🔥 Heatwave opening declared',
    },
    summerNights: {
      fr: 'Ouverture estivale nocturne',
      en: 'Open late in summer',
    },
    canopyUnknown: {
      fr: 'Canopée > 8 m non mesurée au relevé 2024',
      en: 'Canopy over 8 m not measured in the 2024 survey',
    },
    canopy: {
      fr: (share, area) => `Canopée > 8 m : ${share} du sol — ${area} (relevé 2024)`,
      en: (share, area) => `Canopy over 8 m: ${share} of the ground — ${area} (2024 survey)`,
      sample: ['31.9%', '4.2 ha'],
    },
    canopyNoArea: {
      fr: (share) => `Canopée > 8 m : ${share} du sol — surface non publiée (relevé 2024)`,
      en: (share) => `Canopy over 8 m: ${share} of the ground — area not published (2024 survey)`,
      sample: ['31.9%'],
    },
    otherVegetation: {
      fr: (share) => `Le registre annonce aussi ${share} de « végétation haute » — `
        + 'un autre chiffre, pas une correction',
      en: (share) => `The register also states ${share} of “tall vegetation” — `
        + 'a different figure, not a correction',
      sample: ['38.1%'],
      note: 'The two disagree on 903 of the 953 rows carrying both. The card '
        + 'prints both rather than averaging them or picking one.',
    },
    identifier: {
      fr: (ref) => `Identifiant ${ref}`,
      en: (ref) => `Identifier ${ref}`,
      sample: ['1234'],
    },
  },

  /** The card for one cool spot. */
  equipment: {
    untitled: { fr: 'Îlot de fraîcheur', en: 'Cool island' },
    paying: { fr: 'payant', en: 'paid entry' },
    free: { fr: 'gratuit', en: 'free' },
    status: {
      fr: (status) => `Statut publié : ${status}`,
      en: (status) => `Published status: ${status}`,
      sample: ['Eteint'],
      note: 'Null on 508 of 535 rows, so it only prints when it says '
        + 'something — and “Eteint” on a mister is worth a line. The value is '
        + 'the register’s own word, printed as published.',
    },
  },

  /** The card for one fountain. */
  fountain: {
    model: {
      fr: (model) => `Modèle ${model}`,
      en: (model) => `Model ${model}`,
      sample: ['Wallace'],
    },
    misting: { fr: 'Modèle brumisant', en: 'Misting model' },
    available: { fr: 'En service', en: 'In service' },
    staleOutage: {
      fr: '⚠ Signalée hors service, mais la fin d’indisponibilité publiée est déjà passée',
      en: '⚠ Flagged out of service, but the published end of the outage has already passed',
      note: 'Ten of the 85 unavailable fountains. The tap may well be running '
        + 'and the flag has not caught up.',
    },
    out: { fr: 'Hors service', en: 'Out of service' },
    reason: {
      fr: (reason) => `Motif : ${reason}`,
      en: (reason) => `Reason: ${reason}`,
      sample: ['Travaux'],
      note: 'The register’s own word for the outage, printed as published.',
    },
    outageWindow: {
      fr: (from, to) => `Indisponible du ${from} au ${to}`,
      en: (from, to) => `Out of service from ${from} to ${to}`,
      sample: ['2026-07-01', '2026-09-30'],
      note: 'The register’s ISO days, printed as published rather than '
        + 'reformatted: they are the two dates in the source row.',
    },
    outageSince: {
      fr: (from) => `Indisponible depuis le ${from}`,
      en: (from) => `Out of service since ${from}`,
      sample: ['2026-07-01'],
    },
    unknownAvailability: {
      fr: 'Disponibilité non publiée',
      en: 'Availability not published',
    },
    source: {
      fr: 'Source : Eau de Paris',
      en: 'Source: Eau de Paris',
      keep: ['Eau de Paris'],
    },
  },

  /** The one line under the layer's toggle. */
  status: {
    loading: {
      fr: 'lecture des trois registres parisiens…',
      en: 'reading the three Paris registers…',
    },
    outsideParis: {
      fr: 'Hors Paris — cette couche ne décrit que la Ville de Paris et ses bois',
      en: 'Outside Paris — this layer only describes the Ville de Paris and its two woods',
    },
    empty: {
      fr: 'Aucun îlot de fraîcheur dans cette vue',
      en: 'No cool island in this view',
    },
    openNow: {
      fr: (count, time) => `${count} ouverts à ${time} (heure de Paris)`,
      en: (count, time) => `${count} open at ${time} (Paris time)`,
      sample: ['41', '15:20'],
      note: 'Paris time, whoever is reading: the three registers publish local '
        + 'opening hours and nothing here converts them.',
    },
    unreadable: {
      fr: (count) => `${count} sans horaire lisible`,
      en: (count) => `${count} with no readable timetable`,
      sample: ['12'],
    },
    expired: {
      fr: (count) => `${count} horaires expirés`,
      en: (count) => `${count} expired timetables`,
      sample: ['682'],
    },
    drawn: {
      fr: (count) => `${count} objets tracés`,
      en: (count) => `${count} objects drawn`,
      sample: ['1,204'],
    },
    treesOff: { fr: 'arbres masqués', en: 'trees hidden' },
    treesTooHigh: {
      fr: 'arbres : zoome pour les charger',
      en: 'trees: zoom in to load them',
    },
    treesTooDense: {
      fr: (count) => `${count} arbres ici — zoome`,
      en: (count) => `${count} trees here — zoom in`,
      sample: ['18,402'],
    },
    trees: {
      fr: (count, plainCount) => `${count} arbres`,
      en: (count, plainCount) => `${count} ${plural(plainCount, 'tree', 'trees')}`,
      sample: ['4,812', 4812],
      note: 'Both sides take the raw count: the first argument arrives already '
        + 'grouped and cannot be counted with.',
    },
  },
});
