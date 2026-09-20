/**
 * Strings of src/photorealTileset.js — see docs/i18n/CONVENTIONS.md.
 *
 * One sentence, in the failure line the map-source chip shows. The rest of
 * that line is the provider's own error text, which nothing here rewrites:
 * `Google key` and `Cesium ion` are the two doors, by name, so a build that
 * holds both credentials says which one is broken.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  noTileset: {
    fr: 'aucun jeu de tuiles renvoyé',
    en: 'no tileset returned',
    note: 'The door answered without throwing and without a tileset. Lower case: '
      + 'it is appended after “Google key: ”.',
  },
});
