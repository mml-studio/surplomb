/**
 * Strings of src/data/franceEnergy.js — the electricity-mix layer: what a
 * région's prism says about itself, what a border arrow says, and the two
 * legend rows the layer kept.
 *
 * WHAT IS NOT HERE, on purpose:
 *
 *   - the generation types' own names are keyed by éCO2mix's `key` field
 *     (`nucleaire`, `thermique`…), never by the French label the feed carries.
 *     The server hands the browser both; the browser labels by key and the
 *     label is only a fallback for a filière RTE adds after this build.
 *   - région names: they are DATA published by éCO2mix (and the bundled table
 *     that fills its gaps), proper nouns in both languages.
 *   - the layer's name and source line, which belong to the registry
 *     (src/data/layerTaxonomy.i18n.js).
 *
 * See docs/i18n/CONVENTIONS.md and the Energy section of docs/GLOSSARY.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The three balance classes. `verb` is shouted on the map label next to the
   * megawatts, `label` heads the legend row, `blurb` is its one line.
   *
   * "Net exporter" rather than "surplus": the figure is a balance over an
   * instant, and a région that exports at 14:00 can import at 20:00.
   */
  balance: {
    exporter: {
      verb: { fr: 'EXPORTE', en: 'EXPORTS', note: 'On the map label, before the megawatts.' },
      label: { fr: 'Excédentaire', en: 'Net exporter' },
      blurb: {
        fr: 'Produit plus qu’elle ne consomme',
        en: 'Generates more than it consumes',
        note: 'The subject is a région; English keeps it implicit.',
      },
    },
    balanced: {
      verb: { fr: 'ÉQUILIBRÉE', en: 'BALANCED' },
      label: { fr: 'Équilibrée', en: 'Balanced' },
      blurb: {
        fr: 'Produit ce qu’elle consomme, à moins d’un mégawatt près',
        en: 'Generates what it consumes, to within a megawatt',
      },
    },
    importer: {
      verb: { fr: 'IMPORTE', en: 'IMPORTS' },
      label: { fr: 'Déficitaire', en: 'Net importer' },
      blurb: {
        fr: 'Consomme plus qu’elle ne produit',
        en: 'Consumes more than it generates',
      },
    },
  },

  /** The legend's two rows: the class, then what it does, in one word. */
  legend: {
    exporter: {
      fr: (label) => `${label} — exporte`,
      en: (label) => `${label} — exports`,
      sample: ['Net exporter'],
    },
    importer: {
      fr: (label) => `${label} — importe`,
      en: (label) => `${label} — imports`,
      sample: ['Net importer'],
    },
  },

  /** The map label over a région. */
  region: {
    balance: {
      fr: (name, verb, power) => `${name} · ${verb} ${power}`,
      en: (name, verb, power) => `${name} · ${verb} ${power}`,
      note: 'Name, the verb, then the megawatts. Same order in both languages.',
      sample: ['Île-de-France', 'EXPORTS', '6,478 MW'],
      keep: ['Île-de-France'],
    },
    unpublished: {
      fr: (name) => `${name} · SOLDE NON PUBLIÉ`,
      en: (name) => `${name} · BALANCE NOT PUBLISHED`,
      note: 'éCO2mix published no figure for this région this refresh — it is not a measured zero.',
      sample: ['Corse'],
      keep: ['Corse'],
    },
  },

  /**
   * The label riding on a border arrow. The direction is in words because an
   * arrowhead read at a shallow camera angle is not enough.
   *
   * French agrees the participle with the megawatts (`1 MW exporté`,
   * `2 537 MW exportés`) and keeps its own rule inside the message: an
   * unpublished figure takes the plural, as it did before this catalog.
   */
  border: {
    exported: {
      fr: (power, mw, market) => `${power} exporté${!Number.isFinite(mw) || mw >= 2 ? 's' : ''} vers ${market}`,
      en: (power, mw, market) => `${power} exported to ${market}`,
      sample: ['2,537 MW', 2537, 'Italy'],
    },
    imported: {
      fr: (power, mw, market) => `${power} importé${!Number.isFinite(mw) || mw >= 2 ? 's' : ''} depuis ${market}`,
      en: (power, mw, market) => `${power} imported from ${market}`,
      sample: ['750 MW', 750, 'Switzerland'],
    },
  },

  /**
   * The five market areas, keyed by éCO2mix's own `ech_comm_*` key.
   *
   * `angleterre` is the publisher's name for the British interconnection and
   * is translated as the publisher means it; Germany and Belgium share ONE
   * published field and therefore one entry.
   */
  markets: {
    angleterre: { fr: 'Angleterre', en: 'England' },
    espagne: { fr: 'Espagne', en: 'Spain' },
    italie: { fr: 'Italie', en: 'Italy' },
    suisse: { fr: 'Suisse', en: 'Switzerland' },
    allemagne_belgique: { fr: 'Allemagne + Belgique', en: 'Germany + Belgium' },
  },

  /**
   * Generation types, keyed by the éCO2mix field name the feed publishes.
   * `thermique` is the regional roll-up of gas + coal + oil, which is why it
   * reads "fossil-fired" and not "thermal".
   */
  filieres: {
    nucleaire: { fr: 'Nucléaire', en: 'Nuclear' },
    hydraulique: { fr: 'Hydraulique', en: 'Hydro' },
    eolien: { fr: 'Éolien', en: 'Wind' },
    solaire: { fr: 'Solaire', en: 'Solar' },
    bioenergies: { fr: 'Bioénergies', en: 'Bioenergy' },
    gaz: { fr: 'Gaz', en: 'Gas' },
    charbon: { fr: 'Charbon', en: 'Coal' },
    fioul: { fr: 'Fioul', en: 'Oil' },
    thermique: { fr: 'Thermique fossile', en: 'Fossil-fired' },
  },

  /** Row status when the bundled département outlines cannot be read. */
  errors: {
    shapes: {
      fr: 'Département polygons unavailable',
      en: 'Department polygons unavailable',
      note: 'The French text is what the row printed before the switch; it was never translated.',
    },
  },
});
