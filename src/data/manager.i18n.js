/**
 * Strings of src/data/manager.js — the Data Layers panel's own words: the
 * status a row's button prints, the strip of lit rows above the list, the meta
 * line under each row, and the extent a map key states.
 *
 * THE STATUS WORDS. `ON` / `LOADING` / `OFF` were English on a French page
 * because they came from upstream and read as console vocabulary. The glossary
 * settles them (ACTIF / CHARGEMENT / ÉTEINT), and nothing reads them as text
 * any more: `_syncToggleButton` writes the state id on `data-feed-state`, and
 * that attribute — not the word — is what the harnesses assert on.
 *
 * The four fault states below (DEGRADED, STALE, FALLBACK, UNAVAILABLE) and
 * UNCERTAIN are deliberately the SAME in both languages for now. The glossary
 * fixes three status words and not seven; translating the other four would be
 * this batch inventing product vocabulary, and their French wording is worth
 * one decision rather than four guesses. They are in the catalog so that
 * decision is a line each, not a hunt through the panel.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** What a row's toggle button says. Keyed by `layerFeedState()`'s verdict. */
  feedState: {
    nominal: { fr: 'ACTIF', en: 'ON', note: 'The layer is on and its feed is healthy.' },
    loading: { fr: 'CHARGEMENT', en: 'LOADING' },
    degraded: { fr: 'DEGRADED', en: 'DEGRADED', note: 'Awaiting a French word: see the file header.' },
    stale: { fr: 'STALE', en: 'STALE', note: 'Awaiting a French word: see the file header.' },
    fallback: { fr: 'FALLBACK', en: 'FALLBACK', note: 'Awaiting a French word: see the file header.' },
    unavailable: { fr: 'UNAVAILABLE', en: 'UNAVAILABLE', note: 'Awaiting a French word: see the file header.' },
    off: { fr: 'ÉTEINT', en: 'OFF', note: 'The row is dark — nothing is loaded.' },
    uncertain: {
      fr: 'UNCERTAIN',
      en: 'UNCERTAIN',
      note: 'The manager could not settle whether the layer is visible. Awaiting a French word.',
    },
  },

  /** The strip of lit rows, pinned above the list. */
  strip: {
    ariaLabel: { fr: 'Couches allumées', en: 'Layers switched on' },
    heading: { fr: 'ACTIVES', en: 'ON' },
    clear: { fr: 'TOUT ÉTEINDRE', en: 'TURN EVERYTHING OFF' },
    clearTitle: {
      fr: 'Éteindre toutes les couches allumées',
      en: 'Turn off every layer that is on',
    },
    chipTitle: {
      fr: (name) => `Éteindre — ${name}`,
      en: (name) => `Turn off — ${name}`,
      sample: ['Road traffic'],
    },
    chipAriaLabel: {
      fr: (name) => `Éteindre ${name}`,
      en: (name) => `Turn off ${name}`,
      sample: ['Road traffic'],
    },
  },

  /** Group headers and row furniture. */
  panel: {
    featured: { fr: 'À LA UNE', en: 'FEATURED', note: 'The synthetic group the phone shell puts on top.' },
    categoryCount: {
      fr: (on, total) => `${on}/${total} ACTIVES`,
      en: (on, total) => `${on}/${total} ON`,
      note: 'How many rows of a group are lit. Feminine plural in French: ce sont des couches.',
      sample: [1, 4],
    },
    coverageTitle: {
      fr: (where) => `Couverture : ${where}`,
      en: (where) => `Coverage: ${where}`,
      sample: ['Paris'],
    },
  },

  /** The line under a row: source, freshness, and what a dark row still holds. */
  meta: {
    closeRange: {
      fr: 'vue rapprochée',
      en: 'close-up view',
      note: 'Warns, while the row is OFF, that this layer draws nothing from a wide camera.',
    },
    loading: { fr: 'chargement…', en: 'loading…' },
    frozenSnapshot: {
      fr: 'instantané figé',
      en: 'fixed snapshot',
      note: 'A `static` layer: the pack is a file in the repository, so its age is not freshness.',
    },
    never: { fr: 'jamais', en: 'never', note: 'No reading yet.' },
    streamPrefix: { fr: 'flux · ', en: 'stream · ', note: 'Prefixes the age of a `live` layer.' },
    justNow: { fr: 'à l’instant', en: 'just now' },
    retryIn: {
      fr: (seconds) => ` · nouvelle tentative dans ${seconds} s`,
      en: (seconds) => ` · retrying in ${seconds} s`,
      sample: ['24'],
    },
    reconciliation: {
      fr: 'lifecycle state requires reconciliation',
      en: 'lifecycle state requires reconciliation',
      note: 'Operator wording, same in both languages: it names an internal state a reader reports.',
    },
  },

  /** What a map key says about its own extent. */
  legendScope: {
    here: {
      fr: (count) => ` · ${count} ici`,
      en: (count) => ` · ${count} here`,
      note: 'How many of the class are in the current view. The count arrives formatted.',
      sample: ['84'],
    },
    elsewhereNamed: {
      fr: (where) => ` · ${where}, hors de cette vue`,
      en: (where) => ` · ${where}, outside this view`,
      note: 'The class exists, but all of it is somewhere the camera is not.',
      sample: ['Lyon'],
    },
    elsewhere: { fr: ' · hors de cette vue', en: ' · outside this view' },
  },

  /** The card a layer prints in its key block for the object the reader selected. */
  legendSelection: {
    close: { fr: 'Fermer la fiche', en: 'Close the card' },
  },

  withheld: {
    fr: (name) => `« ${name} » n’est pas disponible sur ce site : la licence de ses données exclut l’usage commercial.`,
    en: (name) => `“${name}” is not available on this site: its data licence excludes commercial use.`,
    note: 'Toast when a share link, a scene or the voice agent asks for a layer this deployment withholds '
      + '(GEV_NONCOMMERCIAL_SOURCES=off — today the TeleGeography submarine cables). The name arrives in the page language.',
    sample: ['Submarine cables'],
  },

  paused: {
    fr: (name) => `« ${name} » est désactivée dans cette version de Surplomb.`,
    en: (name) => `“${name}” is switched off in this version of Surplomb.`,
    note: 'Toast when a share link, a scene or the voice agent asks for a layer the app has set aside '
      + '(today « Fiche implantation »). The name arrives in the page language.',
    sample: ['Site report'],
  },
});
