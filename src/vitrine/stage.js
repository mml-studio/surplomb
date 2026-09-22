/**
 * « Choisissez une vue. » — one scene, six views, and the bar that picks them.
 *
 * The gallery used to be six tiles; it is now one picture at the full width of
 * the page, with the interface at its edges: the heading top left, the place
 * bottom left, the door to the globe bottom right, and a bar of six tabs under
 * it (index.html, `.stage`). This module is the bar and the clock. The loops
 * themselves stay in src/vitrine/gallery.js, which asks {@link createStage}'s
 * `roleOf` which box is on stage and which one is next.
 *
 * THE VIEWS ADVANCE ON THEIR OWN, a whole recording at a time: a view stays for
 * as many passes of its loop as reach {@link STAGE_MIN_DWELL_S} — two of a six-
 * second loop, one of the power-grid film, one of the 29-second Roissy film —
 * so a change never cuts a film in the middle. A view with no recording (stills
 * only: data saver, a failed download) stays {@link STAGE_STILL_DWELL_MS}. The
 * active tab's underline fills in exactly that time.
 *
 * The clock only runs while the scene is on screen, and holds while the pointer
 * rests on it, while the keyboard is inside it, and while the tab is hidden: the
 * first view a reader meets is the first one, from its start. « Mettre en
 * pause » stops the clock AND the picture; reduced motion starts paused, like
 * the rotating line (src/vitrine/rotation.js).
 *
 * The bar follows the ARIA tabs pattern: arrows, Home and End move between the
 * tabs and show their view at once. A pointer resting on a tab for
 * {@link TAB_HOVER_MS} shows its view too — the mock's « survolez les
 * catégories » — and a tap is the same as a click. A view picked this way
 * starts from the beginning of its story, never where it was left
 * (src/vitrine/gallery.js); the first time the reader reaches for the bar, the
 * loops of every view are fetched, so the one they point at is ready.
 *
 * Without JavaScript none of this runs, and landing.css lays the six views out
 * one under the other (`@media (scripting: none)`).
 *
 * @module vitrine/stage
 */

import messages from './vitrine.i18n.js';

/** A recording plays whole: as many passes as reach this, never fewer than one. */
export const STAGE_MIN_DWELL_S = 10;

/** A view with nothing to time it (no loop, or none yet) stays this long. */
export const STAGE_STILL_DWELL_MS = 8000;

/**
 * How long the pointer rests on a tab before its view comes up: a pointer
 * crossing the bar on its way to the button must not flick through three views.
 */
export const TAB_HOVER_MS = 120;

/** How much of the scene must be on screen for the clock to run. */
export const STAGE_ON_SCREEN_RATIO = 0.5;

/**
 * How long a view stays on stage, from its recording's length. Pure.
 * @param {?number} durationS
 * @param {{minS?: number, stillMs?: number}} [options]
 * @returns {number} milliseconds
 */
export function stageDwellMs(durationS, { minS = STAGE_MIN_DWELL_S, stillMs = STAGE_STILL_DWELL_MS } = {}) {
  if (!(durationS > 0)) return stillMs;
  const passes = Math.max(1, Math.ceil(minS / durationS - 1e-9));
  return Math.round(passes * durationS * 1000);
}

/**
 * The index a key press moves the selection to, or null when the key is not
 * one the tab bar answers. Pure.
 * @param {string} key
 * @param {number} index
 * @param {number} count
 */
