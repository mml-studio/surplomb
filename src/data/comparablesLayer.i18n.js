/**
 * Strings of `src/data/comparablesLayer.js` — the dossier drawn on the globe.
 *
 * THE KEY IS WHERE THE TWO SAMPLES ARE KEPT APART. A recorded sale is a price
 * that was PAID and a listing is a price that is being ASKED; they get two
 * colors, two glyphs and two sentences, and the blurb of each says which
 * instrument it came from — the register, or the agent's own typing.
 *
 * The cards themselves are composed in `comparablesDossier.js`; this file
 * holds the key, the fallback title of the property under study, and the line
 * under the layer's toggle.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun } from '../i18n/format.js';

export default defineMessages({
  subject: { fr: 'Bien étudié', en: 'Property studied' },

  legend: {
    sales: { fr: 'Ventes actées (DVF)', en: 'Recorded sales (DVF)' },
    salesMedian: {
      fr: (median, sample) => `${median} €/m² médian sur ${sample}.`,
      en: (median, sample) => `Median €${median}/m² over ${sample}.`,
      sample: ['3,200', '8 comparables'],
    },
    salesBlurb: {
      fr: 'Mutations retenues dans le dossier — prix observés, source DGFiP.',
      en: 'Transactions shortlisted in the file — observed prices, source DGFiP.',
    },
    listings: { fr: 'Annonces saisies', en: 'Listings entered' },
    listingsMedian: {
      fr: (median, sample) => `${median} €/m² médian demandé sur ${sample}.`,
      en: (median, sample) => `Median asking €${median}/m² over ${sample}.`,
      sample: ['3,500', '4 comparables'],
    },
    listingsBlurb: {
      fr: 'Annonces relevées à la main — prix demandés, jamais collectés.',
      en: 'Listings recorded by hand — asking prices, never scraped.',
    },
    on: {
      fr: (n) => countNoun(n, 'comparable', 'comparables'),
      en: (n) => countNoun(n, 'comparable', 'comparables'),
      sample: [8],
    },
  },

  row: {
    feedSource: {
      fr: 'DGFiP DVF (candidats) · dossier local, jamais transmis',
      en: 'DGFiP DVF (candidates) · local file, never transmitted',
      note: 'The dossier lives in this browser and leaves it only as a file the '
        + 'agent exports; the row says so.',
    },
    dormant: {
      fr: (km) => `Zoome sous ${km} km, ou pose le bien pour épingler le dossier`,
      en: (km) => `Zoom in below ${km} km, or place the property to pin the file`,
      sample: [12],
    },
    noSubject: {
      fr: 'Aucun bien posé — ouvre le dossier pour en poser un',
      en: 'No property placed — open the file to place one',
    },
    dvfSilent: {
      fr: 'DVF muet — le dossier est intact, la liste de candidats est vide',
      en: 'DVF silent — the file is intact, the candidate list is empty',
    },
  },
});
