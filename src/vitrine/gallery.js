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
 * @returns {{sync: Function, dispose: Function, getDiagnostics: Function}}
 */
export function initGalleryLoops({
  root,
  win = globalThis,
  isStill = () => false,
  loops = GALLERY_LOOPS.loops,
} = {}) {
  const doc = root.ownerDocument;
  const items = [];
  for (const box of root.querySelectorAll('[data-media]')) {
    const loop = loops?.[box.dataset.media];
    if (!loop?.renditions?.length) continue;
    items.push({ key: box.dataset.media, box, loop, state: 'still', near: false, visible: false,
      video: null, rendition: null, reason: null });
  }
  const Observer = win.IntersectionObserver;
  const cleanups = [];
  const page = () => ({ still: Boolean(isStill()), hidden: Boolean(doc.hidden) });

  const fail = (item, reason) => {
    item.state = 'fallback';
    item.reason = reason;
    item.box.dataset.loop = 'fallback';
    const { video } = item;
    item.video = null;
    if (video) {
      video.pause?.();
      video.removeAttribute('src');
      video.load?.();
      video.remove();
    }
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

  const sync = (item) => {
    const step = nextStep(item, page());
    if (step === 'attach') void attach(item);
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
      dpr: win.devicePixelRatio,
      videoAspect: item.loop.aspect,
    });
    const video = doc.createElement('video');
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
    const still = item.box.querySelector('img');
    const poster = still?.currentSrc || still?.getAttribute('src');
    if (poster) video.poster = poster;
    video.addEventListener('playing', () => {
      if (item.state !== 'loading') return;
      item.state = 'live';
      item.box.dataset.loop = 'live';
    });
    video.addEventListener('error', () => fail(item, 'error'));
    // After the still (a `<picture>` or a bare `<img>`), before the credit.
    const anchor = item.box.querySelector(':scope > picture') || still;
    if (anchor) anchor.after(video);
    else item.box.prepend(video);
    item.video = video;
    video.src = chosen.src;
    sync(item);
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
    getDiagnostics: () => ({
      available: items.length,
      items: Object.fromEntries(items.map((item) => [item.key, {
        state: item.state,
        reason: item.reason,
        near: item.near,
        visible: item.visible,
        rendition: item.rendition,
        paused: item.video ? item.video.paused : null,
        currentTime: item.video ? item.video.currentTime : null,
      }])),
    }),
  };
}
