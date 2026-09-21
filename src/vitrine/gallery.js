/**
 * The gallery's loops, in the browser: the six views of « Choisissez une
 * vue. » and the voice answer, recorded from the app
 * (scripts/capture-landing-gallery.mjs), each one over its still.
 *
 * A reader who never scrolls that far never pays for them. A box's loop is
 * fetched only when the box comes within {@link LOAD_AHEAD} of the screen,
 * played only while it is on screen, and paused the moment it leaves, when
 * the tab is hidden, or when the reader ticks « Image fixe ». Until its first
 * frame is painted the still stays in front; the loop then fades in over it
 * (landing.css, `[data-loop="live"]`) — frame 0 IS the still, so the fade
 * only starts the motion.
 *
 * Whether loops play at all is the page's call, made once for the hero and
 * the gallery alike (`loopPolicy` in src/vitrine/vitrine.js): reduced motion,
 * data saver or a 2G link keep every still. A browser that cannot play a
 * rendition, refuses to autoplay (iOS in Low Power Mode) or fails a download
 * keeps that box's still, and the video element goes.
 *
 * The six views of the gallery share one scene (src/vitrine/stage.js): only
 * the view on stage plays, and only it and the next one in line are fetched —
 * the others wait for their turn. A view comes up from the start of its
 * story ({@link openingOf}) every time, never where it was left, so the
 * scene's clock and the film agree on where it ends. The voice answer is not
 * part of the scene and keeps the rules above.
 *
 * @module vitrine/gallery
 */

import { GALLERY_LOOPS } from './galleryLoops.js';
import { chooseRendition, neededVideoWidth, probeRenditions } from './renditions.js';

/**
 * How close a box must come before its loop is fetched: half a screen above
 * or below. Far enough that a reader scrolling at reading speed finds it
 * playing; near enough that the first screen of a phone never fetches one.
 */
export const LOAD_AHEAD = '50% 0px 50% 0px';

/** How much of a box must be on screen for its loop to play. */
export const PLAY_THRESHOLD = 0.15;

/**
 * How long a view that comes on stage holds its first frame before it plays:
 * the scene fades it in over 700 ms (landing.css), and a story that started
 * under the fade would lose its opening — the power-grid film shows France
 * dark for barely half a second before it switches on.
 */
export const STAGE_ENTRY_HOLD_MS = 400;

/**
 * The device pixel ratio a loop is chosen for, at most. The phone's scene is
 * cropped to 4:3, so at its native 3 it asked for the 1440 — 5.2 MB for the
 * Roissy film — for a sharpness a moving picture of 390 CSS px does not show;
 * at 2 it takes the 960, like the phone's stills (index.html). A Retina
 * laptop is 2 already and loses nothing.
 */
export const LOOP_MAX_DPR = 2;

/**
 * What a box of the scene should be doing, from its role there
 * (src/vitrine/stage.js `roleOf`): fetched only when it is on stage or next in
 * line — or, once the reader has reached for the tab bar, all of them, so the
 * view they point at is ready — and played only when it is on stage and the
 * scene is on screen. A box outside the scene (role null) keeps its own
 * reading. Pure.
 *
 * @param {{near: boolean, visible: boolean}} item
 * @param {?('active'|'next'|'idle')} role
 * @param {boolean} [stageOnScreen]
 * @param {boolean} [browsing]
 * @returns {{near: boolean, visible: boolean}}
 */
export function stageGate(item, role, stageOnScreen = true, browsing = false) {
  if (role === null || role === undefined) return { near: item.near, visible: item.visible };
  return {
    near: item.near && (role !== 'idle' || Boolean(browsing)),
    visible: item.visible && role === 'active' && Boolean(stageOnScreen),
  };
}

/**
 * Where a recording's story begins, in seconds into its file. A loop begins
 * at 0. The power-grid film was turned round so that its still — frame 0, all
 * a reader on stills ever sees — shows the grid lit (scripts/build-landing-
 * film.mjs `--start`); its story, Europe dark and France lighting up, begins
 * `openingS` into the file. Pure.
 * @param {?{durationS?: number, openingS?: number}} loop
 */
export function openingOf(loop) {
  const opening = Number(loop?.openingS) || 0;
  return opening > 0 && !(opening >= Number(loop?.durationS)) ? opening : 0;
}

/**
 * What a box should be doing, from what is known about it. Pure, so the
 * rules are pinned in gallery.test.mjs rather than rediscovered in a browser.
 *
 * @param {{state: string, near: boolean, visible: boolean}} item
 * @param {{still: boolean, hidden: boolean}} page
 * @returns {'attach'|'play'|'pause'|'wait'}
 */
