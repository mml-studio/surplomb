/**
 * The showcase page, in the browser: the rotating line, the recorded loop,
 * the dock, and the door to the globe.
 *
 * Loaded by `src/boot.js` only when `html[data-vitrine]` is set, and free of
 * Cesium by construction (its imports are `gate.js`, `rotation.js`,
 * `counters.js` and `../geolocate.js`, whose own graph is two small modules).
 * Everything here works on top of a page that is already readable without it:
 * the form is a native GET to `/?q=`, the examples are links, the list is a
 * list, and the live figures stay hidden until an answer backs them.
 *
 * @module vitrine/vitrine
 */

import { APP_PATH, isWideVitrine, VITRINE_ATTRIBUTE } from './gate.js';
import { createRotation } from './rotation.js';
import { HERO_LOOP } from './heroLoop.js';
import { chooseRendition, neededVideoWidth, probeRenditions } from './renditions.js';
import { scheduleCounters } from './counters.js';
import { canGeolocate, geolocateErrorMessage, requestCurrentPosition } from '../geolocate.js';

/** The page's own theme colour, and the cockpit's (index.html). */
const THEME_VITRINE = '#F7F4EA';
const THEME_COCKPIT = '#0a0a0f';

/** Scroll distance after which the dock is folded (landing.css, § 3.8). */
export const DOCK_FOLD_SCROLL_PX = 360;

/** A loop that has not started playing by then is given up for the poster. */
export const LOOP_START_DEADLINE_MS = 8000;

/** The frozen frame lifts by then even if the cockpit never reports back. */
export const HANDOFF_HARD_DEADLINE_MS = 15000;

/** How long the frozen frame takes to fade (landing.css, `.world`). */
const REVEAL_FADE_MS = 700;

/**
 * Should this visit play the recorded loop at all?
 *
 * Reduced motion: the poster is the page. Data saver or a 2G link: a few
 * megabytes of decoration is not a trade this page gets to make for the reader.
 *
 * @param {{matchMediaRef?: Function, nav?: Navigator}} [refs]
 * @returns {{play: boolean, reason: string}}
 */
export function loopPolicy({
  matchMediaRef = globalThis.matchMedia?.bind(globalThis),
  nav = globalThis.navigator,
} = {}) {
  if (matchMediaRef?.('(prefers-reduced-motion: reduce)')?.matches) return { play: false, reason: 'reduced-motion' };
  const connection = nav?.connection;
  if (connection?.saveData) return { play: false, reason: 'save-data' };
  if (/(^|-)2g$/.test(String(connection?.effectiveType || ''))) return { play: false, reason: 'slow-network' };
  return { play: true, reason: 'ok' };
}

/**
 * Wire the showcase.
 *
 * @param {object} deps
 * @param {() => Promise<object>} deps.loadCockpit Fetches and evaluates the cockpit graph.
 * @param {(options?: object) => Promise<void>} deps.openCockpit Starts it.
 * @param {(error: unknown) => void} [deps.onCockpitError]
 * @param {Document} [deps.documentRef]
 * @returns {null|{open: Function, getDiagnostics: Function, rotation: object}}
 */
