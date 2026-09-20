/**
 * THE PUBLISHER'S IDENTITY, READ AT REQUEST TIME AND NEVER COMMITTED.
 *
 * French law (LCEN, art. 1-1) requires a published site to name its
 * publisher, their address and phone number, the publication director, and
 * every provider that stores what the site processes. Those facts belong to
 * whoever RUNS an instance, not to this repository:
 *
 *   - The repository is public and forkable. An identity written into
 *     `mentions-legales.html` would be republished by every self-hosted copy,
 *     each one naming a publisher who has never heard of it.
 *   - A postal address and a phone number in a public git history are a spam
 *     and phishing target that no later commit can take back.
 *
 * So the two legal pages ship with a FALLBACK between markers — a visible
 * « non renseigné » — and the server replaces it with the values below when
 * the deployment sets them. A page served without this middleware (a plain
 * static host, a stale build) shows the fallback, never a blank: a missing
 * publisher must be seen, not merely absent.
 *
 * Server-side only. Nothing here reaches the browser bundle, and nothing is
 * inlined at build time, so editing the deployment's `.env` and recreating the
 * container is enough — no rebuild.
 *
 * AND IT IS FRENCH, ON PURPOSE. `mentions-legales.html` and
 * `confidentialite.html` are French and the French text governs
 * (CONTRIBUTING.md, "Language"): they are legal documents, not interface, and
 * a translated notice would be a second version of something that has exactly
 * one. The rows this module fills are those pages' own words, so they stay
 * where they are, in French, in both locales. The two LINKS that lead here do
 * get English labels — see `src/legalLinks.js`.
 */

import { firstRunExperimentFromEnv } from './firstRunAb.js';

/**
 * Each field, the variable that carries it, and whether the page renders as
 * complete without it. `registration` is optional because an individual who
 * is not registered with the RCS or the RM has no number to show.
 *
 * `phone` is optional by the operator's choice, NOT by the law: art. 1-1 I
 * asks a publisher for one. Left out, the row is simply absent — the page
 * does not pretend otherwise, and `docs/DEPLOY.md` says what it costs.
 */
export const LEGAL_FIELDS = Object.freeze([
  Object.freeze({ key: 'publisher', env: 'GEV_LEGAL_PUBLISHER', required: true }),
  Object.freeze({ key: 'registration', env: 'GEV_LEGAL_REGISTRATION', required: false }),
  Object.freeze({ key: 'address', env: 'GEV_LEGAL_ADDRESS', required: true }),
  Object.freeze({ key: 'phone', env: 'GEV_LEGAL_PHONE', required: false }),
  Object.freeze({ key: 'email', env: 'GEV_LEGAL_EMAIL', required: true }),
  Object.freeze({ key: 'director', env: 'GEV_LEGAL_DIRECTOR', required: true }),
  Object.freeze({ key: 'hosting', env: 'GEV_LEGAL_HOSTING', required: true }),
]);

/**
 * Separator between providers in `GEV_LEGAL_HOSTING`. A pipe, because commas
 * and semicolons both occur inside a postal address.
 */
export const HOSTING_SEPARATOR = '|';

/** The marked regions the server fills, by name. */
export const LEGAL_BLOCKS = Object.freeze(['publisher', 'hosting', 'controller']);

/**
 * Sections that only describe a feature when the deployment turned it on.
 * Kept out of the page when it is off, so an instance never discloses a
 * processor it does not use.
 */
export const CONDITIONAL_SECTIONS = Object.freeze({
  // Same readings as `resolveTrialConfig` (src/trialQuota.js): a limit below
  // one is no trial, and so no cookie.
  trial: (env) => Number(env?.GEV_TRIAL_LIMIT) >= 1,
  waitlist: (env) => Boolean(String(env?.GEV_WAITLIST_BUTTONDOWN || '').trim()),
  // The welcome-card test, through the one reader of `GEV_FIRST_RUN_AB`
  // (src/firstRunAb.js): fewer than two variants is no test, and so nothing
  // measured. `noabtest` keeps the sentence the page says when nothing is.
  abtest: (env) => Boolean(firstRunExperimentFromEnv(env || {})),
  noabtest: (env) => !Boolean(firstRunExperimentFromEnv(env || {})),
});

/** One line of env text, trimmed; newlines folded so a value cannot open a new element. */
function envLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The deployment's legal identity.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {{
 *   complete: boolean,
 *   missing: string[],
 *   publisher: string, registration: string, address: string,
 *   phone: string, email: string, director: string,
 *   hosting: string[],
 * }}
 */