export function nextStep(item, { still, hidden }) {
  if (item.state === 'fallback') return 'wait';
  if (item.state === 'still') return item.near && !still && !hidden ? 'attach' : 'wait';
  return item.visible && !still && !hidden ? 'play' : 'pause';
}

/**
 * Wire the loops of every `[data-media]` box that has one.
 *
 * @param {object} deps
 * @param {Element} deps.root `#vitrine`
 * @param {Window} [deps.win]
 * @param {() => boolean} [deps.isStill] « Image fixe » is ticked.
 * @param {object} [deps.loops] `GALLERY_LOOPS.loops`, injectable for tests.
 * @param {?object} [deps.stage] The scene (src/vitrine/stage.js), or null.
 * @returns {{sync: Function, dispose: Function, durationOf: Function, getDiagnostics: Function}}
 */
export function initGalleryLoops({
  root,
  win = globalThis,
  isStill = () => false,
  loops = GALLERY_LOOPS.loops,
  stage = null,
} = {}) {
  const doc = root.ownerDocument;
  const items = [];
  for (const box of root.querySelectorAll('[data-media]')) {
    const loop = loops?.[box.dataset.media];
    if (!loop?.renditions?.length) continue;
    const view = box.closest?.('.view') || null;
    items.push({ key: box.dataset.media, box, loop, state: 'still', near: false, visible: false,
      video: null, rendition: null, reason: null, view, heldUntil: 0, holdTimer: null });
  }
  const Observer = win.IntersectionObserver;
  const cleanups = [];
  const roleOf = (item) => stage?.roleOf?.(item.view) ?? null;
  // « Mettre en pause » on the scene stops its picture, not the voice answer's.
  const page = (item) => ({
    still: Boolean(isStill()) || (roleOf(item) !== null && Boolean(stage?.isPaused?.())),
    hidden: Boolean(doc.hidden),
  });

  const drop = (video) => {
    video.pause?.();
    video.removeAttribute('src');
    video.load?.();
    video.remove();
  };

  const fail = (item, reason) => {
    item.state = 'fallback';
    item.reason = reason;
    item.box.dataset.loop = 'fallback';
    const { video } = item;
    item.video = null;
    if (video) drop(video);
  };

  /** A muted, looping, inline video element for `src`, not yet in the page. */
  const createVideo = (src) => {
    const video = doc.createElement('video');
    video.className = 'loop-video';
    // Muted as a property AND an attribute: iOS reads the attribute to allow
    // an inline autoplay, Chrome the property.
    video.muted = true;
    video.defaultMuted = true;
    for (const name of ['muted', 'loop', 'playsinline', 'disablepictureinpicture', 'disableremoteplayback']) {
      video.setAttribute(name, '');
    }
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.preload = 'auto';
    if (src) video.src = src;
    return video;
  };

  const play = (item) => {
    const { video } = item;
    if (!video || !video.paused) return;
    const played = video.play?.();
    played?.catch?.((error) => {
      // Paused again before it started: nothing wrong. Refused: this browser
      // will not move pictures on its own (iOS Low Power Mode), keep the still.
      if (error?.name === 'NotAllowedError') fail(item, 'autoplay-refused');
    });
  };

  const now = () => win.performance?.now?.() ?? Date.now();
  const sync = (item) => {
    const gate = stageGate(item, roleOf(item), stage?.isOnScreen?.() ?? true, stage?.isBrowsing?.() ?? false);
    const step = nextStep({ state: item.state, ...gate }, page(item));
    if (step === 'attach') void attach(item);
    // Just on stage: its first frame waits for the fade (STAGE_ENTRY_HOLD_MS).
    else if (step === 'play' && item.heldUntil > now()) item.video?.pause?.();
    else if (step === 'play') play(item);
    else if (step === 'pause') item.video?.pause?.();
  };
  const syncAll = () => { for (const item of items) sync(item); };

  async function attach(item) {
    item.state = 'loading';
    item.box.dataset.loop = 'loading';
    const rect = item.box.getBoundingClientRect();
    const needed = neededVideoWidth({
      boxWidth: rect.width,
      boxHeight: rect.height,
      dpr: Math.min(LOOP_MAX_DPR, Number(win.devicePixelRatio) || 1),
      videoAspect: item.loop.aspect,
    });
    const video = createVideo(null);
    // Its still is frame 0, not its opening: a fade from one to the other
    // would show the grid lit, dark and lit again. It cuts instead (landing.css).
    if (openingOf(item.loop)) video.setAttribute('data-cut', '');
    let probed = [];
    try {
      probed = await probeRenditions(item.loop.renditions, {
        canPlayType: (mime) => video.canPlayType?.(mime) || '',
        mediaCapabilities: win.navigator?.mediaCapabilities ?? null,
        fps: item.loop.fps || 30,
      });
    } catch {
      probed = [];
    }
    const chosen = chooseRendition(probed, needed);
    if (!chosen || item.state !== 'loading') {
      if (item.state === 'loading') fail(item, 'no-playable-source');
      return;
    }
    item.rendition = { src: chosen.src, codec: chosen.codec, width: chosen.width, needed };
    const still = item.box.querySelector('img');
    const poster = still?.currentSrc || still?.getAttribute('src');
    if (poster) video.poster = poster;
    video.addEventListener('playing', () => {
      if (item.state !== 'loading') return;
      item.state = 'live';
      item.box.dataset.loop = 'live';
    });
    video.addEventListener('error', () => { if (item.video === video) fail(item, 'error'); });
    // After the still (a `<picture>` or a bare `<img>`), before the credit.
    const anchor = item.box.querySelector(':scope > picture') || still;
    if (anchor) anchor.after(video);
    else item.box.prepend(video);
    item.video = video;
    video.src = chosen.src;
    // A film whose story does not begin at frame 0 is cued there before its
    // first frame is shown (a seek before the metadata is the start position).
    const opening = openingOf(item.loop);
    if (opening) {
      cue(video, opening);
      video.addEventListener('loadedmetadata', () => {
        if (video.paused && video.currentTime < 0.05) cue(video, opening);
      }, { once: true });
      // Shown as soon as its opening frame is decoded, before it plays: the
      // still under it is frame 0, the grid lit, and a view held on its first
      // frame while it fades in (STAGE_ENTRY_HOLD_MS) must hold on Europe dark.
      const shown = () => {
        if (video.readyState >= 2 && Math.abs(video.currentTime - opening) < 0.25) video.setAttribute('data-cued', '');
      };
      video.addEventListener('seeked', shown);
      video.addEventListener('loadeddata', shown);
    }
    sync(item);
  }

  function cue(video, seconds) {
    try {
      video.currentTime = seconds;
    } catch {
      // Not seekable yet: `loadedmetadata` cues it again.
    }
  }

  // ── The scene ─────────────────────────────────────────────────────────
  // A view that comes on stage — picked by the pointer, a tap, the keyboard
  // or the clock — starts from the beginning of its story, never where it was
  // left: the scene's clock counts whole passes (src/vitrine/stage.js), and a
  // reader who points at « Énergie » is shown France switching on.
  if (stage?.subscribe) {
    const off = stage.subscribe((event) => {
      if (event.type === 'select') {
        const item = items.find((candidate) => candidate.view === event.view);
        if (item) {
          if (item.video) cue(item.video, openingOf(item.loop));
          item.heldUntil = now() + STAGE_ENTRY_HOLD_MS;
          win.clearTimeout?.(item.holdTimer);
          item.holdTimer = win.setTimeout?.(() => {
            item.holdTimer = null;
            sync(item);
          }, STAGE_ENTRY_HOLD_MS);
        }
      }
      syncAll();
    });
    cleanups.push(off);
    cleanups.push(() => { for (const item of items) win.clearTimeout?.(item.holdTimer); });
  }

  if (typeof Observer === 'function' && items.length) {
    const byBox = new Map(items.map((item) => [item.box, item]));
    const near = new Observer((entries) => {
      for (const entry of entries) {
        const item = byBox.get(entry.target);
        if (!item) continue;
        item.near = entry.isIntersecting;
        sync(item);
      }
    }, { rootMargin: LOAD_AHEAD });
    const seen = new Observer((entries) => {
      for (const entry of entries) {
        const item = byBox.get(entry.target);
        if (!item) continue;
        item.visible = entry.isIntersecting && entry.intersectionRatio >= PLAY_THRESHOLD;
        sync(item);
      }
    }, { threshold: [0, PLAY_THRESHOLD] });
    for (const item of items) {
      near.observe(item.box);
      seen.observe(item.box);
    }
    cleanups.push(() => { near.disconnect(); seen.disconnect(); });
    doc.addEventListener('visibilitychange', syncAll);
    cleanups.push(() => doc.removeEventListener('visibilitychange', syncAll));
  }

  return {
    sync: syncAll,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      for (const item of items) item.video?.pause?.();
    },
    /** The recording length of a scene view's loop, in seconds, or null. */
    durationOf(view) {
      const item = items.find((candidate) => candidate.view === view);
      return item && item.state !== 'fallback' ? (item.loop.durationS ?? null) : null;
    },
    getDiagnostics: () => ({
      available: items.length,
      items: Object.fromEntries(items.map((item) => [item.key, {
        state: item.state,
        reason: item.reason,
        role: roleOf(item),
        opening: openingOf(item.loop),
        near: item.near,
        visible: item.visible,
        rendition: item.rendition,
        paused: item.video ? item.video.paused : null,
        currentTime: item.video ? item.video.currentTime : null,
      }])),
    }),
  };
}
