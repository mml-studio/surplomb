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
 * VOICE IS ONE OF THE TRIES, AND HAPPENS ONCE. Decision of 2026-09-17: the
 * voice trial is three spoken requests, and it is one of the five tries — not
 * five sessions of three. So opening a voice trial spends one comfort try, and
 * a second field of the cookie counts the spoken requests, which never come
 * back. The realtime path cannot be counted here turn by turn — the browser
 * talks to OpenAI directly once the session is minted — so minting spends all
 * of them at once and tells the page how many requests the session may answer
 * (`X-GEV-Trial-Voice-Turns`); the page closes it after that many.
 *
 * THE HUD CANNOT TAKE THE VOICE'S TRY. The HUD asks a summary on its own,
 * whenever the view changes — about one try every 15 s of exploring. Left
 * alone, it emptied all five before the visitor ever touched the mic, and the
 * card said « Essai terminé » about a voice nobody had tried. So until the
 * voice trial has opened, a summary may not take the last try (`reserved`,
 * which the page answers by going quiet, not with the card).
 *
 * THE OWNER IS NOT A VISITOR. The person who runs the instance needs the
 * comfort routes without a count. The address cannot say who that is: a
 * Tailscale path and the Cloudflare tunnel both reach the container from the Docker
 * bridge gateway (measured 2026-09-17: `172.22.0.1` for both), so an address
 * rule would be a rule for everybody. The owner holds a second signed cookie,
 * `gev_owner`, obtained through a single-use link that only someone with
 * `GEV_OWNER_PASS_SECRET` can mint (`scripts/owner-pass.mjs`, run over SSH).
 * A browser holding it is never counted and never refused; the global
 * `*_GLOBAL_PER_MIN` caps still apply. Rotating the secret revokes every pass.
 *
 * OFF BY DEFAULT. With `GEV_TRIAL_LIMIT` unset, every function here is a
 * no-op: a clone running on its own keys owes nobody a waitlist.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TRIAL_COOKIE = 'gev_trial';
const TOKEN_VERSION = 'v2';
/** Chrome caps a cookie's lifetime at 400 days; asking for more is ignored. */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 16;
const BUTTONDOWN_USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Spoken requests in one voice trial (decision of 2026-09-17). */
export const TRIAL_VOICE_TURNS_DEFAULT = 3;
/** A voice trial longer than this is not a trial; it holds the site's minute budget. */
const TRIAL_VOICE_TURNS_MAX = 20;
/** Header naming how many requests a minted trial session may answer. */
export const TRIAL_VOICE_TURNS_HEADER = 'X-GEV-Trial-Voice-Turns';

export const OWNER_COOKIE = 'gev_owner';
const OWNER_VERSION = 'o1';
/** How long a minted owner link can be redeemed. */
export const OWNER_LINK_TTL_S = 10 * 60;
/** A short owner secret is a bypass anyone can brute-force: refused, not warned about. */
const MIN_OWNER_SECRET_LENGTH = 32;
const OWNER_BODY_MAX_BYTES = 4096;

/**
 * `GEV_TRIAL_VOICE`: how many spoken requests the voice trial allows.
 * Unset means the default; `0` (or `waitlist`, the first spelling) keeps voice
 * out of the trial, so the mic opens the waitlist card straight away.
 *
 * @param {string|undefined} raw
 * @param {string[]} warnings
 * @returns {number}
 */
function resolveVoiceTurns(raw, warnings) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return TRIAL_VOICE_TURNS_DEFAULT;
  if (text === 'waitlist' || text === 'off') return 0;
  if (/^\d+$/.test(text)) return Math.min(TRIAL_VOICE_TURNS_MAX, Number(text));
  warnings.push(`GEV_TRIAL_VOICE=${raw} is not a number of spoken requests — using ${TRIAL_VOICE_TURNS_DEFAULT}.`);
  return TRIAL_VOICE_TURNS_DEFAULT;
}

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
 *   ownerSecret: string|null,
 *   voiceTurns: number,
 *   warnings: string[],
 *   waitlist: {action: string}|null,
 * }}
 */
