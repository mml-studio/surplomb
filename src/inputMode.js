/**
 * What kind of hands this session has, and whether they hold a phone.
 *
 * ── WHY ONE MODULE OWNS BOTH FACTS ──────────────────────────────────────────
 *
 * Two different questions were about to grow two different answers:
 *
 *   - "can this reader hit a 20 px target?" — a capability question. A tablet
 *     answers yes and is not a phone.
 *   - "does this reader get the phone shell?" — a format question. A desktop
 *     window dragged narrow answers no and is not a phone either.
 *
 * Asking them separately, with separate thresholds, produces the one state
 * nobody can debug: a phone in landscape (844×390) running the small render
 * profile under the desktop chrome, because the profile asked about the
 * pointer and the CSS asked about `max-width`. So both answers are decided
 * HERE, from the same signals, once per session, and published as two
 * attributes on `<html>` that every other surface reads instead of re-deciding.
 *
 * ── WHY THE SHELL THRESHOLD IS THE SMALLER DIMENSION ────────────────────────
 *
 * `min(innerWidth, innerHeight)` does not change when the device rotates, so
 * the shell is stable for the session: a reader who turns their phone sideways
 * keeps the phone shell instead of watching the interface rebuild itself.
 * `max-width` would have flipped. 600 sits above every phone in landscape
 * (a 390×844 phone reads 390 either way) and below every tablet held in
 * portrait (an iPad reads 744), which is exactly where the line belongs:
 * a tablet gets the touch treatment and the desktop layout, because it has the
 * room for it.
 *
 * ── WHY `hover: none` IS PART OF "COARSE" ───────────────────────────────────
 *
 * `(pointer: coarse)` alone says yes to a touchscreen laptop whose primary
 * pointer is still a trackpad, and to a desktop with a graphics tablet
 * plugged in. Those readers have a cursor, they get hover states, and widening
 * every pick radius for them would be a regression nobody asked for.
 * `(hover: none)` is the clause that means "there is no cursor here".
 * `maxTouchPoints >= 1` — not `> 1` — because Chrome's device emulation, which
 * is what every phone harness in `scripts/` runs on, reports exactly 1.
 *
 * ── WHY `?input=` DOES NOT PERSIST, AND IS NOT IN A SHARE LINK ──────────────
 *
 * Same doctrine as `?perf=` (see `src/perfProfile.js`): it is a debugging and
 * QA instrument, links get pasted into chats, and a parameter that rewrote the
 * interface of everyone who clicked would be a trap. It forces the CURRENT
 * SESSION and is never serialized by `src/sharelink.js`.
 *
 * @module inputMode
 */

/**
 * The shell threshold, in CSS pixels of the viewport's SMALLER side.
 *
 * Mirrored by the inline script in `index.html` — the one that has to run
 * before the stylesheet so the phone never sees a frame of desktop chrome.
 * `src/inputMode.test.mjs` reads both and fails when they drift apart.
 */
export const PHONE_MAX_MIN_DIMENSION_PX = 600;

/** The accepted `?input=` values. Anything else is read as absent. */
export const INPUT_OVERRIDES = Object.freeze(['phone', 'coarse', 'fine']);

let _mode = null;
let _signals = null;

/**
 * Read every signal at once, so the decisions below are pure functions of an
 * object a test can hand them.
 *
 * @param {object} [options]
 * @param {object} [options.nav] - `navigator`, injected for tests.
 * @param {Function} [options.matchMediaRef] - `matchMedia`, injected for tests.
 * @param {{innerWidth: number, innerHeight: number}} [options.view] - Viewport source.
 * @param {string} [options.search] - `location.search`.
 * @returns {{coarsePointer: boolean, noHover: boolean, touchPoints: number,
 *   viewportMinPx: ?number, forcedInput: ?string}}
 */
export function readInputSignals({
  nav = globalThis.navigator,
  matchMediaRef = globalThis.matchMedia?.bind(globalThis),
  view = globalThis,
  search = globalThis.location?.search ?? '',
} = {}) {
  const asked = String(new URLSearchParams(search).get('input') || '').trim().toLowerCase();
  const w = Number(view?.innerWidth);
  const h = Number(view?.innerHeight);
  return {
    coarsePointer: !!matchMediaRef?.('(pointer: coarse)')?.matches,
    noHover: !!matchMediaRef?.('(hover: none)')?.matches,
    touchPoints: Number.isFinite(nav?.maxTouchPoints) ? nav.maxTouchPoints : 0,
    viewportMinPx: Number.isFinite(w) && Number.isFinite(h) ? Math.min(w, h) : null,
    forcedInput: INPUT_OVERRIDES.includes(asked) ? asked : null,
  };
}

