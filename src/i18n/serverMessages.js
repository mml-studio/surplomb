/**
 * Server errors, in the reader's language.
 *
 * The server (`vite.config.js`) answers errors in French prose under `error`.
 * It does not know the reader's language and is not going to: no cookie, no
 * `Accept-Language` — a proxy that varied its answers by language would need
 * to vary its cache by it too. Instead each error gains a stable `code`
 * (`'rate-limited'`, `'upstream-timeout'`…) and the CLIENT picks the words:
 *
 *     const payload = await response.json();
 *     status.textContent = serverMessage(payload);
 *
 * An unknown code, or a payload with none, falls back to `payload.error` as
 * the server wrote it — so a client that ships before the server's codes do, or
 * a server that ships a new code first, never shows an empty line.
 *
 * The codes and their words live in `serverMessages.i18n.js`. A message may be
 * a function; it receives the payload's `params` object (or the payload).
 *
 * @module i18n/serverMessages
 */

import serverMessages from './serverMessages.i18n.js';

/**
 * @param {{code?: string, error?: string, message?: string, params?: object}|null|undefined} payload
 * @param {{fallback?: string, catalog?: Function, locale?: string}} [options]
 * @returns {string}
 */
export function serverMessage(payload, { fallback = '', catalog = serverMessages, locale } = {}) {
  const code = typeof payload?.code === 'string' ? payload.code : null;
  if (code) {
    const resolved = catalog(locale);
    const message = Object.prototype.hasOwnProperty.call(resolved, code) ? resolved[code] : undefined;
    if (typeof message === 'function') return message(payload.params ?? payload);
    if (typeof message === 'string') return message;
  }
  const raw = payload?.error ?? payload?.message;
  return typeof raw === 'string' && raw ? raw : fallback;
}
