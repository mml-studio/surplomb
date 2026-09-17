/**
 * Which door an address opens: the showcase page, or the cockpit.
 *
 * ── TWO ADDRESSES, ONE ORIGIN ────────────────────────────────────────────────
 *
 * `/` is the showcase's address and {@link APP_PATH} is the globe's. They are
 * two paths of ONE origin, not two hostnames, and that is the whole reason the
 * hand-off can be invisible: `history.replaceState` may rewrite a path, never a
 * host. So pressing « Ouvrir le globe » swaps the address under a frozen frame
 * with no navigation, no reload and no second boot — while a reader who types,
 * bookmarks or is sent `/globe` still lands straight in the cockpit.
 *
 * A subdomain (`app.surplomb.app`) would have forced a real navigation there,
 * i.e. tearing the page down and booting the engine again in front of the
 * reader. Same origin also keeps one `localStorage`, one cookie jar, one
 * referrer restriction on the browser Google key, and one entry in
 * `GEV_PUBLIC_HOST`.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * The landing page IS the globe's own document (`index.html`), so every share
 * link keeps working unchanged. What decides between the two surfaces is the
 * address and one remembered fact:
 *
 *   - {@link APP_PATH} opens the cockpit — the globe's own address says so;
 *   - a share hash (`#v=2&lat=…`) opens the cockpit — a link somebody sent is a
 *     request for that view, not for a brochure;
 *   - `?q=` (the showcase's own form, empty or not), `?waitlist=1` and any
 *     `?welcome=` open the cockpit — each of them names something that lives
 *     there;
 *   - everything else, i.e. `/` without an errand, gets the showcase. Every
 *     time, for everybody.
 *
 * ── WHY NO « ALREADY SEEN » MEMORY ───────────────────────────────────────────
 *
 * There was one (`gev:vitrine-seen:v1`, #257): once a browser had opened the
 * globe, `/` gave it the cockpit forever. It existed because ONE address had to
 * serve two surfaces, and it was a trap — a reader who had seen the globe could
 * no longer reach the home page at its own URL, whatever they typed. The
 * address bar said `/` and showed something else.
 *
 * The second address removed the reason for it: `/globe` is where a returning
 * reader goes, by bookmark, by installed app (`start_url`) or by typing it. So
 * the memory is gone rather than merely overridable — the decision is a pure
 * function of the address now, which is also why nothing here writes to storage
 * any more. {@link forgetVitrineSeen} clears the stale key left in browsers
 * that met the old build.
 *
 * `?vitrine=1` and `?vitrine=0` force either door for the session and are never
 * persisted (same doctrine as `?input=` and `?perf=`). The QA fleet skips the
 * showcase through a window flag set before any page script runs, for the
 * reason `scripts/lib/qa-first-run.mjs` gives about `?welcome=0`: harnesses
 * rebuild their URLs, and a query parameter falls off exactly then.
 *
 * ── WHY A HASH WITHOUT `=` IS NOT A SHARE LINK ───────────────────────────────
 *
 * The showcase has in-page anchors (`#haut`, `#contenu`). Following one writes
 * `#haut` into the address, and a reload after that must not throw a first
 * visitor into the cockpit. Every share link this app has ever written is
 * `key=value` pairs, so the `=` is the test.
 *
 * ── WHY TWO COPIES ───────────────────────────────────────────────────────────
 *
 * `index.html` carries an inline copy of {@link decideVitrine} that runs before
 * the stylesheet, so the first paint is already the right surface. This module
 * is the authority the entry script asks. `src/vitrine/gate.test.mjs` RUNS the
 * inline copy over the same matrix and fails when the two disagree — the
 * arrangement `src/inputMode.js` already uses.
 *
 * @module vitrine/gate
 */

/**
 * The key the retired « already seen » memory used (#257–#259). Kept only so
 * {@link forgetVitrineSeen} can delete it; nothing reads it.
 */
export const RETIRED_SEEN_KEY = 'gev:vitrine-seen:v1';

/**
 * The globe's own address. Served by `index.html` like every other path — the
 * SPA fallback of `vite dev` and `vite preview` already answers it with the
 * same document, the same `Cache-Control` and the same pre-compressed body as
 * `/` (measured 2026-09-17), so no middleware exists for it and none is needed.
 */
export const APP_PATH = '/globe';

