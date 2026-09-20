/**
 * Strings of `src/data/rnbPivot.js` — the national building register (RNB).
 *
 * ONE CATALOG, TWO READERS, AND ONLY ONE OF THEM HAS A LOCALE.
 * `projectRnbBuilding()` also runs on the server (`vite.config.js` imports it
 * for `/api/rnb`), and the server has no language by design. So the projection
 * keeps publishing the French label in `statusLabel` — the words it always
 * published, read straight off this catalog's definition — and the browser
 * labels the STATUS KEY at draw time with {@link rnbStatusLabel}.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The statuses the register publishes, and whether the building stands.
 *
 * FLAT, keyed by the register's own status: that is what `labelFor()` reads,
 * and what a card holds when it wants to say what a volume is.
 *
 * `constructed` is the whole of the Lyon sample; the others exist, and a card
 * that met one and printed nothing would be claiming the building is ordinary.
 */
export default defineMessages({
  constructed: { fr: 'construit', en: 'built' },
  notUsable: { fr: 'non exploitable', en: 'not usable' },
  demolished: { fr: 'démoli', en: 'demolished' },
  constructionProject: { fr: 'projet de construction', en: 'construction project' },
  canceledConstructionProject: {
    fr: 'projet de construction annulé',
    en: 'canceled construction project',
  },
  ongoingConstruction: { fr: 'construction en cours', en: 'under construction' },
  ongoingChange: { fr: 'modification en cours', en: 'being altered' },
  demolitionProject: { fr: 'projet de démolition', en: 'demolition project' },
});