/** @returns {boolean} Whether these signals describe hands without a cursor. */
function coarseFromSignals(signals) {
  return !!signals?.coarsePointer
    && !!signals?.noHover
    && Number(signals?.touchPoints) >= 1;
}

/**
 * Does this session get the phone shell?
 *
 * Exported on its own because `src/perfProfile.js` asks the same question of
 * its own signal bundle, before any viewer exists, and two copies of this
 * predicate is exactly what this module was written to prevent.
 *
 * @param {object} signals - From {@link readInputSignals}.
 * @returns {boolean}
 */
export function isPhoneSignals(signals) {
  if (signals?.forcedInput) return signals.forcedInput === 'phone';
  return coarseFromSignals(signals)
    && Number.isFinite(signals?.viewportMinPx)
    && signals.viewportMinPx < PHONE_MAX_MIN_DIMENSION_PX;
}

/**
 * The two answers, as a pure function of the signals.
 *
 * `?input=coarse` is deliberately NOT a phone: it is how a desktop run asks
 * for the touch treatment (wider picks, tap verbs) without the small-screen
 * chrome, which is the tablet case and the only way to test it on a laptop.
 *
 * @param {object} signals - From {@link readInputSignals}.
 * @returns {{input: 'coarse'|'fine', shell: 'phone'|null, source: string}}
 */
export function detectInputMode(signals) {
  const forced = signals?.forcedInput ?? null;
  if (forced === 'fine') return { input: 'fine', shell: null, source: 'url' };
  if (forced === 'coarse') return { input: 'coarse', shell: null, source: 'url' };
  if (forced === 'phone') return { input: 'coarse', shell: 'phone', source: 'url' };
  if (!coarseFromSignals(signals)) return { input: 'fine', shell: null, source: 'signals' };
  return {
    input: 'coarse',
    shell: isPhoneSignals(signals) ? 'phone' : null,
    source: 'signals',
  };
}

/**
 * Write the two answers onto `<html>`, where CSS can see them.
 *
 * Separate from {@link initInputMode} so the inline head script and this
 * module put the attributes in the same place by the same rules.
 *
 * @param {{input: string, shell: ?string}} mode
 * @param {HTMLElement} [root]
 * @returns {void}
 */
export function applyInputMode(mode, root = globalThis.document?.documentElement) {
  if (!root?.setAttribute) return;
  root.setAttribute('data-input', mode.input);
  if (mode.shell) root.setAttribute('data-shell', mode.shell);
  else root.removeAttribute?.('data-shell');
}

/**
 * Resolve the mode once and publish it. Idempotent by design: the inline head
 * script has already set the attributes by the time this runs, and this call
 * exists to re-pose them for a harness that injected `?input=` after the fact
 * — and to hand the same answer to the JS that asks for it.
 *
 * @param {object} [options] - Forwarded to {@link readInputSignals}, plus
 *   `root` for the element the attributes land on.
 * @returns {{input: 'coarse'|'fine', shell: 'phone'|null, source: string}}
 */
export function initInputMode(options = {}) {
  if (_mode) return _mode;
  _signals = readInputSignals(options);
  _mode = detectInputMode(_signals);
  applyInputMode(_mode, options.root);
  return _mode;
}

/** @returns {{input: string, shell: ?string, source: string}} Resolving if needed. */
function mode() {
  return _mode || initInputMode();
}

/**
 * Does this reader touch the screen instead of pointing at it?
 *
 * The gate for everything that is about HANDS: pick radius, tap gestures,
 * camera inertia, long-press, the voice path's audio unlock. A tablet answers
 * yes. A touchscreen laptop with a trackpad answers no.
 * @returns {boolean}
 */
export function isCoarseInput() {
  return mode().input === 'coarse';
}

/**
 * Does this reader get the phone shell?
 *
 * The gate for everything that is about ROOM: the CSS shell, the render and
 * memory ceilings, the boot that skips its flight. Strictly narrower than
 * {@link isCoarseInput} — every phone is coarse, not every coarse device is a
 * phone.
 * @returns {boolean}
 */
export function isPhoneShell() {
  return mode().shell === 'phone';
}

/** @returns {{input: string, shell: ?string, source: string, signals: ?object}} */
export function getInputModeDiagnostics() {
  const resolved = mode();
  return { ...resolved, signals: _signals ? { ..._signals } : null };
}

/** Test seam: forget everything resolved so far. Not used by the app. */
export function resetInputModeForTests() {
  _mode = null;
  _signals = null;
}
