/**
 * English for the static markup of `index.html` — see src/i18n/markup.js.
 *
 * One entry per `data-i18n*` key used in the HTML. `fr` is the French the HTML
 * carries, whitespace collapsed; `markup.test.mjs` fails when the two drift.
 * Group keys by the part of the page they belong to (`loader.*`, `search.*`,
 * `firstRun.*`), and give a `note` wherever the English needs context the key
 * does not give — a button label out of context is the hardest string there is
 * to translate.
 *
 *     loader: {
 *       status: { fr: 'Initialisation du globe…', en: 'Starting the globe…' },
 *     },
 *
 * Empty until the shell batch tags `index.html`.
 */
import { defineMessages } from './messages.js';

export default defineMessages({});
