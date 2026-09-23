/**
 * Strings of src/data/layerPanelRail.js — the desktop's category rail and the
 * list that opens beside it. The group names themselves are not here: they are
 * the taxonomy's (`layerTaxonomy.i18n.js`, `categories` and `categoriesShort`),
 * and the « 2/10 ACTIVES » tally is the manager's (`manager.i18n.js`).
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun } from '../i18n/format.js';

export default defineMessages({
  railAria: { fr: 'Groupes de couches', en: 'Layer groups' },

  search: {
    label: { fr: 'Chercher', en: 'Search', note: 'The rail entry that opens the list on its search field. One short word under an icon.' },
    title: { fr: 'Rechercher une couche', en: 'Search the layers' },
    placeholder: { fr: 'Rechercher une couche…', en: 'Search layers…' },
    resultsTitle: { fr: 'RÉSULTATS', en: 'RESULTS', note: 'Heads the list while a search is typed, in place of the group name.' },
    resultsCount: {
      fr: (n) => countNoun(n, 'COUCHE', 'COUCHES'),
      en: (n) => countNoun(n, 'LAYER', 'LAYERS'),
      sample: [4],
    },
    noMatch: {
      fr: (query) => `Aucune couche ne correspond à « ${query} ».`,
      en: (query) => `No layer matches “${query}”.`,
      sample: ['radar'],
    },
  },

  drawer: {
    pin: {
      fr: 'Garder la liste ouverte',
      en: 'Keep the list open',
      note: 'Toggle, off. Pressed, a click on the globe no longer closes the list.',
    },
    unpin: {
      fr: 'Ne plus garder la liste ouverte',
      en: 'Stop keeping the list open',
      note: 'The same toggle, on.',
    },
    close: { fr: 'Fermer la liste', en: 'Close the list' },
  },
});