export function initVitrine({
  loadCockpit,
  openCockpit,
  onCockpitError = (error) => console.error('[vitrine] cockpit failed:', error),
  documentRef = globalThis.document,
} = {}) {
  const root = documentRef.getElementById('vitrine');
  if (!root) return null;
  const html = documentRef.documentElement;
  const win = documentRef.defaultView || globalThis;
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  setThemeColor(documentRef, THEME_VITRINE);

  // ── The rotating line ──────────────────────────────────────────────────
  const rotation = createRotation(root.querySelector('.discover'), { documentRef });
  cleanups.push(() => rotation?.dispose());

  // ── The recorded loop ──────────────────────────────────────────────────
  const video = root.querySelector('.world-video');
  const loop = { state: 'poster', reason: null, startedAt: null, source: null, rendition: null, still: false, sync: null };
  const setState = (state, reason) => {
    loop.state = state;
    loop.reason = reason;
    root.dataset.state = state;
  };
  const policy = loopPolicy({ nav: win.navigator });
  if (!video) {
    setState('fallback', 'no-video');
  } else if (!policy.play) {
    setState('fallback', policy.reason);
  } else {
    const start = () => {
      startLoop({ video, win, loop, setState, listen, onCleanup: (fn) => cleanups.push(fn) })
        .catch((error) => {
          console.warn('[vitrine] the loop could not start:', error);
          setState('fallback', 'error');
        });
    };
    // After `load`, so the loop never competes with the poster and the type
    // for the first paint.
    if (documentRef.readyState === 'complete') start();
    else listen(win, 'load', start, { once: true });
  }

  // ── The live figures ───────────────────────────────────────────────────
  // One request to /api/pulse, after `load` and at idle; the group stays
  // hidden unless the answer backs at least one figure (src/vitrine/counters.js).
  const counters = scheduleCounters({
    panel: root.querySelector('[data-live="counters"]'),
    win,
    documentRef,
  });
  cleanups.push(() => counters.cancel());

  // « Image fixe » (maquette 2 bis): the reader stops the city moving. The
  // loop is PAUSED on the frame being shown rather than hidden: hiding it would
  // uncover the poster, which is frame 0, and the picture would jump. The box
  // is only on screen while the loop plays (landing.css).
  const stillBox = root.querySelector('#vitrine-still');
  if (stillBox) {
    listen(stillBox, 'change', () => {
      loop.still = stillBox.checked;
      loop.sync?.();
    });
  }

  // ── The dock ───────────────────────────────────────────────────────────
  const form = root.querySelector('form.dock');
  const field = form?.querySelector('input[name="q"]');
  const note = form?.querySelector('[data-dock-note]');
  const label = form?.querySelector('[data-primary-label]');
  const locateButton = form?.querySelector('[data-action="geolocate"]');
  const noteDefault = note?.textContent || '';

  // Browsers without scroll-driven animations get the folded end state from
  // this flag instead (landing.css, `@supports not`).
  const syncScrolled = () => {
    const scrolled = win.scrollY > DOCK_FOLD_SCROLL_PX;
    if (scrolled !== root.hasAttribute('data-scrolled')) root.toggleAttribute('data-scrolled', scrolled);
  };
  listen(win, 'scroll', syncScrolled, { passive: true });
  syncScrolled();

  // Never folded while the reader types. CSS says so with `:has(input:focus)`;
  // this says it for the browsers that do not have `:has()` yet.
  // The FIELD only: a click on the folded button focuses the button in
  // Chrome, and unfolding the dock under the pointer at that moment would
  // throw the button across the screen mid-press.
  if (field && form) {
    listen(field, 'focus', () => form.setAttribute('data-keep-open', ''));
    listen(field, 'blur', () => form.removeAttribute('data-keep-open'));
  }

  if (locateButton && canGeolocate({ nav: win.navigator, secure: win.isSecureContext !== false })) {
    locateButton.disabled = false;
    listen(locateButton, 'click', () => { void locate(); });
  }

  let opening = false;

  async function locate() {
    if (opening) return;
    locateButton?.setAttribute('aria-busy', 'true');
    if (note) note.textContent = 'Recherche de votre position…';
    try {
      // Asked HERE, under the reader's own tap. The cockpit asks again after it
      // boots and gets the same fix back (`maximumAge`), so no coordinate is
      // ever written into the address while the showcase is up — a share link
      // taken afterwards would otherwise say where the reader was.
      await requestCurrentPosition({ geolocation: win.navigator?.geolocation });
      if (note) note.textContent = noteDefault;
      await open({ locate: true });
    } catch (error) {
      if (note) note.textContent = geolocateErrorMessage(error, win.isSecureContext !== false);
    } finally {
      locateButton?.removeAttribute('aria-busy');
    }
  }

  if (form) {
    listen(form, 'submit', (event) => {
      event.preventDefault();
      void open({ query: String(field?.value || '').trim() });
    });
  }

  // An example or a gallery view is a same-document link (`/#v=2&…`): the
  // hash changes and nothing reloads. That IS a request for the cockpit, with
  // the share restore reading the new hash. They point at `/` and not at
  // `/globe` on purpose — the same path is what makes them same-document; the
  // address is moved to `/globe` a line later, by `rewriteAddress`.
  listen(win, 'hashchange', () => {
    if (String(win.location.hash).indexOf('=') < 0) return;
    void open({ viaHash: true });
  });

  // ── The cockpit, fetched early on a wide screen ────────────────────────
  // Evaluating the graph builds nothing (src/main.js no longer starts itself),
  // so a reader who presses the button waits for the globe, not for a
  // megabyte of engine. Not on a phone, and not on a metered link.
  if (wide(win) && policy.reason !== 'save-data' && policy.reason !== 'slow-network') {
    const prefetch = () => { loadCockpit?.().catch(() => { /* retried on press */ }); };
    const idle = () => {
      if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(prefetch, { timeout: 6000 });
      else win.setTimeout(prefetch, 3000);
    };
    if (documentRef.readyState === 'complete') idle();
    else listen(win, 'load', idle, { once: true });
  }

  // ── The door ───────────────────────────────────────────────────────────
  /**
   * Leave the showcase for the globe.
   * @param {{query?: string, locate?: boolean, viaHash?: boolean}} [intent]
   */
  async function open({ query = '', locate: locateOnArrival = false, viaHash = false } = {}) {
    if (opening) return;
    opening = true;
    form?.setAttribute('aria-busy', 'true');
    if (label) label.textContent = 'Ouverture du globe…';
    // `?vitrine=1` forces this page for a demo; once the globe is open it must
    // leave the address, or every share link taken from here would send its
    // recipients to the showcase. The typed text travels as `?q=` on the paths
    // where the cockpit reads it from the address.
    const isWide = wide(win);
    rewriteAddress(win, { query: isWide && !viaHash ? '' : query });

    if (isWide && !viaHash) {
      // Freeze the frame the reader is looking at; the globe boots under it,
      // on the pose that frame was recorded from (src/vitrine/handoff.js).
      const playing = loop.state === 'live' && Number.isFinite(video?.currentTime);
      const videoTime = playing ? video.currentTime : 0;
      video?.pause?.();
      html.setAttribute(VITRINE_ATTRIBUTE, 'opening');
      let revealed = false;
      const reveal = (result) => {
        if (revealed) return;
        revealed = true;
        root.dataset.handoff = 'reveal';
        root.dataset.handoffResult = String(result?.status || 'unknown');
        win.setTimeout(close, REVEAL_FADE_MS);
      };
      win.setTimeout(() => reveal({ status: 'deadline' }), HANDOFF_HARD_DEADLINE_MS);
      try {
        await openCockpit({ fromVitrine: true, locate: locateOnArrival, handoff: { videoTime, query, onReady: reveal } });
      } catch (error) {
        reveal({ status: 'failed' });
        onCockpitError(error);
      }
      return;
    }

    // Phone and tablet (and a link followed from the page): the cockpit's own
    // loading veil takes over at once, and reads `?q=` like the no-JavaScript
    // form would have sent it.
    close();
    try {
      await openCockpit({ fromVitrine: true, locate: locateOnArrival });
    } catch (error) {
      onCockpitError(error);
    }
  }

  function close() {
    for (const cleanup of cleanups.splice(0)) cleanup();
    // `scroll-behavior: smooth` is on the root while the showcase is up; the
    // cockpit needs the document at its origin NOW, before overflow is hidden.
    win.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
    html.removeAttribute(VITRINE_ATTRIBUTE);
    setThemeColor(documentRef, THEME_COCKPIT);
    if (video) {
      video.pause?.();
      video.removeAttribute('src');
      video.load?.();
    }
    // Nothing reads the showcase after this; its pictures are memory.
    root.remove();
  }

  const api = {
    open,
    rotation,
    getDiagnostics: () => ({
      state: root.dataset.state,
      loop: { ...loop, sync: undefined, currentTime: video?.currentTime ?? null, paused: video?.paused ?? null },
      policy,
      opening,
      rotation: rotation?.getDiagnostics() ?? null,
      counters: counters.getState(),
    }),
  };
  win.__gevVitrine = api;
  return api;
}

