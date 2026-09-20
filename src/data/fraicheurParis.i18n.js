/**
 * Strings of `src/data/fraicheurParis.js` — Cool islands (Paris) on the globe.
 *
 * The cards and the register vocabulary live next door in
 * `fraicheurFeed.i18n.js` and `fraicheurTrees.i18n.js`; what is here is the
 * layer's own surface — the five register chips, the fountain key, the
 * heatwave row, and the two sentences that say a refresh failed.
 *
 * ── THE HEATWAVE ROW IS AN ARGUMENT, AND IT SURVIVES ────────────────────────
 *
 * Its blurb quotes the register against itself: of the green spaces that
 * declare a heatwave opening, some have NO canopy measured above 8 m at all,
 * and their median index is 0.0280 against 0.3197 for the register as a
 * whole. Those four numbers are what the row is for; the English carries all
 * four, with the decimal point the glossary fixes.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/** The three fountain states, keyed by state id. */
export const FRAICHEUR_FOUNTAIN_STATE_WORDS = defineMessages({
  'en-service': {
    label: { fr: 'Fontaine en service', en: 'Fountain in service' },
    blurb: {
      fr: '1 238 des 1 323 fontaines portent dispo = « OUI ». 72 sont brumisantes, '
        + 'et elles ne sont PAS parmi les 87 brumisateurs de l’autre registre.',
      en: '1,238 of the 1,323 fountains carry dispo = “OUI”. 72 of them mist, '
        + 'and they are NOT among the 87 misters in the other register.',
      keep: ['dispo', 'OUI'],
    },
  },
  'hors-service': {
    label: { fr: 'Fontaine hors service', en: 'Fountain out of service' },
    blurb: {
      fr: '85 fontaines portent dispo = « NON », avec un motif et une fenêtre '
        + 'd’indisponibilité. 10 d’entre elles ont dépassé leur propre date de fin.',
      en: '85 fountains carry dispo = “NON”, with a reason and an outage window. '
        + '10 of them are past their own end date.',
      keep: ['dispo', 'NON'],
    },
  },
  'non-publiee': {
    label: { fr: 'Disponibilité non publiée', en: 'Availability not published' },
    blurb: {
      fr: 'dispo absent. Aucune ligne du relevé du 2026-09-02 n’est dans cet état — '
        + 'la bande existe parce que le champ est du texte, pas un booléen.',
      en: 'dispo missing. No row of the 2026-09-02 snapshot is in this state — '
        + 'the band exists because the field is text, not a boolean.',
      keep: ['dispo'],
    },
  },
});

/**
 * The five register chips.
 *
 * All-caps in both languages, as every chip on this globe is, and short
 * enough to sit in a row: `HERITAGE` and not `REMARKABLE TREES`, which the
 * legend row beside it already says in full.
 */
export const FRAICHEUR_REGISTER_CHIPS = defineMessages({
  spaces: { fr: 'PARCS', en: 'PARKS' },
  equipment: { fr: 'REFUGES', en: 'REFUGES' },
  fountains: { fr: 'FONTAINES', en: 'FOUNTAINS' },
  trees: { fr: 'ARBRES', en: 'TREES' },
  remarkable: { fr: 'REMARQUABLES', en: 'HERITAGE' },
});