export function tabIndexForKey(key, index, count) {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * Wire the scene inside `section`.
 * @param {HTMLElement|null} section The `.gallery` section.
 * @param {{documentRef?: Document, durationOf?: (view: Element) => ?number}} [options]
 *   `durationOf` gives a view's recording length in seconds; it can be set later
 *   with `setDurationSource`, once the loops' list has been fetched.
 * @returns {null|object}
 */
export function createStage(section, {
  documentRef = globalThis.document,
  durationOf = () => null,
} = {}) {
  const stage = section?.querySelector('.stage');
  if (!stage) return null;
  const views = [...stage.querySelectorAll('.stage-views > .view')];
  const tablist = stage.querySelector('.stage-tabs');
  const tabs = views.map((view) => tablist?.querySelector(`[data-tab="${view.dataset.view}"]`));
  if (views.length < 2 || tabs.some((tab) => !tab)) return null;
  const win = documentRef.defaultView || globalThis;
  const pauseButton = stage.querySelector('[data-stage-pause]');
  const pauseLabel = pauseButton?.querySelector('[data-stage-pause-label]');
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  let current = Math.max(0, views.findIndex((view) => view.hasAttribute('data-active')));
  let pausedByReader = Boolean(reduced?.matches);
  let hovered = false;
  let focused = false;
  let onScreen = typeof win.IntersectionObserver !== 'function';
  let timer = null;
  let hoverTimer = null;
  let startedAt = 0;
  let remaining = 0;
  let fresh = true;
  let dwell = 0;
  let switches = 0;
  let lastBy = 'initial';
  let durationSource = durationOf;
  let browsing = false;
  const subscribers = new Set();
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const now = () => win.performance?.now?.() ?? Date.now();
  const running = () => !pausedByReader && !hovered && !focused && onScreen && !documentRef.hidden;
  const emit = (event) => { for (const fn of subscribers) fn(event); };

  // ── Markup: the tabs pattern, set here so a page without JavaScript never
  // announces tabs it cannot switch.
  tablist.setAttribute('role', 'tablist');
  views.forEach((view, i) => {
    const tab = tabs[i];
    const key = view.dataset.view;
    view.id ||= `vue-${key}`;
    tab.id ||= `vue-${key}-onglet`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', view.id);
    view.setAttribute('role', 'tabpanel');
    view.setAttribute('aria-labelledby', tab.id);
  });
  if (pauseButton) pauseButton.hidden = false;
  stage.dataset.enhanced = 'true';

  function dwellFor(index) {
    let seconds = null;
    try {
      seconds = durationSource?.(views[index]) ?? null;
    } catch {
      seconds = null;
    }
    return stageDwellMs(seconds);
  }

  function setFuse(ms) {
    dwell = ms;
    stage.style.setProperty('--stage-dwell', `${ms}ms`);
  }

  function paint() {
    views.forEach((view, i) => {
      const active = i === current;
      view.toggleAttribute('data-active', active);
      view.inert = !active;
      view.setAttribute('aria-hidden', String(!active));
      const tab = tabs[i];
      tab.toggleAttribute('data-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  function syncFlags() {
    stage.toggleAttribute('data-rotating', !pausedByReader);
    stage.toggleAttribute('data-running', running());
  }

  function arm() {
    syncFlags();
    if (timer !== null || !running()) return;
    if (fresh) {
      // The first run of this view's clock: its recording may have become
      // known since it came up (the loops' list is fetched late).
      fresh = false;
      remaining = dwellFor(current);
      setFuse(remaining);
    }
    startedAt = now();
    timer = win.setTimeout(() => {
      timer = null;
      select((current + 1) % views.length, 'auto');
    }, remaining);
  }

  function hold() {
    if (timer !== null) {
      win.clearTimeout(timer);
      timer = null;
      remaining = Math.max(0, remaining - (now() - startedAt));
    }
    syncFlags();
  }

  function select(index, by) {
    if (!(index >= 0 && index < views.length)) return;
    if (index === current && by !== 'auto') return;
    if (timer !== null) {
      win.clearTimeout(timer);
      timer = null;
    }
    current = index;
    switches += 1;
    lastBy = by;
    fresh = true;
    setFuse(dwellFor(index));
    paint();
    emit({ type: 'select', index, view: views[index], by });
    arm();
  }

  function updatePauseButton() {
    if (!pauseButton) return;
    const m = messages();
    const label = pausedByReader ? m.resume : m.pause;
    if (pauseLabel) pauseLabel.textContent = label;
    else pauseButton.setAttribute('aria-label', label);
    pauseButton.setAttribute('aria-pressed', String(pausedByReader));
  }

  function setPaused(value) {
    const next = Boolean(value);
    if (next === pausedByReader) return;
    pausedByReader = next;
    updatePauseButton();
    if (running()) arm();
    else hold();
    emit({ type: 'pause', paused: pausedByReader });
  }

  // ── The reader ────────────────────────────────────────────────────────
  views.forEach((view, i) => {
    const tab = tabs[i];
    listen(tab, 'click', () => select(i, 'click'));
    // A touch "enter" is the start of a tap, and the tap is the click.
    listen(tab, 'pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      win.clearTimeout(hoverTimer);
      hoverTimer = win.setTimeout(() => select(i, 'hover'), TAB_HOVER_MS);
    });
    listen(tab, 'pointerleave', () => win.clearTimeout(hoverTimer));
  });
  // A reader reaching for the bar is about to browse: the loops fetch every
  // view then, so the one they point at is ready at its opening (gallery.js).
  const browse = () => {
    if (browsing) return;
    browsing = true;
    emit({ type: 'browse' });
  };
  listen(tablist, 'pointerenter', browse);
  listen(tablist, 'pointerdown', browse);
  listen(tablist, 'focusin', browse);
  listen(tablist, 'keydown', (event) => {
    const index = tabIndexForKey(event.key, current, views.length);
    if (index === null) return;
    event.preventDefault();
    select(index, 'keyboard');
    tabs[index].focus?.();
  });
  listen(pauseButton, 'click', () => setPaused(!pausedByReader));
  listen(stage, 'pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    hold();
  });
  listen(stage, 'pointerleave', () => {
    hovered = false;
    arm();
  });
  // The keyboard only: a mouse click leaves focus on a tab in Chrome, and that
  // must not stop the clock for good.
  listen(stage, 'focusin', (event) => {
    if (!event.target?.matches?.(':focus-visible')) return;
    focused = true;
    hold();
  });
  listen(stage, 'focusout', (event) => {
    if (stage.contains(event.relatedTarget)) return;
    focused = false;
    arm();
  });
  listen(documentRef, 'visibilitychange', () => (documentRef.hidden ? hold() : arm()));
  listen(reduced, 'change', () => setPaused(Boolean(reduced?.matches)));

  if (typeof win.IntersectionObserver === 'function') {
    const observer = new win.IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const next = entry.isIntersecting && entry.intersectionRatio >= STAGE_ON_SCREEN_RATIO;
      if (next === onScreen) return;
      onScreen = next;
      if (onScreen) arm();
      else hold();
      emit({ type: 'screen', onScreen });
    }, { threshold: [0, STAGE_ON_SCREEN_RATIO] });
    observer.observe(stage);
    cleanups.push(() => observer.disconnect());
  }

  setFuse(dwellFor(current));
  paint();
  updatePauseButton();
  arm();

  return {
    element: stage,
    select: (index) => select(index, 'api'),
    next: () => select((current + 1) % views.length, 'api'),
    setPaused,
    isPaused: () => pausedByReader,
    isOnScreen: () => onScreen,
    /** The reader has reached for the bar: every view is worth fetching. */
    isBrowsing: () => browsing,
    /**
     * What a box is to the scene: `active`, `next` (fetched ahead of its
     * turn), `idle`, or null when it is not one of the scene's views.
     * @param {?Element} view
     */
    roleOf(view) {
      const index = views.indexOf(view);
      if (index < 0) return null;
      if (index === current) return 'active';
      return index === (current + 1) % views.length ? 'next' : 'idle';
    },
    /** @param {(event: {type: string}) => void} fn @returns {() => void} */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** @param {(view: Element) => ?number} fn */
    setDurationSource(fn) {
      durationSource = fn;
      const next = dwellFor(current);
      // Not started yet: the view simply takes its recording's length.
      if (fresh) {
        setFuse(next);
        return;
      }
      if (next === dwell) return;
      // Started on a still's time because the scene came on screen before the
      // loops' list arrived (a jump straight to it): the view keeps what it has
      // already had and gets the rest of its recording, and the underline —
      // whose animation keeps its elapsed time — redraws at the true fraction.
      hold();
      remaining = Math.max(0, remaining + next - dwell);
      setFuse(next);
      arm();
    },
    dispose() {
      win.clearTimeout(timer);
      win.clearTimeout(hoverTimer);
      timer = null;
      for (const off of cleanups.splice(0)) off();
      subscribers.clear();
    },
    getDiagnostics: () => ({
      index: current,
      view: views[current]?.dataset.view ?? null,
      count: views.length,
      paused: pausedByReader,
      running: running(),
      onScreen,
      hovered,
      focused,
      dwellMs: dwell,
      remainingMs: timer === null ? Math.round(fresh ? dwell : remaining)
        : Math.round(Math.max(0, remaining - (now() - startedAt))),
      switches,
      lastBy,
      browsing,
    }),
  };
}
