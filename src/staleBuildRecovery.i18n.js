/**
 * What a layer says when its code never arrived — see src/staleBuildRecovery.js.
 *
 * The sentence starts with the row's own label, so it names the line the
 * reader just clicked rather than an internal id. `src/ui.js` prints the same
 * manual sentence for a failed layer chunk, through `staleBuildNotice`.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  fallbackLabel: { fr: 'Cette couche', en: 'This layer', note: 'Used when the failing row has no label of its own.' },
  manual: {
    fr: (name) => `${name} : code non chargé — recharge la page`,
    en: (name) => `${name}: code not loaded — reload the page`,
    sample: ['Public cameras'],
    note: 'A deployment replaced the build under the open page, so the layer’s chunk is a 404. Only a reload cures it.',
  },
  reloading: {
    fr: (name) => `${name} : code non chargé — rechargement…`,
    en: (name) => `${name}: code not loaded — reloading…`,
    sample: ['Public cameras'],
  },
  reloadingIn: {
    fr: (name, seconds) => `${name} : code non chargé — rechargement dans ${seconds} s`,
    en: (name, seconds) => `${name}: code not loaded — reloading in ${seconds} s`,
    sample: ['Public cameras', 5],
  },
});