export default defineMessages({
  /** The hover title of one register chip. */
  chip: {
    counted: {
      fr: (chip, count, plainCount) => `${chip} — ${count} objets`,
      en: (chip, count, plainCount) => `${chip} — ${count} `
        + `${plural(plainCount, 'object', 'objects')}`,
      sample: ['PARKS', '984', 984],
    },
    countedHidden: {
      fr: (chip, count, plainCount) => `${chip} — ${count} objets (masqués)`,
      en: (chip, count, plainCount) => `${chip} — ${count} `
        + `${plural(plainCount, 'object', 'objects')} (hidden)`,
      sample: ['PARKS', '984', 984],
    },
    on: {
      fr: (chip) => `${chip}`,
      en: (chip) => `${chip}`,
      sample: ['PARKS'],
    },
    hidden: {
      fr: (chip) => `${chip} — masqués`,
      en: (chip) => `${chip} — hidden`,
      sample: ['TREES'],
    },
  },

  /** The provenance footer under a card. Four registers, three publishers. */
  footer: {
    city: {
      fr: 'Ville de Paris — ODbL',
      en: 'Ville de Paris — ODbL',
      keep: ['Ville de Paris', 'ODbL'],
      note: 'Two proper nouns and a licence name. Identical in both languages.',
    },
    space: {
      fr: 'Ville de Paris — ODbL · canopée : relevé 2024',
      en: 'Ville de Paris — ODbL · canopy: 2024 survey',
    },
    fountain: {
      fr: 'Eau de Paris — ODbL',
      en: 'Eau de Paris — ODbL',
      keep: ['Eau de Paris', 'ODbL'],
      note: 'The fountains are NOT the Ville de Paris: merging the two credits '
        + 'would drop an attribution the licence requires.',
    },
    tree: {
      fr: 'Ville de Paris, Direction des Espaces Verts — ODbL',
      en: 'Ville de Paris, Direction des Espaces Verts — ODbL',
      keep: ['Ville de Paris', 'Direction des Espaces Verts', 'ODbL'],
      note: 'A department’s own name. Not translated.',
    },
    clock: {
      fr: (day, time) => `Heure de Paris : ${day} ${time}`,
      en: (day, time) => `Paris time: ${day} ${time}`,
      sample: ['Tuesday', '15:20'],
      note: 'Named because every hour on this layer is Paris local time, '
        + 'whoever is reading and wherever they are.',
    },
  },

  /** The DETECT callout, when the object has no published name. */
  detect: {
    space: { fr: 'Espace vert frais', en: 'Cool green space' },
    equipment: { fr: 'Îlot de fraîcheur', en: 'Cool island' },
    tree: { fr: 'Arbre remarquable', en: 'Heritage tree' },
    fountain: { fr: 'Fontaine', en: 'Drinking fountain' },
  },

  /** A refresh that failed. The pack already on screen keeps drawing. */
  errors: {
    refresh: {
      fr: 'rafraîchissement des îlots de fraîcheur indisponible',
      en: 'cool islands refresh unavailable',
      note: 'An hour-old pack still describes the same 984 parks: the layer '
        + 'keeps drawing it and says the refresh failed rather than blanking '
        + 'a city.',
    },
    unavailable: {
      fr: 'îlots de fraîcheur de Paris indisponibles',
      en: 'Paris cool islands unavailable',
    },
    trees: {
      fr: ' · arbres indisponibles pour cette vue',
      en: ' · trees unavailable for this view',
      note: 'A failed tree box is not a failed layer — the refuges are still '
        + 'on screen — but it must not be silent either.',
    },
  },

  /** The green-space half of the key. */
  legend: {
    heatwave: { fr: 'Ouvert en canicule', en: 'Open during a heatwave' },
    heatwaveBlurb: {
      fr: (declared, spaces, allDay, noCanopy) => `${declared} des ${spaces} espaces verts `
        + `frais déclarent une ouverture canicule, dont ${allDay} ouverts 24 h/24. `
        + `${noCanopy} d’entre eux n’ont AUCUNE canopée mesurée au-dessus de 8 m — `
        + 'leur médiane est à 0,0280 contre 0,3197 sur l’ensemble du registre.',
      en: (declared, spaces, allDay, noCanopy) => `${declared} of the ${spaces} cool green `
        + `spaces declare a heatwave opening, of which ${allDay} are open around the clock. `
        + `${noCanopy} of them have NO canopy measured above 8 m — `
        + 'their median is 0.0280 against 0.3197 across the whole register.',
      sample: ['23', '984', '9', '11'],
      note: 'The two medians are the register’s own index, written with the '
        + 'decimal point the glossary fixes. The French keeps its comma.',
    },
    unmeasured: {
      fr: (count, plainCount) => `${count} espace${plainCount > 1 ? 's' : ''} sans indice `
        + `de canopée publié, tracé${plainCount > 1 ? 's' : ''} en gris — `
        + 'la couleur réservée dans cette couche à « le registre ne l’a pas mesuré ».',
      en: (count, plainCount) => `${count} ${plural(plainCount, 'space', 'spaces')} with no `
        + 'published canopy index, drawn in grey — the colour reserved in this layer '
        + 'for “the register did not measure it”.',
      sample: ['1', 1],
    },
  },
});
