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
 * A box whose view is marked `data-expand` (index.html) holds a film rather
 * than a loop — Roissy, 29 s — and grows to about twice its size while the
 * pointer rests on it or the keyboard focuses it: the neighbours dim, the film
 * keeps playing, and the file is swapped for a wider rendition at the same
 * instant if the tile's one would be blown up. A phone never enlarges it: a
 * tap there is the link.
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
 * How long the pointer rests on a film before it is enlarged: a pointer
 * crossing the gallery on its way elsewhere must not set it off.
 */
export const EXPAND_DWELL_MS = 280;

/**
 * The enlarged box: at most twice the tile and {@link EXPAND}`.maxWidth` CSS
 * px (the 1440 rendition drawn at a device pixel ratio of ~1.4), inside the
 * screen by `margin`, and not at all when there is no room to grow by
 * `minScale`.
 */
export const EXPAND = Object.freeze({ maxScale: 2, maxWidth: 1040, minScale: 1.2, margin: 24 });

/**
 * How far ahead of the playing film the wider rendition is parked before it
 * takes over: long enough to fetch and decode from the keyframe before it
 * (scripts/build-landing-film.mjs keeps them 4 s apart).
 */
export const SWAP_LEAD_S = 0.8;

/** A wider rendition that has not taken over by then is dropped. */
export const SWAP_DEADLINE_MS = 20000;

/**
 * Scale and transform origin of an enlarged box. Pure.
 *
 * The origin is chosen inside the box, so the enlarged box always covers the
 * one it grew from — the pointer that enlarged it is still over it, and no
 * `pointerleave` fires on the way. Within that, it is centred when there is
 * room, and pushed off the screen's edges when there is not.
 *
 * @param {{box: {left: number, top: number, width: number, height: number},
 *   bounds: {left: number, top: number, right: number, bottom: number},
 *   maxScale?: number, maxWidth?: number, minScale?: number}} input
 * @returns {?{scale: number, originX: number, originY: number}} origin in px from the box's top-left.
 */
export function expandGeometry({ box, bounds, maxScale = EXPAND.maxScale, maxWidth = EXPAND.maxWidth,
  minScale = EXPAND.minScale }) {
  const { left, top, width, height } = box || {};
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(maxScale, maxWidth / width, (bounds.right - bounds.left) / width,
    (bounds.bottom - bounds.top) / height);
  if (!(scale >= minScale)) return null;
  const grow = scale - 1;
  // The enlarged start is `start - grow × origin`: keep it at or after `lo`,
  // and its end at or before `hi`.
  const axis = (start, size, lo, hi) => {
    const least = (start + scale * size - hi) / grow;
    const most = (start - lo) / grow;
    return Math.min(size, Math.max(0, Math.min(most, Math.max(least, size / 2))));
  };
  const round = (v) => Math.round(v * 100) / 100;
  return {
    scale: round(scale),
    originX: round(axis(left, width, bounds.left, bounds.right)),
    originY: round(axis(top, height, bounds.top, bounds.bottom)),
  };
}

/**
 * How far the playing film still has to go to reach `target`, in seconds,
 * across its loop point. Pure.
 * @param {number} target
 * @param {number} current
 * @param {number} duration
 */
