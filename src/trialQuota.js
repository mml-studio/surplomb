/**
 * @module trialQuota
 * @description Per-browser trial of the keyed comfort routes, carried by a
 * signed cookie. SERVER-ONLY: loaded by `vite.config.js`, never by the page.
 *
 * WHAT IT IS FOR. The hosted origin keeps the globe and every keyless layer
 * open without limit — a cold boot spends nothing, and that is what proves the
 * product. What costs a key (the HUD summary, Google nearby places, voice) is
 * the comfort, and on a public page it is shared by everybody. This module
 * gives each browser a fixed number of tries at it, then answers with a
 * refusal the page turns into the waitlist card.
 *
 * WHY A COOKIE AND NOT THE ADDRESS. `clientKeyFor` only knows the IP: an
 * office or a mobile carrier puts hundreds of visitors behind one, and the
 * first five of them would empty the quota for all the others. A VPN resets
 * it anyway. A cookie follows the browser, which is the unit the decision was
 * written for (2026-09-15: « 5 essais par navigateur »).
 *
 * WHAT IT IS NOT. A spending bound. A cleared cookie, a private window, or a
 * script that never sends one starts again at zero — deliberately accepted.
 * The bill is bounded by the global `GEV_RATELIMIT_*_GLOBAL_PER_MIN` caps and
 * by the provider-side limits; this module is fairness between visitors.
 *
 * STATELESS BY DESIGN. The count lives in the cookie, signed with HMAC-SHA256,
 * so nothing is kept in memory and a restart forgets nobody. The price of
 * that is replay (a browser can keep sending its first cookie); it is the same
 * price as clearing cookies, which is already paid.
 *
 * OFF BY DEFAULT. With `GEV_TRIAL_LIMIT` unset, every function here is a
 * no-op: a clone running on its own keys owes nobody a waitlist.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TRIAL_COOKIE = 'gev_trial';
const TOKEN_VERSION = 'v1';
/** Chrome caps a cookie's lifetime at 400 days; asking for more is ignored. */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 16;
const BUTTONDOWN_USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Read the trial settings from the environment. Called per request by the
 * server, because `.env` reaches `process.env` after `vite.config.js` loads.
 *
 * @param {Record<string, string|undefined>} env
 * @param {() => string} [makeSecret] - Fallback secret when none is set.
 * @returns {{
 *   enabled: boolean,
 *   limit: number,
 *   secret: string|null,
 *   voice: 'waitlist'|'trial',
 *   warnings: string[],
 *   waitlist: {action: string}|null,
 * }}
 */
