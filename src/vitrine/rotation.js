/**
 * « Tout commence par un lieu » — the line that changes every three seconds.
 *
 * PLAN § 3.8: Memel had not noticed that it changed at all. Three cues fix
 * that without shaking the page: the example slides (the outgoing one rises
 * 12 px and fades, the incoming one arrives from below, 350 ms), a 2 px fuse
 * under it fills in exactly the time left, and an index says « 2 / 7 ».
 *
 * THE CLOCK IS HERE, NOT IN THE CSS. The fuse is a CSS animation restarted on
 * every change and paused with the rotation, but the change itself is a
 * timer with its own remaining-time bookkeeping: under reduced motion the
 * animation does not run at all, and a « Reprendre » pressed there must still
 * advance every three seconds.
 *
 * Pauses: the button, a pointer over the list, keyboard focus inside it, a
 * hidden tab. Reduced motion starts paused. The reserved « permis » example
 * (`data-pending`) is never shown.
 *
 * @module vitrine/rotation
 */

import messages from './vitrine.i18n.js';

/** One example on screen, in milliseconds (the spec's « 3 secondes »). */
export const ROTATION_PERIOD_MS = 3000;

/** How long an example takes to leave (landing.css). */
export const ROTATION_SWAP_MS = 350;

/**
 * Wire the rotating line inside `section`.
 * @param {HTMLElement|null} section The `.discover` panel.
 * @param {{documentRef?: Document, periodMs?: number}} [options]
 * @returns {null|{next: Function, setPaused: Function, dispose: Function, getDiagnostics: Function}}
 */
export function createRotation(section, {
  documentRef = globalThis.document,
  periodMs = ROTATION_PERIOD_MS,
} = {}) {
  const list = section?.querySelector('.examples');
  if (!list) return null;
  const win = documentRef.defaultView || globalThis;
  const items = [...list.children].filter((item) => item.tagName === 'LI');
  const available = items.filter((item) => !item.hasAttribute('data-pending'));
  if (available.length < 2) return null;

  const controls = section.querySelector('.example-controls');
  const pauseButton = section.querySelector('[data-examples-pause]');
  const nextButton = section.querySelector('[data-examples-next]');
  const indexLabel = section.querySelector('[data-examples-index]');
  const fuse = section.querySelector('.examples-progress');
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  let current = 0;
  let pausedByReader = Boolean(reduced?.matches);
  let hovered = false;
  let focused = false;
  let timer = null;
  let leaveTimer = null;
  let startedAt = 0;
  let remaining = periodMs;
  let swaps = 0;
  const listeners = [];
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };

  list.dataset.enhanced = 'true';
  if (controls) controls.hidden = false;
  if (fuse) {
    fuse.hidden = false;
    fuse.style.setProperty('--fuse-ms', `${periodMs}ms`);
  }

  const now = () => win.performance?.now?.() ?? Date.now();
  const running = () => !pausedByReader && !hovered && !focused && !documentRef.hidden;

  function paint({ leaving = null } = {}) {
    for (const item of items) {
      const active = item === available[current];
      item.toggleAttribute('data-active', active);
      item.toggleAttribute('data-leaving', item === leaving);
      item.inert = !active;
      item.setAttribute('aria-hidden', String(!active));
    }
    if (indexLabel) indexLabel.textContent = `${current + 1} / ${available.length}`;
  }

  function restartFuse() {
    if (!fuse) return;
    fuse.removeAttribute('data-running');
    // Reading layout between the two writes is what restarts a CSS animation.
    void fuse.offsetWidth;
    fuse.setAttribute('data-running', '');
  }

  function syncFuse() {
    fuse?.toggleAttribute('data-paused', !running());
  }

  function arm() {
    syncFuse();
    // Already counting down: a second arm (pointerleave after a focus loss,
    // say) must not restart the clock while the fuse keeps its place.
    if (timer !== null || !running()) return;
    startedAt = now();
    timer = win.setTimeout(() => {
      timer = null;
      advance();
    }, remaining);
  }

  function hold() {
    if (timer === null) {
      syncFuse();
      return;
    }
    win.clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (now() - startedAt));
    syncFuse();
  }

  function advance() {
    const leaving = available[current];
    current = (current + 1) % available.length;
    swaps += 1;
    list.setAttribute('data-swapping', '');
    paint({ leaving });
    win.clearTimeout(leaveTimer);
    leaveTimer = win.setTimeout(() => {
      leaving.removeAttribute('data-leaving');
      list.removeAttribute('data-swapping');
    }, ROTATION_SWAP_MS);
    remaining = periodMs;
    restartFuse();
    arm();
  }

  function updatePauseButton() {
    if (!pauseButton) return;
    const m = messages();
    pauseButton.textContent = pausedByReader ? m.resume : m.pause;
    pauseButton.setAttribute('aria-pressed', String(pausedByReader));
  }

  function setPaused(value) {
    pausedByReader = Boolean(value);
    updatePauseButton();
    if (running()) arm();
    else hold();
  }

  listen(pauseButton, 'click', () => setPaused(!pausedByReader));
  listen(nextButton, 'click', () => {
    hold();
    advance();
  });
  listen(list, 'pointerenter', () => { hovered = true; hold(); });
  listen(list, 'pointerleave', () => { hovered = false; arm(); });
  listen(list, 'focusin', () => { focused = true; hold(); });
  listen(list, 'focusout', (event) => {
    if (list.contains(event.relatedTarget)) return;
    focused = false;
    arm();
  });
  listen(documentRef, 'visibilitychange', () => (documentRef.hidden ? hold() : arm()));
  listen(reduced, 'change', () => setPaused(Boolean(reduced?.matches)));

  paint();
  updatePauseButton();
  restartFuse();
  arm();

  return {
    next: () => { hold(); advance(); },
    setPaused,
    dispose() {
      win.clearTimeout(timer);
      win.clearTimeout(leaveTimer);
      for (const off of listeners.splice(0)) off();
    },
    getDiagnostics: () => ({
      index: current,
      count: available.length,
      paused: pausedByReader,
      running: running(),
      swaps,
      remainingMs: timer === null ? Math.round(remaining) : Math.round(Math.max(0, remaining - (now() - startedAt))),
      activeText: available[current]?.textContent?.trim() || '',
    }),
  };
}
