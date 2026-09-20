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
 * A code almost always rides on a FAILED response, and a client that bails on
 * `!response.ok` never reads the body that carries it. `serverFailureMessage`
 * is that branch, done once:
 *
 *     if (!response.ok) throw new Error(await serverFailureMessage(response));
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

/**
 * The message behind a FAILED response — the body read before the status.
 *
 * Every client in this repository was written `if (!response.ok) throw new
 * Error(\`HTTP ${response.status}\`)`, and every code the server sends rides on
 * a 4xx or a 5xx. So the codes were arriving at a branch that had already
 * decided what to say, and the reader got `HTTP 503` — not the French the
 * error field holds, and certainly not English. Reading the body first is the
 * whole wiring, and it is one line per call site because it lives here.
 *
 * Defensive about `json` on purpose: a test double for a failed fetch is
 * usually `{ ok: false, status: 503 }` with no body at all, and a helper that
 * threw on those would have every outage test rewritten around it.
 *
 * @param {{status?: number, json?: () => Promise<unknown>}|null} response
 * @param {{fallback?: string, catalog?: Function, locale?: string}} [options]
 *   `fallback` defaults to the `HTTP <status>` line these call sites printed.
 * @returns {Promise<string>}
 */
export async function serverFailureMessage(response, { fallback, ...options } = {}) {
  const body = typeof response?.json === 'function'
    ? await response.json().catch(() => null)
    : null;
  return serverMessage(body, {
    ...options,
    fallback: fallback ?? `HTTP ${response?.status ?? '???'}`,
  });
}