export function legalNoticeFromEnv(env = {}) {
  const notice = { complete: false, missing: [] };
  for (const { key, env: name, required } of LEGAL_FIELDS) {
    const raw = envLine(env[name]);
    if (key === 'hosting') {
      notice.hosting = raw.split(HOSTING_SEPARATOR).map(envLine).filter(Boolean);
      if (required && notice.hosting.length === 0) notice.missing.push(name);
      continue;
    }
    notice[key] = raw;
    if (required && !raw) notice.missing.push(name);
  }
  notice.complete = notice.missing.length === 0;
  return notice;
}

/** @param {string} text */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

/** A mailto link whose visible text is the address itself. */
function mailLink(email) {
  const safe = escapeHtml(email);
  return `<a href="mailto:${safe}">${safe}</a>`;
}

/** `tel:` wants the digits and the leading plus, nothing else. */
function telLink(phone) {
  const dial = String(phone).replace(/[^\d+]/g, '');
  return `<a href="tel:${escapeHtml(dial)}">${escapeHtml(phone)}</a>`;
}

/**
 * The HTML each marked region receives on a configured deployment.
 *
 * @param {ReturnType<typeof legalNoticeFromEnv>} notice
 * @returns {Record<string, string>}
 */
export function renderLegalBlocks(notice) {
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  // i18n-ignore-start — the French legal pages' own rows; see the note at the
  // top of this file. The pages are French and the French text governs.
  const publisher = [
    row('Éditeur', escapeHtml(notice.publisher)),
    notice.registration ? row('Immatriculation', escapeHtml(notice.registration)) : '',
    row('Adresse', escapeHtml(notice.address)),
    notice.phone ? row('Téléphone', telLink(notice.phone)) : '',
    row('Courriel', mailLink(notice.email)),
    row('Directeur de la publication', escapeHtml(notice.director)),
  ].join('');
  const hosting = notice.hosting.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  return {
    publisher: `<dl class="identity">${publisher}</dl>`,
    hosting: `<ul class="providers">${hosting}</ul>`,
    controller: `<p>Le responsable du traitement est l’éditeur du site : `
      + `${escapeHtml(notice.publisher)}, joignable à ${mailLink(notice.email)}.</p>`,
    // i18n-ignore-end
  };
}

const blockPattern = (name) => new RegExp(
  `<!--gev:legal:${name}-->[\\s\\S]*?<!--/gev:legal:${name}-->`,
  'g',
);
const conditionalPattern = (name) => new RegExp(
  `<!--gev:if:${name}-->([\\s\\S]*?)<!--/gev:if:${name}-->`,
  'g',
);

/**
 * Fill a legal page for one deployment.
 *
 * An incomplete identity leaves every fallback in place, and appends the names
 * of the missing variables to it: an operator who opens the page sees exactly
 * what to set, and a visitor sees that the instance has not said who runs it,
 * rather than a half-filled block that looks finished.
 *
 * @param {string} html - The page as built.
 * @param {Record<string, string|undefined>} env
 * @returns {string}
 */
export function renderLegalPage(html, env = {}) {
  let out = String(html ?? '');
  for (const [name, enabled] of Object.entries(CONDITIONAL_SECTIONS)) {
    out = out.replace(conditionalPattern(name), (_, body) => (enabled(env) ? body : ''));
  }
  const notice = legalNoticeFromEnv(env);
  if (!notice.complete) {
    // i18n-ignore-next-line — as above: an operator's line on a French page.
    const hint = `<p class="missing-vars">Variables manquantes : `
      + `${notice.missing.map((name) => `<code>${name}</code>`).join(', ')}.</p>`;
    for (const name of LEGAL_BLOCKS) {
      out = out.replace(blockPattern(name), (region) => region.replace(
        `<!--/gev:legal:${name}-->`,
        `${hint}<!--/gev:legal:${name}-->`,
      ));
    }
    return out;
  }
  const blocks = renderLegalBlocks(notice);
  for (const name of LEGAL_BLOCKS) {
    out = out.replace(blockPattern(name), () => blocks[name]);
  }
  return out;
}

/**
 * The page a request names, or null. Both the clean path and the `.html` one
 * are answered, so a link can be written without the extension and a built
 * file requested directly still gets filled rather than served raw.
 */
export const LEGAL_PAGES = Object.freeze({
  'mentions-legales': 'mentions-legales.html',
  confidentialite: 'confidentialite.html',
});

/** @param {string} url @returns {string|null} The page's file name. */
export function legalPageForUrl(url) {
  const pathname = String(url || '').split(/[?#]/)[0];
  const match = /^\/([a-z-]+?)(?:\.html)?\/?$/.exec(pathname);
  // Own keys only: `/constructor` must not resolve through the prototype.
  if (!match || !Object.hasOwn(LEGAL_PAGES, match[1])) return null;
  return LEGAL_PAGES[match[1]];
}