/**
 * Is this the globe's own address? Trailing slashes are the same address; a
 * link that picked one up on the way must not land on the brochure.
 * @param {string} [path] - `location.pathname`.
 * @returns {boolean}
 */
export function isAppPath(path) {
  return (String(path || '').replace(/\/+$/, '') || '/') === APP_PATH;
}

/** Set on `window` by the QA fleet before any page script runs. */
export const VITRINE_SKIP_GLOBAL = '__GEV_SKIP_VITRINE__';

/** The attribute the inline head script and the entry script put on `<html>`. */
export const VITRINE_ATTRIBUTE = 'data-vitrine';

/**
 * From this width up the showcase sits over a fixed full-page picture of the
 * globe; below it the picture belongs to the first screen only. Mirrors the
 * `min-width: 1001px` media queries of `landing.css`.
 */
export const VITRINE_WIDE_MIN_PX = 1001;

/**
 * Read everything the decision needs, from injectable globals. The address and
 * one window flag — no storage is touched, so Safari's private mode and a
 * hardened profile have nothing to throw about.
 * @param {object} [options]
 * @returns {{path: string, search: string, hash: string, skip: boolean}}
 */
export function readVitrineSignals({
  location = globalThis.location,
  windowRef = globalThis,
} = {}) {
  return {
    path: String(location?.pathname || '/'),
    search: String(location?.search || ''),
    hash: String(location?.hash || ''),
    skip: windowRef?.[VITRINE_SKIP_GLOBAL] === true,
  };
}

/**
 * The decision, as a pure function of the signals.
 *
 * `reason` says why — it is read by the harnesses and printed in diagnostics;
 * nothing acts on it any more, since no arrival writes anything down.
 *
 * @param {{path?: string, search?: string, hash?: string, skip?: boolean}} signals
 * @returns {{vitrine: boolean, reason: 'forced'|'app-path'|'qa'|'share'|'query'|'link'|'home'}}
 */
export function decideVitrine({ path = '/', search = '', hash = '', skip = false } = {}) {
  const params = new URLSearchParams(search);
  const forced = params.get('vitrine');
  if (forced === '1') return { vitrine: true, reason: 'forced' };
  if (forced === '0') return { vitrine: false, reason: 'forced' };
  // Below `?vitrine=1` only, so a demo can still show the brochure from the
  // globe's address; above everything else, because a typed path is the most
  // explicit thing a reader can say.
  if (isAppPath(path)) return { vitrine: false, reason: 'app-path' };
  if (skip) return { vitrine: false, reason: 'qa' };
  if (String(hash).indexOf('=') >= 0) return { vitrine: false, reason: 'share' };
  if (params.has('q')) return { vitrine: false, reason: 'query' };
  if (params.has('waitlist') || params.has('welcome')) return { vitrine: false, reason: 'link' };
  return { vitrine: true, reason: 'home' };
}

/**
 * Delete the retired « already seen » key. A browser that met #257 or #258
 * carries it; nothing reads it any more, and leaving a dead entry in a reader's
 * storage is the kind of thing `confidentialite.html` promises not to do.
 * Best-effort, called once per boot.
 * @param {{removeItem: Function}|null} [storage]
 * @returns {boolean} whether the key was removed.
 */
export function forgetVitrineSeen(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    if (typeof store?.removeItem !== 'function') return false;
    store.removeItem(RETIRED_SEEN_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put the decision on `<html>`, idempotently — the inline script has usually
 * done it already.
 * @param {{vitrine: boolean}} decision
 * @param {HTMLElement} [root]
 */
export function applyVitrineDecision(decision, root = globalThis.document?.documentElement) {
  if (!root?.setAttribute) return;
  if (decision.vitrine) root.setAttribute(VITRINE_ATTRIBUTE, '');
  else root.removeAttribute?.(VITRINE_ATTRIBUTE);
}

/** @returns {boolean} whether the showcase currently owns the page. */
export function isVitrineActive(root = globalThis.document?.documentElement) {
  return Boolean(root?.hasAttribute?.(VITRINE_ATTRIBUTE));
}

/**
 * Is this viewport wide enough for the full-page picture?
 * @param {Function} [matchMediaRef]
 * @returns {boolean}
 */
export function isWideVitrine(matchMediaRef = globalThis.matchMedia?.bind(globalThis)) {
  return Boolean(matchMediaRef?.(`(min-width: ${VITRINE_WIDE_MIN_PX}px)`)?.matches);
}
