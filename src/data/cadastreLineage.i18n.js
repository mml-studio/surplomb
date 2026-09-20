/**
 * Strings of `src/data/cadastreLineage.js` — how a permit was placed on a
 * parcel that has since been divided.
 *
 * THIS MODULE RUNS ON THE SERVER. `vite.config.js` imports it for `/api/ads-fr`,
 * and a server has no locale by design (docs/i18n/CONVENTIONS.md). So
 * `ADS_LINEAGE_BASIS` keeps publishing the French label — read straight off
 * this catalog's definition, so the two cannot drift — and the browser that
 * draws the card calls `adsLineageBasisLabel(basis)` with the stable key.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * How a child parcel was chosen, worst to best, and what each licenses a
 * reader to believe. Carried to the card so an INFERENCE never reads like a
 * record.
 */
export default defineMessages({
  parent: { fr: 'emprise divisée depuis', en: 'footprint divided since' },
  sole: { fr: 'lot unique après division', en: 'only lot after the division' },
  built: { fr: 'seul lot construit depuis', en: 'only lot built on since' },
  numbered: { fr: 'lot identifié par son numéro', en: 'lot identified by its number' },
});
