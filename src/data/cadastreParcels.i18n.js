/**
 * Strings of `src/data/cadastreParcels.js` — the three lines the selected
 * parcel's card owns. Everything else it prints comes from
 * `cadastreFeed.i18n.js` (the areas, the sheet, the tolerance) or from
 * `cadastreParcelDetail.i18n.js` (the address, the buildings).
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  sectionPrefix: {
    fr: (prefix) => `Préfixe de section ${prefix}`,
    en: (prefix) => `Section prefix ${prefix}`,
    note: 'Printed only when it is not the `000` most of France carries.',
    sample: ['802'],
  },
  /**
   * The longest dimension, folded onto the drawn-area line rather than given
   * a row of its own: it qualifies the surface beside it.
   */
  spanLong: {
    fr: (distance) => `${distance} de long`,
    en: (distance) => `${distance} long`,
    sample: ['48 m'],
  },
  /**
   * The sentence the whole layer exists to carry. In France a property limit
   * is fixed by a *bornage* — a géomètre-expert's survey under article 646 of
   * the Code civil — and by nothing else; the cadastre is a tax document.
   */
  fiscalDocument: {
    fr: 'Document fiscal — la limite de propriété se fixe par bornage',
    en: 'A fiscal document — a property boundary is fixed by a surveyor’s boundary marking',
  },
});