export function timeUntil(target, current, duration) {
  if (!(duration > 0)) return 0;
  return (((target - current) % duration) + duration) % duration;
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
    const view = box.closest?.('.view') || null;
    items.push({ key: box.dataset.media, box, loop, state: 'still', near: false, visible: false,
      video: null, rendition: null, reason: null, probed: null,
      view, expandable: Boolean(view?.hasAttribute?.('data-expand')), pointer: false, focus: false,
      expanded: false, timer: null, swap: null, swapFailed: false });
  }
  const Observer = win.IntersectionObserver;
  const cleanups = [];
  const page = () => ({ still: Boolean(isStill()), hidden: Boolean(doc.hidden) });

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
    collapse(item);
    abortSwap(item);
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
    const video = createVideo(null);
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
    item.probed = probed;
    item.rendition = { src: chosen.src, codec: chosen.codec, width: chosen.width, needed };
    const still = item.box.querySelector('img');
    const poster = still?.currentSrc || still?.getAttribute('src');
    if (poster) video.poster = poster;
    video.addEventListener('playing', () => {
      if (item.state !== 'loading') return;
      item.state = 'live';
      item.box.dataset.loop = 'live';
      // The pointer was already resting on the box while the film loaded.
      if (item.pointer || item.focus) wantExpand(item, EXPAND_DWELL_MS);
    });
    video.addEventListener('error', () => { if (item.video === video) fail(item, 'error'); });
    // After the still (a `<picture>` or a bare `<img>`), before the credit.
    const anchor = item.box.querySelector(':scope > picture') || still;
    if (anchor) anchor.after(video);
    else item.box.prepend(video);
    item.video = video;
    video.src = chosen.src;
    sync(item);
  }

  // ── The enlarged film ────────────────────────────────────────────────
  // The box itself is scaled (landing.css, `[data-expanded]`), about an
  // origin that keeps it on screen; the vars stay set on the way back so it
  // shrinks toward the same point.

  /**
   * Where the enlarged box may go: the screen, less the header band and a
   * docked form, and no closer to the edges of its panel than to the screen's.
   */
  function screenBounds(item) {
    const { margin } = EXPAND;
    const width = doc.documentElement?.clientWidth || win.innerWidth || 0;
    const bounds = { left: margin, top: margin, right: width - margin, bottom: (win.innerHeight || 0) - margin };
    const panel = item.view?.closest?.('.panel')?.getBoundingClientRect?.();
    if (panel && panel.width) {
      bounds.left = Math.max(bounds.left, panel.left + margin);
      bounds.right = Math.min(bounds.right, panel.right - margin);
    }
    const band = root.querySelector?.('.top')?.getBoundingClientRect?.();
    if (band && band.bottom > 0) bounds.top = Math.max(bounds.top, band.bottom + margin);
    const dock = root.querySelector?.('form.dock')?.getBoundingClientRect?.();
    if (dock && dock.height && dock.top > bounds.bottom / 2) bounds.bottom = Math.min(bounds.bottom, dock.top - margin);
    return bounds;
  }

  function wantExpand(item, delay) {
    if (!item.expandable) return;
    win.clearTimeout(item.timer);
    item.timer = win.setTimeout(() => expand(item), delay);
  }

  function expand(item) {
    item.timer = null;
    if (!(item.pointer || item.focus) || item.state !== 'live' || item.expanded) return;
    // The layout box, not the painted one: a box still shrinking back would
    // otherwise measure as its transformed self.
    const frame = item.box.parentElement?.getBoundingClientRect?.();
    if (!frame) return;
    const geometry = expandGeometry({
      box: { left: frame.left, top: frame.top, width: item.box.offsetWidth, height: item.box.offsetHeight },
      bounds: screenBounds(item),
    });
    if (!geometry) return;
    item.box.style.setProperty('--expand-scale', String(geometry.scale));
    item.box.style.setProperty('--expand-origin', `${geometry.originX}px ${geometry.originY}px`);
    item.view.setAttribute('data-expanded', '');
    item.expanded = true;
    swapForWider(item, geometry.scale);
  }

  function collapse(item) {
    win.clearTimeout(item.timer);
    item.timer = null;
    if (!item.expanded) return;
    item.expanded = false;
    item.view?.removeAttribute('data-expanded');
  }

  /**
   * The tile's rendition blown up to the enlarged box would be soft: fetch
   * the one that covers it, park it {@link SWAP_LEAD_S} ahead of the playing
   * film, start it when the film gets there, and drop the old one on its
   * first frame. It stays for the rest of the visit — the bytes are paid.
   */
  function swapForWider(item, scale) {
    const current = item.video;
    if (item.swap || item.swapFailed || !current || !item.probed?.length) return;
    const needed = neededVideoWidth({
      boxWidth: item.box.offsetWidth * scale,
      boxHeight: item.box.offsetHeight * scale,
      dpr: win.devicePixelRatio,
      videoAspect: item.loop.aspect,
    });
    const chosen = chooseRendition(item.probed, needed);
    if (!chosen || chosen.width <= (item.rendition?.width || 0)) return;
    const next = createVideo(chosen.src);
    const swap = { next, raf: 0, deadline: 0, target: 0, rendition: { src: chosen.src, codec: chosen.codec, width: chosen.width, needed } };
    item.swap = swap;
    const length = () => next.duration || current.duration || item.loop.durationS || 0;
    const takeOver = () => {
      if (item.swap !== swap) return;
      win.clearTimeout(swap.deadline);
      item.swap = null;
      item.video = next;
      item.rendition = swap.rendition;
      next.addEventListener('error', () => { if (item.video === next) fail(item, 'error'); });
      drop(current);
      sync(item);
    };
    const wait = () => {
      swap.raf = 0;
      if (item.swap !== swap) return;
      if (current.paused) {
        // Nothing is moving: meet the film where it stopped, and let `sync` start it.
        next.addEventListener('seeked', takeOver, { once: true });
        next.currentTime = current.currentTime;
        return;
      }
      const ahead = timeUntil(swap.target, current.currentTime, length());
      if (ahead <= 0.05 || ahead > length() / 2) {
        next.addEventListener('playing', takeOver, { once: true });
        next.play?.()?.catch?.(() => abortSwap(item));
        return;
      }
      swap.raf = win.requestAnimationFrame(wait);
    };
    next.addEventListener('error', () => { if (item.swap === swap) abortSwap(item); });
    next.addEventListener('loadedmetadata', () => {
      if (item.swap !== swap) return;
      swap.target = (current.currentTime + SWAP_LEAD_S) % length();
      next.addEventListener('seeked', wait, { once: true });
      next.currentTime = swap.target;
    }, { once: true });
    swap.deadline = win.setTimeout(() => abortSwap(item), SWAP_DEADLINE_MS);
    // Under the playing film: it covers the new one until it is dropped.
    current.before?.(next);
  }

  function abortSwap(item) {
    const { swap } = item;
    if (!swap) return;
    item.swap = null;
    item.swapFailed = true;
    win.clearTimeout(swap.deadline);
    if (swap.raf) win.cancelAnimationFrame?.(swap.raf);
    drop(swap.next);
  }

  const onScreenChange = () => { for (const item of items) collapse(item); };
  for (const item of items) {
    if (!item.expandable || !item.view) continue;
    const { view } = item;
    const listen = (type, handler) => {
      view.addEventListener(type, handler);
      cleanups.push(() => view.removeEventListener(type, handler));
    };
    // A touch "enter" is a tap, and a tap is the link.
    listen('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      item.pointer = true;
      wantExpand(item, EXPAND_DWELL_MS);
    });
    listen('pointerleave', () => {
      item.pointer = false;
      if (!item.focus) collapse(item);
    });
    listen('focus', () => {
      if (!view.matches?.(':focus-visible')) return;
      item.focus = true;
      wantExpand(item, 0);
    });
    listen('blur', () => {
      item.focus = false;
      if (!item.pointer) collapse(item);
    });
  }
  if (items.some((item) => item.expandable)) {
    win.addEventListener?.('resize', onScreenChange);
    cleanups.push(() => win.removeEventListener?.('resize', onScreenChange));
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
      for (const item of items) {
        collapse(item);
        abortSwap(item);
        item.video?.pause?.();
      }
    },
    getDiagnostics: () => ({
      available: items.length,
      items: Object.fromEntries(items.map((item) => [item.key, {
        state: item.state,
        reason: item.reason,
        near: item.near,
        visible: item.visible,
        rendition: item.rendition,
        expanded: item.expanded,
        swapping: item.swap ? item.swap.rendition : null,
        paused: item.video ? item.video.paused : null,
        currentTime: item.video ? item.video.currentTime : null,
      }])),
    }),
  };
}
