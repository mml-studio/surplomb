/**
 * Strings of src/data/edfPowerPlants.js — the Power plants layer: the three
 * generation types, the plain words EDF's published codes are explained in,
 * the filter chips, the key, and the card a clicked site opens.
 *
 * WHAT STAYS FRENCH, because it is DATA and not prose:
 *
 *   - the keys of `kinds` and `fuels` below: they are the strings the three
 *     EDF files publish (`REP 900`, `Fil de l'eau`, `Multi-oxyde d’uranium et
 *     de plutonium`). They are looked up, never read.
 *   - site names, communes, départements, régions, and the operator's name.
 *   - a code this build has never seen: it is printed as published rather
 *     than guessed at, in both languages.
 *
 * ONE VOCABULARY DECISION, from docs/GLOSSARY.md: a hydro `Lac` is a
 * *reservoir* plant, `Éclusée` is *pondage* and `Fil de l'eau` is
 * *run-of-river* — the three regime words the trade uses in English, each
 * with the same one-clause explanation the French carries, because "pondage"
 * is no more self-evident to an English reader than "éclusée" is to a French
 * one.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { monthName, plural } from '../i18n/format.js';

/** `unité au charbon` → `unités au charbon`: the head word, and nothing else. */
function headWordPlural(phrase) {
  const [head, ...rest] = String(phrase).split(' ');
  if (!head || head.endsWith('s') || head.endsWith('x')) return String(phrase);
  return [`${head}s`, ...rest].join(' ');
}

/** `reactor of 900 MW` → `reactors of 900 MW`; `coal unit` → `coal units`. */
function englishNounPlural(phrase) {
  const text = String(phrase);
  const cut = text.indexOf(' of ');
  const head = cut === -1 ? text : text.slice(0, cut);
  const tail = cut === -1 ? '' : text.slice(cut);
  const words = head.split(' ');
  const last = words[words.length - 1];
  if (!last || last.endsWith('s') || last.endsWith('x')) return text;
  words[words.length - 1] = `${last}s`;
  return `${words.join(' ')}${tail}`;
}

/** A site published under two kinds is joined with ` + `; inflect the first. */
function inflectFirstPart(phrase, inflect) {
  const parts = String(phrase).split(' + ');
  parts[0] = inflect(parts[0]);
  return parts.join(' + ');
}

