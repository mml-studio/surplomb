/**
 * Words for the server's error codes — see src/i18n/serverMessages.js.
 *
 * Keyed by the `code` the server sends. `fr` is the French the server writes
 * under `error` today, so both languages come from here once a code exists:
 *
 *     'upstream-timeout': {
 *       fr: 'La source ne répond pas. Réessayez dans un instant.',
 *       en: 'The source is not answering. Try again in a moment.',
 *     },
 *
 * Empty until the server batch gives its errors codes.
 */
import { defineMessages } from './messages.js';

export default defineMessages({});
