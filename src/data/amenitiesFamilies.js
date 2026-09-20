/**
 * @module data/amenitiesFamilies
 *
 * The family names of `amenities-fr`, and nothing else.
 *
 * Extracted from `amenitiesFeed.js` for one measured reason: the address
 * radiography prints "Supermarché, supérette" beside a distance, and importing
 * that one string from the feed module pulled its **166 889 bytes** of BPE and
 * FINESS parsing into `fiche.html` — a text page whose own bundle is 21 kB.
 * The labels are a vocabulary; the parsing is a program, and a document should
 * not have to load the second to say the first.
 *
 * `amenitiesFeed.js` re-exports both readers, so every existing importer is
 * untouched and there is still exactly one definition.
 *
 * The words themselves are in `amenitiesFamilies.i18n.js`, in both languages,
 * and are read when a card is drawn — never when this module loads.
 */

import { labelFor } from '../i18n/messages.js';
import { AMENITY_FAMILY_LABELS, AMENITY_FAMILY_PLURALS } from './amenitiesFamilies.i18n.js';

export { AMENITY_FAMILY_LABELS, AMENITY_FAMILY_PLURALS };

/**
 * The family as a heading: `Supermarché, supérette` / `Supermarket,
 * convenience store`.
 * @param {string} family A key of `AMENITY_FAMILIES`.
 * @returns {string} The family key itself when it is not one we name.
 */
export function amenityFamilyLabel(family) {
  return labelFor(AMENITY_FAMILY_LABELS, family);
}

/**
 * The head-word a count leans on: `commerces alimentaires` / `food stores`.
 * @param {string} family A key of `AMENITY_FAMILIES`.
 * @returns {string} The family key itself when it is not one we name.
 */
export function amenityFamilyPlural(family) {
  return labelFor(AMENITY_FAMILY_PLURALS, family);
}
