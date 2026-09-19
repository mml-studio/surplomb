/**
 * « En ce moment au-dessus de la France » — the four live figures, filled from
 * `/api/pulse` once the page is read.
 *
 * The markup ships hidden (index.html): the group and each entry carry
 * `hidden`, and `data-value` is empty. This module asks once, after the first
 * screen is painted and the page is idle, and reveals only what the answer
 * backs: an entry with a positive whole number no older than the server's
 * window, and the group only if at least one entry is. A failed request, an
 * error status, an answer of the wrong shape: nothing changes, nothing is said.
 * The rules behind each figure are the server's (src/data/pulse.js); this side
 * re-checks them anyway, because a figure on this page is a claim — and keeps
 * checking: « en ce moment » read by someone who left the tab open for an hour
 * is a lie, so each figure is taken down when it leaves the window, and the
 * group with the last one. One request per visit, never a refresh loop.
 *
 * @module vitrine/counters
 */

export const PULSE_URL = '/api/pulse';

/** The request is abandoned after this; the group simply stays hidden. */
export const PULSE_TIMEOUT_MS = 8000;

/** `counter:<key>` in the markup ↔ `<key>` in the answer. */
const COUNTER_PREFIX = 'counter:';

const FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/**
 * The figure one entry of the answer backs, or null.
 *
 * @param {unknown} entry `{value, at}` from the answer.
 * @param {{builtAt: number, maxAgeMs: number}} clock The answer's own clock.
 *   Both times are the server's, so a reader's wrong clock cannot hide or
 *   revive a figure.
 * @returns {?number}
 */
export function counterValue(entry, { builtAt, maxAgeMs }) {
  const value = entry?.value;
  if (!Number.isInteger(value) || value <= 0) return null;
  const at = Date.parse(entry?.at ?? '');
  if (!Number.isFinite(at) || !Number.isFinite(builtAt) || !(maxAgeMs > 0)) return null;
  if (builtAt - at > maxAgeMs) return null;
  return value;
}

/**
 * Write an answer into the group.
 *
 * @param {Element} panel `section[data-live="counters"]`.
 * @param {unknown} pulse The parsed `/api/pulse` answer.
 * @param {{elapsedMs?: number}} [options] Time since the answer arrived, on
 *   the page's monotonic clock: the answer ages while it is on screen.
 * @returns {string[]} The keys now shown, in page order.
 */
export function applyPulse(panel, pulse, { elapsedMs = 0 } = {}) {
  const shown = [];
  if (!panel) return shown;
  const clock = {
    builtAt: Date.parse(pulse?.at ?? '') + elapsedMs,
    maxAgeMs: Number(pulse?.maxAgeMs),
  };
  for (const counter of panel.querySelectorAll('.counter')) {
    const slot = counter.querySelector(`[data-live^="${COUNTER_PREFIX}"]`);
    const key = slot?.getAttribute('data-live')?.slice(COUNTER_PREFIX.length);
    const value = key && pulse && typeof pulse === 'object' ? counterValue(pulse[key], clock) : null;
    if (value === null) {
      counter.hidden = true;
      counter.setAttribute('data-value', '');
      if (slot) slot.textContent = '';
      continue;
    }
    counter.setAttribute('data-value', String(value));
    slot.textContent = FORMAT.format(value);
    counter.hidden = false;
    shown.push(key);
  }
  panel.hidden = shown.length === 0;
  return shown;
}

/**
 * How long until the first of these figures leaves the window, or null.
 *
 * @param {object} pulse The answer.
 * @param {string[]} keys The figures on screen.
 * @param {number} [elapsedMs] Time since the answer arrived.
 * @returns {?number}
 */
export function nextExpiryMs(pulse, keys, elapsedMs = 0) {
  const builtAt = Date.parse(pulse?.at ?? '') + elapsedMs;
  const maxAgeMs = Number(pulse?.maxAgeMs);
  let next = null;
  for (const key of keys || []) {
    const left = maxAgeMs - (builtAt - Date.parse(pulse?.[key]?.at ?? ''));
    if (Number.isFinite(left) && (next === null || left < next)) next = Math.max(0, left);
  }
  return next;
}

/**
 * Ask once, after the page has loaded and gone idle, and fill the group.
 *
 * @param {object} deps
 * @param {Element|null} deps.panel
 * @param {Window} deps.win
 * @param {Document} deps.documentRef
 * @param {typeof fetch} [deps.fetchRef]
 * @param {(state: object) => void} [deps.onSettled] Told how it ended, for diagnostics.
 * @returns {{cancel: () => void, getState: () => object}}
 */
export function scheduleCounters({ panel, win, documentRef, fetchRef = win?.fetch?.bind(win), onSettled }) {
  const state = { phase: 'waiting', status: null, shown: [] };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  /** @type {?{idle: boolean, id: number}} */
  let pending = null;
  let timer = null;
  let expiry = null;
  const clockMs = () => win.performance?.now?.() ?? Date.now();
  let cancelled = false;
  const settle = (phase, extra = {}) => {
    Object.assign(state, { phase, ...extra });
    onSettled?.({ ...state });
  };

  async function ask() {
    pending = null;
    if (cancelled || !panel || typeof fetchRef !== 'function') return settle('skipped');
    state.phase = 'loading';
    timer = win.setTimeout(() => controller?.abort(), PULSE_TIMEOUT_MS);
    try {
      const response = await fetchRef(PULSE_URL, {
        signal: controller?.signal,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      state.status = response.status;
      if (!response.ok) return settle('failed');
      const pulse = await response.json();
      if (cancelled) return settle('cancelled');
      const receivedAt = clockMs();
      const age = () => {
        expiry = null;
        if (cancelled) return;
        const elapsedMs = clockMs() - receivedAt;
        const shown = applyPulse(panel, pulse, { elapsedMs });
        settle('done', { shown });
        const wait = nextExpiryMs(pulse, shown, elapsedMs);
        // A millisecond past the edge, so the check that runs is the one that
        // takes the figure down.
        if (wait !== null) expiry = win.setTimeout(age, wait + 1);
      };
      age();
    } catch {
      settle(cancelled ? 'cancelled' : 'failed');
    } finally {
      win.clearTimeout(timer);
    }
  }

  // After `load`, then at idle: the figures are below the first screen, and
  // must never compete with the poster, the type or the loop for it.
  const whenIdle = () => {
    if (cancelled) return;
    if (typeof win.requestIdleCallback === 'function') {
      pending = { idle: true, id: win.requestIdleCallback(() => { void ask(); }, { timeout: 4000 }) };
    } else {
      pending = { idle: false, id: win.setTimeout(() => { void ask(); }, 1500) };
    }
  };
  if (documentRef.readyState === 'complete') whenIdle();
  else win.addEventListener('load', whenIdle, { once: true });

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      win.removeEventListener('load', whenIdle);
      if (pending?.idle) win.cancelIdleCallback?.(pending.id);
      else if (pending) win.clearTimeout(pending.id);
      pending = null;
      if (expiry !== null) win.clearTimeout(expiry);
      expiry = null;
      controller?.abort();
    },
    getState: () => ({ ...state }),
  };
}