export function resolveTrialConfig(env = {}, makeSecret = () => randomBytes(32).toString('base64url')) {
  const warnings = [];
  const rawLimit = Number(env.GEV_TRIAL_LIMIT);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 0;
  const voice = String(env.GEV_TRIAL_VOICE || '').trim().toLowerCase() === 'trial' ? 'trial' : 'waitlist';

  let secret = null;
  if (limit) {
    secret = String(env.GEV_TRIAL_SECRET || '').trim();
    if (!secret) {
      secret = makeSecret();
      warnings.push('GEV_TRIAL_SECRET is unset — trial cookies are signed with a per-process secret, so every restart gives every visitor a fresh trial.');
    } else if (secret.length < MIN_SECRET_LENGTH) {
      warnings.push(`GEV_TRIAL_SECRET is shorter than ${MIN_SECRET_LENGTH} characters — generate one with \`openssl rand -base64 32\`.`);
    }
  }

  const username = String(env.GEV_WAITLIST_BUTTONDOWN || '').trim();
  let waitlist = null;
  if (username && BUTTONDOWN_USERNAME_RE.test(username)) {
    waitlist = { action: `https://buttondown.com/api/emails/embed-subscribe/${username}` };
  } else if (username) {
    warnings.push('GEV_WAITLIST_BUTTONDOWN is not a Buttondown username (letters, digits, _ and - only) — the waitlist form is off.');
  }
  if (limit && !waitlist) {
    warnings.push('GEV_TRIAL_LIMIT is set but GEV_WAITLIST_BUTTONDOWN is not — the trial-ended card will have no form, and nobody can join the waitlist.');
  }

  return { enabled: Boolean(limit), limit, secret, voice, warnings, waitlist };
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * @param {{used: number, id: string}} state
 * @param {string} secret
 * @returns {string} `v1.<used>.<id>.<signature>`
 */
export function signTrialToken({ used, id }, secret) {
  const payload = `${TOKEN_VERSION}.${Math.max(0, Math.floor(used))}.${id}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify one token. Anything malformed, forged or signed with another secret
 * reads as "no cookie" — a new trial, never an error page.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {{used: number, id: string}|null}
 */
export function verifyTrialToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const [, usedText, id, signature] = parts;
  if (!/^\d{1,6}$/.test(usedText) || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const expected = Buffer.from(sign(`${TOKEN_VERSION}.${usedText}.${id}`, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { used: Number(usedText), id };
}

/**
 * The value of one cookie in a `Cookie:` header, or null.
 * @param {string|string[]|undefined} header
 * @param {string} name
 */
export function readCookie(header, name) {
  const text = Array.isArray(header) ? header.join('; ') : String(header || '');
  for (const pair of text.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return null;
}

/**
 * Whether the visitor reached us over HTTPS. Behind the Cloudflare tunnel the
 * socket is plain HTTP, so the proxy's header is the only witness; it only
 * decides the `Secure` attribute, so a forged value costs nothing.
 */
function requestIsHttps(req) {
  if (req.socket?.encrypted) return true;
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

/** Add a Set-Cookie without dropping one another middleware already set. */
function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.('Set-Cookie');
  const list = existing === undefined ? [] : (Array.isArray(existing) ? existing : [String(existing)]);
  res.setHeader('Set-Cookie', [...list, cookie]);
}

/**
 * Where a visitor stands, without spending anything.
 *
 * @param {import('http').IncomingMessage} req
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @returns {{used: number, remaining: number, id: string|null}}
 */
export function readTrialState(req, config) {
  if (!config.enabled) return { used: 0, remaining: Infinity, id: null };
  const token = readCookie(req.headers?.cookie, TRIAL_COOKIE);
  const state = token ? verifyTrialToken(token, config.secret) : null;
  const used = state?.used ?? 0;
  return { used, remaining: Math.max(0, config.limit - used), id: state?.id ?? null };
}

/**
 * Why this visitor may not use a route of this kind, or null.
 *
 * - `comfort` (HUD summary, nearby places, text search) is refused once the
 *   trial is spent.
 * - `voice` is refused outright unless `GEV_TRIAL_VOICE=trial`: the OpenAI
 *   account answers about three responses a minute for the WHOLE site, so a
 *   trial of it would be silence for most of the people who tried.
 *
 * @param {'comfort'|'voice'} kind
 * @param {{remaining: number}} state
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @returns {'exhausted'|'voice'|null}
 */
export function trialRefusalReason(kind, state, config) {
  if (!config.enabled) return null;
  if (kind === 'voice' && config.voice !== 'trial') return 'voice';
  return state.remaining > 0 ? null : 'exhausted';
}

/**
 * The response for a refused route. 429 because that is what every caller
 * already degrades on; the `quota` field is what tells the page it is the
 * trial and not load. No `Retry-After`: waiting does not help.
 *
 * @param {import('http').ServerResponse} res
 * @param {'exhausted'|'voice'} reason
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {object} [extra] - A route's own error contract (`places: []`).
 */
export function sendTrialRefusal(res, reason, config, extra = {}) {
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    ...extra,
    error: reason === 'voice'
      ? 'La voix n’est pas incluse dans l’essai'
      : 'Essai terminé',
    quota: reason,
    limit: config.limit,
  }));
}

/**
 * Count one try: write the cookie with `used + 1`. Call it before the
 * response body is sent, and only once the key has actually been spent on an
 * answer the visitor gets — a failed upstream call is not a try.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {() => string} [makeId]
 */
export function consumeTrial(req, res, config, makeId = () => randomBytes(12).toString('base64url')) {
  if (!config.enabled || res.headersSent) return;
  const state = readTrialState(req, config);
  const token = signTrialToken({ used: state.used + 1, id: state.id || makeId() }, config.secret);
  const attributes = [
    `${TRIAL_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_S}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (requestIsHttps(req)) attributes.push('Secure');
  appendSetCookie(res, attributes.join('; '));
}

/**
 * The page's view of its own trial: `/api/trial`.
 *
 * @param {import('http').IncomingMessage} req
 * @param {ReturnType<typeof resolveTrialConfig>} config
 */
export function describeTrial(req, config) {
  const state = readTrialState(req, config);
  return {
    enabled: config.enabled,
    limit: config.enabled ? config.limit : null,
    used: config.enabled ? state.used : null,
    remaining: config.enabled ? state.remaining : null,
    voice: config.enabled ? config.voice : 'open',
    waitlist: config.waitlist,
  };
}