/**
 * Pick the loop that fits this screen, attach it, and play it. `live` on the
 * first frame actually painted; `fallback` on any failure or after
 * {@link LOOP_START_DEADLINE_MS}.
 *
 * Landscape boxes get the desktop cut, portrait ones the phone cut — the
 * picture is `object-fit: cover`, so the SHAPE decides which crops less. The
 * file within the cut is src/vitrine/renditions.js's call.
 */
async function startLoop({ video, win, loop, setState, listen, onCleanup }) {
  const wideShape = Boolean(win.matchMedia?.('(min-aspect-ratio: 1/1)')?.matches);
  const cut = HERO_LOOP.videos?.[wideShape ? 'desktop' : 'phone'];
  const box = video.closest('.world')?.getBoundingClientRect?.();
  const needed = neededVideoWidth({
    boxWidth: box?.width || win.innerWidth,
    boxHeight: box?.height || win.innerHeight,
    dpr: win.devicePixelRatio,
    videoAspect: cut?.aspect || (wideShape ? 1.6 : 1170 / 2532),
  });
  const probed = await probeRenditions(cut?.renditions, {
    canPlayType: (mime) => video.canPlayType?.(mime) || '',
    mediaCapabilities: win.navigator?.mediaCapabilities ?? null,
    fps: cut?.fps || 30,
  });
  const chosen = chooseRendition(probed, needed);
  if (!chosen) {
    setState('fallback', 'no-playable-source');
    return;
  }
  loop.rendition = { src: chosen.src, codec: chosen.codec, width: chosen.width, needed };
  const giveUp = (reason) => {
    if (loop.state !== 'poster') return;
    setState('fallback', reason);
    video.pause?.();
  };
  const deadline = win.setTimeout(() => giveUp('deadline'), LOOP_START_DEADLINE_MS);
  onCleanup(() => win.clearTimeout(deadline));
  listen(video, 'playing', () => {
    win.clearTimeout(deadline);
    if (loop.state === 'poster') {
      loop.startedAt = Math.round(win.performance?.now?.() ?? 0);
      loop.source = video.currentSrc || null;
      setState('live', 'playing');
      // Ticked before the loop was ready: honour it on the first frame.
      if (loop.still) video.pause?.();
    }
  });
  listen(video, 'error', () => {
    win.clearTimeout(deadline);
    giveUp('error');
  });
  // A hidden tab plays for nobody, and « Image fixe » means stop. (The
  // picture is fixed behind the whole page on every screen since the 2 bis, so
  // it is never scrolled out of view.)
  const sync = () => {
    if (loop.state !== 'live') return;
    if (video.ownerDocument.hidden || loop.still) video.pause?.();
    else void video.play?.()?.catch?.(() => {});
  };
  loop.sync = sync;
  onCleanup(() => { loop.sync = null; });
  listen(video.ownerDocument, 'visibilitychange', sync);
  video.preload = 'auto';
  video.src = chosen.src;
  const played = video.play?.();
  played?.catch?.(() => { win.clearTimeout(deadline); giveUp('autoplay-refused'); });
}

const wide = (win) => isWideVitrine(win.matchMedia?.bind(win));

/**
 * Move the address to the globe's own, in place: `/` → {@link APP_PATH}. Drop
 * `?vitrine=`, set (or drop) `?q=`, keep everything else.
 *
 * This is the whole « two URLs » mechanism. The reader is reading `/`, presses
 * the button, and the address becomes `/globe` with no navigation —
 * `replaceState` rewrites a path without unloading anything, so the frozen
 * frame, the booting engine and the fade all survive it. A different HOST could
 * not have been written this way, which is why the split is two paths of one
 * origin (src/vitrine/gate.js).
 *
 * `replaceState` and not `pushState`: the showcase's DOM is removed by
 * `close()` a moment later, so a Back button that returned to `/` in this same
 * document would have nothing left to show.
 *
 * @param {Window} win
 * @param {{query?: string}} options
 */
function rewriteAddress(win, { query = '' } = {}) {
  const url = new URL(win.location.href);
  url.pathname = APP_PATH;
  url.searchParams.delete('vitrine');
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${win.location.pathname}${win.location.search}${win.location.hash}`) {
    win.history.replaceState(win.history.state ?? null, '', next);
  }
}

function setThemeColor(documentRef, color) {
  documentRef.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