export function resolveTrialConfig(env = {}, makeSecret = () => randomBytes(32).toString('base64url')) {
  const warnings = [];
  const rawLimit = Number(env.GEV_TRIAL_LIMIT);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 0;
  const voiceTurns = limit ? resolveVoiceTurns(env.GEV_TRIAL_VOICE, warnings) : 0;

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

  // Only meaningful while there is a trial to step over.
  let ownerSecret = null;
  const rawOwnerSecret = String(env.GEV_OWNER_PASS_SECRET || '').trim();
  if (limit && rawOwnerSecret.length >= MIN_OWNER_SECRET_LENGTH) {
    ownerSecret = rawOwnerSecret;
  } else if (limit && rawOwnerSecret) {
    warnings.push(`GEV_OWNER_PASS_SECRET is shorter than ${MIN_OWNER_SECRET_LENGTH} characters — owner passes are OFF. Generate one with \`openssl rand -base64 48\`.`);
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

  return { enabled: Boolean(limit), limit, secret, ownerSecret, voiceTurns, warnings, waitlist };
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

/**
 * @param {{used: number, voiceUsed?: number, id: string}} state
 * @param {string} secret
 * @returns {string} `v2.<used>.<voiceUsed>.<id>.<signature>`
 */
export function signTrialToken({ used, voiceUsed = 0, id }, secret) {
  const payload = `${TOKEN_VERSION}.${count(used)}.${count(voiceUsed)}.${id}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify one token. Anything malformed, forged or signed with another secret
 * reads as "no cookie" — a new trial, never an error page.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {{used: number, voiceUsed: number, id: string}|null}
 */
export function verifyTrialToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
  const [, usedText, voiceText, id, signature] = parts;
  if (!/^\d{1,6}$/.test(usedText) || !/^\d{1,6}$/.test(voiceText)) return null;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const expected = Buffer.from(sign(`${TOKEN_VERSION}.${usedText}.${voiceText}.${id}`, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { used: Number(usedText), voiceUsed: Number(voiceText), id };
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
 * @returns {{used: number, remaining: number, voiceUsed: number, voiceRemaining: number, id: string|null, owner: boolean}}
 */
export function readTrialState(req, config) {
  if (!config.enabled) {
    return { used: 0, remaining: Infinity, voiceUsed: 0, voiceRemaining: Infinity, id: null, owner: false };
  }
  if (hasOwnerPass(req, config)) {
    return { used: 0, remaining: Infinity, voiceUsed: 0, voiceRemaining: Infinity, id: null, owner: true };
  }
  const token = readCookie(req.headers?.cookie, TRIAL_COOKIE);
  const state = token ? verifyTrialToken(token, config.secret) : null;
  const used = state?.used ?? 0;
  const voiceUsed = state?.voiceUsed ?? 0;
  return {
    used,
    remaining: Math.max(0, config.limit - used),
    voiceUsed,
    voiceRemaining: Math.max(0, config.voiceTurns - voiceUsed),
    id: state?.id ?? null,
    owner: false,
  };
}

/**
 * How many tries a HUD summary must leave: the one that opens the voice trial,
 * until it has opened.
 *
 * @param {{voiceUsed?: number}} state
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @returns {0|1}
 */
export function voiceReserve(state, config) {
  return config.voiceTurns > 0 && !(state.voiceUsed > 0) ? 1 : 0;
}

/**
 * Why this visitor may not use a route of this kind, or null.
 *
 * - `summary` (the HUD's, counted) is refused once the trial is spent, and
 *   `reserved` when the only try left is the voice's (`voiceReserve`).
 * - `lookup` (nearby places, text search: gated, not counted) is refused once
 *   the trial is spent — unless a voice trial has opened, because the voice
 *   asks the same names while it runs, and opening it may have taken the last
 *   try.
 * - `voice` is refused once its own requests are spent (at once when
 *   `GEV_TRIAL_VOICE=0`), and, before it ever started, once the tries are
 *   gone — the voice trial is one of them.
 *
 * @param {'summary'|'lookup'|'voice'} kind
 * @param {{remaining: number, voiceUsed?: number, voiceRemaining?: number}} state
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @returns {'exhausted'|'reserved'|'voice'|null}
 */
export function trialRefusalReason(kind, state, config) {
  if (!config.enabled) return null;
  if (kind === 'voice') {
    if (!(state.voiceRemaining > 0)) return 'voice';
    // A voice trial already under way has paid its try; only opening one costs.
    if (state.voiceUsed > 0) return null;
    return state.remaining > 0 ? null : 'exhausted';
  }
  if (kind === 'lookup' && state.voiceUsed > 0) return null;
  if (!(state.remaining > 0)) return 'exhausted';
  if (kind === 'summary' && state.remaining <= voiceReserve(state, config)) return 'reserved';
  return null;
}

/**
 * The response for a refused route. 429 because that is what every caller
 * already degrades on; the `quota` field is what tells the page it is the
 * trial and not load. No `Retry-After`: waiting does not help.
 *
 * WHY THE PROSE IS STILL FRENCH. This runs in Node, and the server has no
 * locale by design — no cookie, no `Accept-Language`, because a proxy that
 * varied its answers by language would have to vary its cache by it too
 * (docs/i18n/CONVENTIONS.md § 7). Nothing a reader sees comes from here: the
 * page words the refusal from `quota`, which it turns into the waitlist card
 * (src/trialRefusal.js → src/waitlistCard.js), and never shows `error`. The
 * stable `code` that § 7 asks for belongs with the rest of the server's
 * error codes, which the voice-and-server batch owns.
 *
 * @param {import('http').ServerResponse} res
 * @param {'exhausted'|'reserved'|'voice'} reason
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {object} [extra] - A route's own error contract (`places: []`).
 */
export function sendTrialRefusal(res, reason, config, extra = {}) {
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    ...extra,
    // i18n-ignore-start — server prose, no locale available; the page reads
    // `quota`, never this line (see the note above).
    error: reason === 'exhausted'
      ? 'Essai terminé'
      : reason === 'reserved'
        ? 'Le dernier essai est gardé pour la voix'
        : config.voiceTurns > 0
          ? 'Essai de la voix terminé'
          : 'La voix n’est pas incluse dans l’essai',
    // i18n-ignore-end
    quota: reason,
    limit: config.limit,
  }));
}

/**
 * Count tries: write the cookie with the counts moved on. Call it before the
 * response body is sent, and only once the key has actually been spent on an
 * answer the visitor gets — a failed upstream call is not a try.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {{comfort?: number, voice?: number}} [spend] - One comfort try unless
 *   told otherwise; see `voiceTrialSpend` for the voice routes.
 * @param {() => string} [makeId]
 */
export function consumeTrial(
  req,
  res,
  config,
  { comfort = 0, voice = 0 } = { comfort: 1 },
  makeId = () => randomBytes(12).toString('base64url'),
) {
  if (!config.enabled || res.headersSent) return;
  const state = readTrialState(req, config);
  if (state.owner) return;
  const token = signTrialToken({
    used: state.used + count(comfort),
    voiceUsed: state.voiceUsed + count(voice),
    id: state.id || makeId(),
  }, config.secret);
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
 * What one voice request costs: the first one opens the voice trial and so
 * takes one of the tries; `all` spends every remaining request at once, which
 * is what minting a realtime session does.
 *
 * @param {{voiceUsed: number, voiceRemaining: number}} state
 * @param {{all?: boolean}} [options]
 * @returns {{comfort: number, voice: number}}
 */
export function voiceTrialSpend(state, { all = false } = {}) {
  return {
    comfort: state.voiceUsed > 0 ? 0 : 1,
    voice: all ? state.voiceRemaining : 1,
  };
}

/**
 * The page's view of its own trial: `/api/trial`.
 *
 * @param {import('http').IncomingMessage} req
 * @param {ReturnType<typeof resolveTrialConfig>} config
 */
export function describeTrial(req, config, experiments = null) {
  const state = readTrialState(req, config);
  if (state.owner) {
    // No trial for this browser: the page shows no crown and no count, as on
    // an instance without one. `owner` is what tells the two apart.
    return {
      enabled: false,
      owner: true,
      limit: null,
      used: null,
      remaining: null,
      voice: null,
      waitlist: config.waitlist,
      experiments: experiments ? { firstRun: experiments } : null,
    };
  }
  return {
    enabled: config.enabled,
    limit: config.enabled ? config.limit : null,
    used: config.enabled ? state.used : null,
    remaining: config.enabled ? state.remaining : null,
    // Null when the instance has no trial: voice is then simply open.
    voice: config.enabled
      ? { limit: config.voiceTurns, used: state.voiceUsed, remaining: state.voiceRemaining }
      : null,
    waitlist: config.waitlist,
    // The hosted A/B tests the page must know about before it shows anything
    // (src/firstRunAb.js). Null on a clone, and on a host that runs none.
    experiments: experiments ? { firstRun: experiments } : null,
  };
}

// ── The owner pass ────────────────────────────────────────────────────────
//
// Two tokens, both HMAC'd with GEV_OWNER_PASS_SECRET under a different label
// so one can never stand in for the other:
//
//  - the LINK, `o1.<expires>.<nonce>.<sig>`, lives ten minutes, is redeemed
//    once, and is minted only where the secret is (scripts/owner-pass.mjs);
//  - the PASS, `o1.<issued>.<id>.<sig>`, is the cookie the link turns into.
//
// Redeeming is a POST behind a one-button page: a link pasted into a chat is
// fetched by its preview bot, and a GET that spent the link would hand the
// owner an « already used » page. « Once » is kept in memory: a restart inside
// the ten minutes makes an already redeemed link usable again, which is why
// the link is short-lived and printed only in the owner's terminal.

const OWNER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Tolerance on a link's expiry, for a mint on a machine whose clock is ahead. */
const OWNER_CLOCK_SLACK_S = 60;
// ── THIS ONE PAGE STAYS FRENCH ──────────────────────────────────────────────
//
// `/api/owner-pass` is served by Node, which has no locale to read (no
// cookie, no `Accept-Language` — see `sendTrialRefusal` above), and it is not
// part of the globe: it is a standalone page reached ONLY through a link
// minted over SSH by whoever holds `GEV_OWNER_PASS_SECRET`
// (`scripts/owner-pass.mjs`). Its one reader is the operator, who already
// read `docs/DEPLOY.md` in French. Translating it would mean either guessing
// a language for one person or building a locale path the rest of the server
// deliberately does not have.
// i18n-ignore-start — server-rendered operator page, no locale available
const OWNER_REFUSAL = 'Lien expiré, déjà utilisé ou invalide.';
const OWNER_PAGE_TITLE = 'Pass propriétaire';
const OWNER_PAGE_RETRY = 'Générez-en un nouveau.';
const OWNER_PAGE_LEDE = 'Ce navigateur n’aura plus de limite d’essais sur ce site. '
  + 'Le lien ne sert qu’une fois et expire dix minutes après sa création.';
const OWNER_PAGE_BUTTON = 'Activer sur ce navigateur';
// i18n-ignore-end

/** Nonces already redeemed, until they expire. Only signed links get in. */
const redeemedOwnerNonces = new Map();

const nowSeconds = () => Math.floor(Date.now() / 1000);

function ownerSign(label, payload, secret) {
  return sign(`${label}:${payload}`, secret);
}

function ownerSignatureMatches(label, payload, signature, secret) {
  const expected = Buffer.from(ownerSign(label, payload, secret));
  const given = Buffer.from(String(signature));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Split `o1.<seconds>.<id>.<sig>`, or null when it is not one. */
function parseOwnerToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== OWNER_VERSION) return null;
  const [, secondsText, id, signature] = parts;
  if (!/^\d{1,12}$/.test(secondsText) || !OWNER_ID_RE.test(id)) return null;
  return { payload: `${OWNER_VERSION}.${secondsText}.${id}`, seconds: Number(secondsText), id, signature };
}

/**
 * @param {{expiresAt: number, nonce: string}} link - `expiresAt` in Unix seconds.
 * @param {string} secret
 * @returns {string}
 */
export function signOwnerLink({ expiresAt, nonce }, secret) {
  const payload = `${OWNER_VERSION}.${count(expiresAt)}.${nonce}`;
  return `${payload}.${ownerSign('owner-link', payload, secret)}`;
}

/**
 * A link that is well formed, signed here, and not expired — whether it was
 * already redeemed is the route's business.
 *
 * @param {string} token
 * @param {string} secret
 * @param {number} [now] - Unix seconds.
 * @returns {{expiresAt: number, nonce: string}|null}
 */
export function verifyOwnerLink(token, secret, now = nowSeconds()) {
  const parsed = parseOwnerToken(token);
  if (!parsed || !ownerSignatureMatches('owner-link', parsed.payload, parsed.signature, secret)) return null;
  if (parsed.seconds < now || parsed.seconds > now + OWNER_LINK_TTL_S + OWNER_CLOCK_SLACK_S) return null;
  return { expiresAt: parsed.seconds, nonce: parsed.id };
}

/**
 * @param {{issuedAt: number, id: string}} pass - `issuedAt` in Unix seconds.
 * @param {string} secret
 * @returns {string}
 */
export function signOwnerPass({ issuedAt, id }, secret) {
  const payload = `${OWNER_VERSION}.${count(issuedAt)}.${id}`;
  return `${payload}.${ownerSign('owner-pass', payload, secret)}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {{issuedAt: number, id: string}|null}
 */
export function verifyOwnerPass(token, secret) {
  const parsed = parseOwnerToken(token);
  if (!parsed || !ownerSignatureMatches('owner-pass', parsed.payload, parsed.signature, secret)) return null;
  return { issuedAt: parsed.seconds, id: parsed.id };
}

/**
 * Whether this request carries a valid owner pass. Always false when the
 * instance has no trial or no owner secret. A pass older than the cookie's
 * own lifetime is refused here too: a value copied out of a browser does not
 * outlive the cookie it came from.
 *
 * @param {import('http').IncomingMessage} req
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {number} [now] - Unix seconds.
 */
export function hasOwnerPass(req, config, now = nowSeconds()) {
  if (!config.enabled || !config.ownerSecret) return false;
  const token = readCookie(req.headers?.cookie, OWNER_COOKIE);
  const pass = token ? verifyOwnerPass(token, config.ownerSecret) : null;
  return Boolean(pass && now - pass.issuedAt <= COOKIE_MAX_AGE_S);
}

/**
 * The single-use link that turns a browser into the owner's.
 *
 * @param {string} origin - Where the owner browses, e.g. `https://surplomb.app`.
 * @param {string} secret - GEV_OWNER_PASS_SECRET.
 * @param {{now?: number, makeNonce?: () => string}} [options]
 * @returns {string}
 */
export function mintOwnerLink(origin, secret, {
  now = nowSeconds(),
  makeNonce = () => randomBytes(18).toString('base64url'),
} = {}) {
  const url = new URL('/api/owner-pass', origin);
  url.searchParams.set('t', signOwnerLink({ expiresAt: now + OWNER_LINK_TTL_S, nonce: makeNonce() }, secret));
  return url.href;
}

/**
 * The `Domain` a pass is written for: the site without its `www.`, so one
 * pass covers both names. Null (a host-only cookie) for an address,
 * `localhost`, or anything that is not a plain host name.
 *
 * @param {string|undefined} hostHeader
 * @returns {string|null}
 */
export function ownerCookieDomain(hostHeader) {
  const host = String(hostHeader || '').trim().toLowerCase().replace(/:\d+$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host)) return null;
  const site = host.startsWith('www.') ? host.slice(4) : host;
  return site.includes('.') ? site : null;
}

function ownerPage(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${OWNER_PAGE_TITLE}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 32rem; margin: 15vh auto; padding: 0 1rem; background: #0b1418; color: #e6f1f3; }
  button { font: inherit; padding: .6rem 1rem; border: 0; border-radius: 6px; background: #00d8ff; color: #001018; cursor: pointer; }
</style>
<h1>${OWNER_PAGE_TITLE}</h1>
${body}
</html>
`);
}

async function readFormToken(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > OWNER_BODY_MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('t');
}

/**
 * `/api/owner-pass`. GET shows the link's one button, POST redeems it: the
 * pass is written and the browser goes to the globe. A 404 where owner
 * passes are off, so a clone does not even advertise the route.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof resolveTrialConfig>} config
 * @param {{clock?: () => number, redeemed?: Map<string, number>, makeId?: () => string}} [options]
 *   `clock` gives Unix seconds.
 * @returns {Promise<void>}
 */
export async function handleOwnerPass(req, res, config, {
  clock = nowSeconds,
  redeemed = redeemedOwnerNonces,
  makeId = () => randomBytes(18).toString('base64url'),
} = {}) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!config.enabled || !config.ownerSecret) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  const secret = config.ownerSecret;
  const usable = (token, now) => {
    const link = verifyOwnerLink(token, secret, now);
    return link && !redeemed.has(link.nonce) ? link : null;
  };

  if (req.method === 'GET' || req.method === 'HEAD') {
    const token = new URL(req.url || '/', 'http://owner.invalid').searchParams.get('t');
    if (!usable(token, clock())) {
      ownerPage(res, 410, `<p>${OWNER_REFUSAL} ${OWNER_PAGE_RETRY}</p>`);
      return;
    }
    ownerPage(res, 200, `<p>${OWNER_PAGE_LEDE}</p>
<form method="post" action="/api/owner-pass">
  <input type="hidden" name="t" value="${token}">
  <button type="submit">${OWNER_PAGE_BUTTON}</button>
</form>`);
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const token = await readFormToken(req).catch(() => null);
  // The time is read AFTER the body: a POST held open past the link's expiry
  // would otherwise be judged at its start, against a used-list that has
  // since forgotten the link.
  const now = clock();
  const link = usable(token, now);
  if (!link) {
    console.warn('[trial] owner link refused');
    ownerPage(res, 410, `<p>${OWNER_REFUSAL} ${OWNER_PAGE_RETRY}</p>`);
    return;
  }
  for (const [nonce, expiresAt] of redeemed) {
    if (expiresAt < now) redeemed.delete(nonce);
  }
  redeemed.set(link.nonce, link.expiresAt);

  const domain = ownerCookieDomain(req.headers?.host);
  const attributes = [
    `${OWNER_COOKIE}=${signOwnerPass({ issuedAt: now, id: makeId() }, secret)}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_S}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (domain) attributes.push(`Domain=${domain}`);
  if (requestIsHttps(req)) attributes.push('Secure');
  appendSetCookie(res, attributes.join('; '));
  console.info(`[trial] owner pass issued for ${domain || 'this host'}`);
  res.statusCode = 303;
  res.setHeader('Location', '/');
  res.end();
}