export default defineMessages({
  /**
   * The three generation types, in four registers: `label` keys the legend,
   * `subject` opens a card ("Nuclear power plant"), `chip` is the filter
   * button at 8 px, `blurb` is the legend's one line. `unitNoun` is the unit
   * of account a reader can picture — reactors, units, and nothing for hydro,
   * whose file publishes no count.
   */
  filieres: {
    nucleaire: {
      label: { fr: 'Nucléaire', en: 'Nuclear' },
      subject: { fr: 'Centrale nucléaire', en: 'Nuclear power plant' },
      chip: { fr: 'NUCLÉAIRE', en: 'NUCLEAR' },
      unitNoun: { fr: 'réacteur', en: 'reactor' },
      blurb: {
        fr: 'Réacteurs à eau pressurisée exploités par EDF',
        en: 'Pressurized-water reactors operated by EDF',
      },
    },
    hydraulique: {
      label: { fr: 'Hydraulique', en: 'Hydro' },
      subject: { fr: 'Centrale hydraulique', en: 'Hydro plant' },
      chip: { fr: 'HYDRAULIQUE', en: 'HYDRO' },
      // No `unitNoun`: the hydro file publishes no unit count, so nothing
      // here counts machines.
      blurb: {
        fr: 'Centrales EDF de plus de 100 MW, plus celles qui tiennent au moins 20 MW en réserve pour stabiliser le réseau',
        en: 'EDF plants above 100 MW, plus those holding at least 20 MW in reserve to stabilize the grid',
      },
    },
    thermique: {
      label: { fr: 'Thermique à flamme', en: 'Fossil-fired' },
      subject: { fr: 'Centrale thermique', en: 'Fossil-fired plant' },
      chip: { fr: 'THERMIQUE', en: 'FOSSIL' },
      unitNoun: { fr: 'unité', en: 'unit' },
      blurb: {
        fr: 'Charbon, gaz et fioul brûlés par EDF pour produire de l’électricité',
        en: 'Coal, gas and oil burned by EDF to generate electricity',
      },
    },
  },

  /** What a site is called when its file names no kind and no filière. */
  plant: { fr: 'Centrale', en: 'Power plant' },
  subject: { fr: 'Centrale électrique', en: 'Power plant' },

  /**
   * EDF's published codes, in words a reader who does not work in the
   * industry can act on. `short` rides on the globe beside a name, `long`
   * goes on the card, `chip` is the sub-category button, `blurb` is the
   * sentence a water REGIME needs and a machine does not.
   *
   * The megawatts inside a `long` are the reactor family's unit power, not
   * the site's, and they are formatted where the phrase is built.
   */
  kinds: {
    'REP 900': {
      short: { fr: 'réacteur', en: 'reactor' },
      long: {
        fr: (power) => `réacteur à eau pressurisée de ${power}`,
        en: (power) => `pressurized-water reactor of ${power}`,
        note: 'The power is the reactor family’s, not the site’s; the count on the same line is what keeps that honest.',
        sample: ['900 MW'],
      },
      chip: { fr: '900 MW', en: '900 MW' },
    },
    'REP 1300': {
      short: { fr: 'réacteur', en: 'reactor' },
      long: {
        fr: (power) => `réacteur à eau pressurisée de ${power}`,
        en: (power) => `pressurized-water reactor of ${power}`,
        sample: ['1,300 MW'],
      },
      chip: { fr: '1 300 MW', en: '1,300 MW' },
    },
    'REP 1450': {
      short: { fr: 'réacteur', en: 'reactor' },
      long: {
        fr: (power) => `réacteur à eau pressurisée de ${power}`,
        en: (power) => `pressurized-water reactor of ${power}`,
        sample: ['1,450 MW'],
      },
      chip: { fr: '1 450 MW', en: '1,450 MW' },
    },
    Charbon: {
      short: { fr: 'unité au charbon', en: 'coal unit' },
      long: { fr: 'unité au charbon', en: 'coal-fired unit' },
      chip: { fr: 'CHARBON', en: 'COAL' },
    },
    'Gaz naturel': {
      short: { fr: 'unité au gaz', en: 'gas unit' },
      long: { fr: 'unité au gaz naturel', en: 'natural-gas unit' },
      chip: { fr: 'GAZ', en: 'GAS' },
    },
    'Fioul Domestique': {
      short: { fr: 'unité au fioul', en: 'oil unit' },
      long: { fr: 'unité au fioul domestique', en: 'heating-oil unit' },
      chip: { fr: 'FIOUL', en: 'OIL' },
    },
    'Gaz naturel/Fioul Domestique': {
      short: { fr: 'unité gaz ou fioul', en: 'gas or oil unit' },
      long: { fr: 'unité au gaz naturel ou au fioul', en: 'natural-gas or oil unit' },
      chip: { fr: 'GAZ OU FIOUL', en: 'GAS OR OIL' },
    },
    Lac: {
      short: { fr: 'retenue de lac', en: 'reservoir' },
      long: { fr: 'retenue de lac', en: 'reservoir plant' },
      chip: { fr: 'LAC', en: 'RESERVOIR' },
      blurb: {
        fr: 'l’eau est stockée des mois et turbinée quand la demande grimpe',
        en: 'water is held for months and released when demand climbs',
      },
    },
    Eclusée: {
      short: { fr: 'éclusée', en: 'pondage' },
      long: { fr: 'éclusée', en: 'pondage plant' },
      chip: { fr: 'ÉCLUSÉE', en: 'PONDAGE' },
      blurb: {
        fr: 'sa retenue tient quelques heures à quelques jours de production',
        en: 'its pond holds a few hours to a few days of generation',
      },
    },
    "Fil de l'eau": {
      short: { fr: 'fil de l’eau', en: 'run-of-river' },
      long: { fr: 'au fil de l’eau', en: 'run-of-river plant' },
      chip: { fr: 'FIL DE L’EAU', en: 'RUN-OF-RIVER' },
      blurb: {
        fr: 'elle turbine le débit qui se présente, sans rien mettre en réserve',
        en: 'it turbines whatever flow arrives, holding nothing back',
      },
    },
    'Pompage pur': {
      short: { fr: 'pompage-turbinage', en: 'pumped storage' },
      long: { fr: 'pompage-turbinage', en: 'pumped-storage plant' },
      chip: { fr: 'POMPAGE PUR', en: 'PURE PUMPED' },
      blurb: {
        fr: 'elle remonte l’eau dans un lac haut aux heures creuses, et la turbine à la pointe',
        en: 'it pumps water back up to a high reservoir off-peak and turbines it at peak',
      },
    },
    'Pompage mixte': {
      short: { fr: 'pompage-turbinage mixte', en: 'mixed pumped storage' },
      long: { fr: 'pompage-turbinage mixte', en: 'mixed pumped-storage plant' },
      chip: { fr: 'POMPAGE MIXTE', en: 'MIXED PUMPED' },
      blurb: {
        fr: 'elle turbine l’eau qui lui arrive ET remonte de l’eau aux heures creuses',
        en: 'it turbines the water that reaches it AND pumps water back up off-peak',
      },
    },
    Marémotrice: {
      short: { fr: 'marémotrice', en: 'tidal' },
      long: { fr: 'usine marémotrice', en: 'tidal power station' },
      chip: { fr: 'MARÉMOTRICE', en: 'TIDAL' },
      blurb: {
        fr: 'elle turbine le va-et-vient de la marée',
        en: 'it turbines the tide running in and out',
      },
    },
  },

  /** The `technologie` column, where it says something the kind does not. */
  techs: {
    TAC: {
      fr: 'turbine à combustion — une machine de pointe, démarrée pour quelques heures',
      en: 'combustion turbine — a peaking machine, started for a few hours at a time',
    },
  },

  /** The `combustible` column, in words. Both spellings the files publish. */
  fuels: {
    'Uranium Enrichi': { fr: 'uranium enrichi', en: 'enriched uranium' },
    'Multi-oxyde d’uranium et de plutonium': {
      fr: 'MOX (uranium et plutonium recyclés)',
      en: 'MOX (recycled uranium and plutonium)',
    },
    "Multi-oxyde d'uranium et de plutonium": {
      fr: 'MOX (uranium et plutonium recyclés)',
      en: 'MOX (recycled uranium and plutonium)',
    },
  },

  /** The prefix that says which published column a card note comes from. */
  fuelPrefix: { fr: 'combustible : ', en: 'fuel: ' },

  /**
   * The plural of a plain phrase, each language by its own rule.
   *
   * French inflects the HEAD word — `unité au charbon` → `unités au charbon`,
   * `réacteur à eau pressurisée de 900 MW` → `réacteurs à eau pressurisée de
   * 900 MW` — which is exactly what this layer printed before the catalog.
   * English inflects the noun that carries the phrase: the word before ` of `
   * when there is one (`reactor of 900 MW` → `reactors of 900 MW`), the last
   * word otherwise (`coal unit` → `coal units`).
   *
   * A site published under two kinds arrives joined with ` + `; only the
   * first part is inflected, in both languages, as the French did.
   */
  pluralPhrase: {
    fr: (phrase) => inflectFirstPart(phrase, headWordPlural),
    en: (phrase) => inflectFirstPart(phrase, englishNounPlural),
    note: 'Called only when the published count is 2 or more.',
    sample: ['coal unit'],
  },

  /** The counted phrase: `6 réacteurs`, `2 coal units`. */
  counted: {
    fr: (count, phrase) => `${count} ${phrase}`,
    en: (count, phrase) => `${count} ${phrase}`,
    sample: ['6', 'reactors'],
  },
  /** A code this build has never seen keeps the publisher's own `N × CODE`. */
  countedRaw: {
    fr: (count, code) => `${count} × ${code}`,
    en: (count, code) => `${count} × ${code}`,
    sample: ['4', 'EPR2'],
  },

  /** The filter strip above the row. */
  chips: {
    all: { fr: 'TOUTES', en: 'ALL' },
    allTitle: {
      fr: (sites, power) => `Les ${sites} sites des trois filières — ${power} installés`,
      en: (sites, power) => `All ${sites} sites of the three generation types — ${power} installed`,
      sample: ['79', '78,000 MW'],
    },
    filiereActive: {
      fr: (label, sites, power) => `${label} — ${sites} sites, ${power}. Cliquer à nouveau pour revenir à la France entière`,
      en: (label, sites, power) => `${label} — ${sites} sites, ${power}. Click again to go back to the whole of France`,
      sample: ['Nuclear', '18', '61,370 MW'],
    },
    filiereIdle: {
      fr: (label, sites, power) => `Ne garder que ${label} — ${sites} sites, ${power}`,
      en: (label, sites, power) => `Keep only ${label} — ${sites} sites, ${power}`,
      note: 'French lowercases the generation type inside the sentence; English keeps it as written.',
      sample: ['hydro', '51', '15,000 MW'],
    },
    kindAll: { fr: 'TOUS', en: 'ALL' },
    kindAllTitle: {
      fr: (label) => `Toutes les sous-catégories — ${label}`,
      en: (label) => `Every sub-category — ${label}`,
      sample: ['hydro'],
    },
    kindTitle: {
      fr: (what, sites, power) => `${what} — ${sites} site${sites > 1 ? 's' : ''}, ${power}`,
      en: (what, sites, power) => `${what} — ${sites} ${plural(sites, 'site', 'sites', { locale: 'en' })}, ${power}`,
      sample: ['reservoir plant', 28, '9,000 MW'],
    },
    kindUnspecified: { fr: 'NON PRÉCISÉ', en: 'UNSPECIFIED' },
    kindUnspecifiedWhat: {
      fr: 'sous-catégorie non précisée par le fichier',
      en: 'sub-category the file does not state',
    },
  },

  /** The key: one line per generation type drawn. */
  legend: {
    blurb: {
      fr: (blurb, power, units) => `${blurb} — ${power} installés${units}`,
      en: (blurb, power, units) => `${blurb} — ${power} installed${units}`,
      sample: ['Pressurized-water reactors operated by EDF', '61,370 MW', ', 56 reactors'],
    },
    units: {
      fr: (count, noun) => `, ${count} ${noun}s`,
      en: (count, noun) => `, ${count} ${noun}s`,
      sample: ['56', 'reactor'],
    },
  },

  /**
   * An ISO day as each language writes it: `31/12/2025`, `Dec 31, 2025`. The
   * parts arrive as the file publishes them, zero-padded.
   */
  day: {
    fr: (year, month, day) => `${day}/${month}/${year}`,
    en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
    sample: ['2025', '12', '31'],
  },

  /** The card a clicked site opens, line by line. */
  card: {
    capacity: {
      fr: (power) => `⚡ ${power} installés : le maximum du site, pas ce qu’il produit à cet instant`,
      en: (power) => `⚡ ${power} installed: the site’s maximum, not what it is generating right now`,
      sample: ['5,460 MW'],
    },
    reserve: {
      fr: (power) => `↻ ${power} tenus en réserve pour stabiliser le réseau en quelques minutes`,
      en: (power) => `↻ ${power} held in reserve to stabilize the grid within minutes`,
      note: 'Secondary reserve: the site’s contracted contribution to frequency containment.',
      sample: ['40 MW'],
    },
    vintage: {
      fr: (fleet, day) => `# relevé EDF du parc ${fleet}, arrêté au ${day}`,
      en: (fleet, day) => `# EDF’s own record of its ${fleet} fleet, as of ${day}`,
      note: 'One date per file: the three EDF datasets are three editions.',
      sample: ['nuclear', 'Dec 31, 2025'],
    },
    operator: {
      fr: (name) => `⌁ exploitant : ${name}`,
      en: (name) => `⌁ operator: ${name}`,
      sample: ['CNR'],
    },
    commissionedBetween: {
      fr: (from, to) => `entre ${from} et ${to}`,
      en: (from, to) => `between ${from} and ${to}`,
      sample: ['1981', '1983'],
    },
    commissionedIn: {
      fr: (year) => `en ${year}`,
      en: (year) => `in ${year}`,
      sample: ['1977'],
    },
    commissionedPlant: {
      fr: (when) => `mise en service ${when}`,
      en: (when) => `commissioned ${when}`,
      note: 'Hydro: the file counts no machines, so the sentence is about the plant.',
      sample: ['in 1977'],
    },
    commissionedUnits: {
      fr: (count, noun, feminine, when) => `${count ? `${count} ` : ''}${noun}s raccordé${feminine ? 'e' : ''}s au réseau ${when}`,
      en: (count, noun, feminine, when) => `${count ? `${count} ` : ''}${noun}s connected to the grid ${when}`,
      note: 'French agrees the participle with its noun (unité is feminine, réacteur is not).',
      sample: ['6', 'reactor', false, 'between 1980 and 1985'],
    },
    commissionedUnit: {
      fr: (noun, feminine, when) => `${noun} raccordé${feminine ? 'e' : ''} au réseau ${when}`,
      en: (noun, feminine, when) => `${noun} connected to the grid ${when}`,
      sample: ['reactor', false, 'in 1977'],
    },
    /** The other register's figure for the same site, and why it differs. */
    rteUnits: {
      fr: (count) => `n’y compte que ${count > 1 ? `les ${count} groupes` : 'le groupe'} de 100 MW et plus`,
      en: (count) => `only counts ${count > 1 ? `its ${count} generating units` : 'its generating unit'} of 100 MW and above`,
      sample: [3],
    },
  },
});
