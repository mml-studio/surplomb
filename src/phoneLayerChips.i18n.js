/**
 * Strings of src/phoneLayerChips.js — see docs/i18n/CONVENTIONS.md.
 *
 * The chip labels themselves live in `phoneSheetLayout.i18n.js`, beside the
 * table that maps a layer id to one.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  toggleTitle: {
    fr: (verb, layer) => `${verb} — ${layer}`,
    en: (verb, layer) => `${verb} — ${layer}`,
    note: 'Tooltip of a layer chip: the verb pressing it performs, then the '
      + 'layer’s full row title, which the chip itself truncates.',
    sample: ['Turn off', 'Live flights'],
  },
  turnOff: { fr: 'Éteindre', en: 'Turn off', note: 'The chip is lit; pressing it darkens the layer.' },
  turnOn: { fr: 'Allumer', en: 'Turn on' },
  allLayers: { fr: 'Toutes les couches', en: 'All layers', note: 'The last chip of the row: the door to the full list.' },
  allLayersTitle: { fr: 'Ouvrir la liste des couches', en: 'Open the layer list' },
});
