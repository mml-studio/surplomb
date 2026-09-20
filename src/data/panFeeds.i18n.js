/**
 * Display strings of `src/data/panFeeds.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Three stand-ins, and they are DATA before they are words. `panFeeds.js` runs
 * in the index build script and in the proxy, both without a locale, so the
 * French string is what is written into `datasets/pan-static-index.json` and
 * into every payload the proxy serves. Translating it there would change a
 * committed file and a cached answer; translating it HERE, with `labelFor`,
 * changes only what a reader sees.
 *
 * `labelFor` hands back anything it does not know, which is the whole point:
 * a real licence name (`Licence Ouverte 2.0`, `ODbL 1.0`) is a proper noun,
 * and a real network name is whatever the operator painted on the bus.
 */
import { defineMessages } from '../i18n/messages.js';

export const PAN_PAYLOAD_LABELS = defineMessages({
  'Licence non précisée': { fr: 'Licence non précisée', en: 'License not specified' },
  'Autre licence ouverte': { fr: 'Autre licence ouverte', en: 'Other open license' },
  'Réseau sans nom': { fr: 'Réseau sans nom', en: 'Unnamed network' },
});

export default PAN_PAYLOAD_LABELS;
