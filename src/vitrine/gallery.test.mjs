// The gallery's loops (src/vitrine/gallery.js): fetched only near the screen,
// played only on it, and never against « Image fixe ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPAND,
  EXPAND_DWELL_MS,
  expandGeometry,
  initGalleryLoops,
  LOAD_AHEAD,
  nextStep,
  PLAY_THRESHOLD,
  SWAP_LEAD_S,
  timeUntil,
} from './gallery.js';

test('a box waits until it nears the screen, then fetches, then plays only while seen', () => {
  const page = { still: false, hidden: false };
  assert.equal(nextStep({ state: 'still', near: false, visible: false }, page), 'wait');
  assert.equal(nextStep({ state: 'still', near: true, visible: false }, page), 'attach');
  assert.equal(nextStep({ state: 'loading', near: true, visible: false }, page), 'pause');
  assert.equal(nextStep({ state: 'loading', near: true, visible: true }, page), 'play');
  assert.equal(nextStep({ state: 'live', near: false, visible: false }, page), 'pause');
  assert.equal(nextStep({ state: 'fallback', near: true, visible: true }, page), 'wait');
});

test('« Image fixe » and a hidden tab stop what plays and fetch nothing new', () => {
  for (const page of [{ still: true, hidden: false }, { still: false, hidden: true }]) {
    assert.equal(nextStep({ state: 'still', near: true, visible: true }, page), 'wait');
    assert.equal(nextStep({ state: 'live', near: true, visible: true }, page), 'pause');
  }
});

test('the load margin reaches ahead of the screen; a sliver on screen does not play', () => {
  assert.match(LOAD_AHEAD, /%/);
  assert.ok(PLAY_THRESHOLD > 0 && PLAY_THRESHOLD < 0.5);
});

// ── A small fake of the DOM the module touches ─────────────────────────────

function fakeVideo({ playable = ['av01', 'avc1'], refuse = false } = {}) {
  const listeners = {};
  const attrs = {};
  return {
    paused: true,
    currentTime: 0,
    attrs,
    removed: false,
    canPlayType: (mime) => (playable.some((codec) => mime.includes(codec)) ? 'probably' : ''),
    setAttribute(name, value) { attrs[name] = value; },
    removeAttribute(name) { delete attrs[name]; if (name === 'src') this.src = ''; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    emit(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
    before(node) { this.inserted = [...(this.inserted || []), node]; },
    play() {
      if (refuse) return Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
    load() {},
    remove() { this.removed = true; },
  };
}

function fakePage({ keys = ['view:01', 'voice-response'], video = {}, dpr = 2, expand = false } = {}) {
  const observers = [];
  class FakeObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  }
  const videos = [];
  const doc = {
    hidden: false,
    listeners: {},
    createElement: () => { const v = fakeVideo(video); videos.push(v); return v; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    removeEventListener(type) { delete this.listeners[type]; },
  };
  const boxes = keys.map((key) => {
    const inserted = [];
    const img = { currentSrc: `/landing/${key}-480.jpg`, getAttribute: () => null };
    const picture = { after: (node) => inserted.push(node) };
    const view = fakeView(expand && key === 'view:01');
    return {
      dataset: { media: key },
      inserted,
      view,
      style: { vars: {}, setProperty(name, value) { this.vars[name] = value; } },
      offsetWidth: 393,
      offsetHeight: 238,
      parentElement: { getBoundingClientRect: () => ({ left: 100, top: 300, width: 393, height: 238 }) },
      closest: () => view,
      getBoundingClientRect: () => ({ width: 393, height: 238 }),
      querySelector: (selector) => (selector === 'img' ? img : picture),
      prepend: (node) => inserted.push(node),
    };
  });
  const root = { ownerDocument: doc, querySelectorAll: () => boxes };
  // Every rendition decodes smoothly in hardware here; the codec order decides.
  const mediaCapabilities = { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }) };
  const timers = [];
  const frames = [];
  const win = {
    IntersectionObserver: FakeObserver, devicePixelRatio: dpr, navigator: { mediaCapabilities },
    innerWidth: 1440, innerHeight: 900,
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: (id) => { frames[id - 1] = null; },
    addEventListener() {},
    removeEventListener() {},
  };
  const runTimers = (ms) => {
    for (const timer of timers.splice(0)) if (timer.fn && timer.ms <= ms) timer.fn();
  };
  const runFrame = () => { for (const fn of frames.splice(0)) fn?.(); };
  // `near` is the observer with a margin, `seen` the one with a threshold.
  const near = () => observers.find((o) => o.options.rootMargin);
  const seen = () => observers.find((o) => o.options.threshold);
  const fire = (observer, box, isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) => {
    observer().callback([{ target: box, isIntersecting, intersectionRatio }]);
  };
  return { doc, boxes, root, win, videos, near, seen, fire, runTimers, runFrame };
}

function fakeView(expandable) {
  const listeners = {};
  const attrs = expandable ? { 'data-expand': '' } : {};
  return {
    attrs,
    hasAttribute: (name) => name in attrs,
    setAttribute(name, value) { attrs[name] = value; },
    removeAttribute(name) { delete attrs[name]; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    removeEventListener() {},
    matches: () => true,
    emit(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
  };
}

const R = (codec, width, tag) => ({
  src: `/landing/view-01-${width}-${codec}.mp4`, mime: `video/mp4; codecs="${tag}"`, codec, width,
  height: Math.round(width / 1.65), bytes: width * (codec === 'av1' ? 100 : 180), bitrateKbps: 300,
});
const LOOPS = {
  'view:01': { aspect: 1.65, fps: 30, durationS: 6,
    renditions: [R('av1', 480, 'av01.0.04M.08'), R('h264', 480, 'avc1.64001E'), R('av1', 960, 'av01.0.08M.08'),
      R('h264', 960, 'avc1.64001F'), R('av1', 1440, 'av01.0.09M.08'), R('h264', 1440, 'avc1.640028')] },
};
const tick = () => new Promise((resolve) => { setImmediate(resolve); });

test('only boxes with a published loop are wired, and nothing is fetched before one nears the screen', async () => {
  const page = fakePage();
  const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  assert.equal(gallery.getDiagnostics().available, 1, 'the voice answer has no loop here: it keeps its still');
  await tick();
  assert.equal(page.videos.length, 0);
  assert.equal(page.boxes[0].dataset.loop, undefined);
});

test('near: the smallest rendition covering the box in device pixels, muted, looping, inline, over the still', async () => {
  const page = fakePage({ dpr: 2 });
  const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  page.fire(page.near, page.boxes[0], true);
  await tick();
  const [video] = page.videos;
  assert.ok(video, 'a video is created');
  // 393 CSS px at DPR 2 = 786 device px: the 960, in AV1.
  assert.equal(video.src, '/landing/view-01-960-av1.mp4');
  assert.equal(video.muted, true);
  assert.equal(video.loop, true);
  for (const name of ['muted', 'loop', 'playsinline']) assert.ok(name in video.attrs, name);
  assert.equal(video.poster, '/landing/view:01-480.jpg', 'the still already loaded is the poster');
  assert.deepEqual(page.boxes[0].inserted, [video], 'inserted after the picture');
  assert.equal(video.paused, true, 'fetched ahead, not played off screen');
  assert.equal(page.boxes[0].dataset.loop, 'loading');

  page.fire(page.seen, page.boxes[0], true, 0.6);
  assert.equal(video.paused, false, 'plays once on screen');
  video.emit('playing');
  assert.equal(page.boxes[0].dataset.loop, 'live');
  page.fire(page.seen, page.boxes[0], false);
  assert.equal(video.paused, true, 'paused off screen');
  assert.equal(gallery.getDiagnostics().items['view:01'].rendition.width, 960);
});

test('a browser without AV1 gets the H.264 file of the same width', async () => {
  const page = fakePage({ dpr: 1, video: { playable: ['avc1'] } });
  initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  page.fire(page.near, page.boxes[0], true);
  await tick();
  assert.equal(page.videos[0].src, '/landing/view-01-480-h264.mp4');
});

test('« Image fixe » ticked: nothing is fetched; ticked while playing: paused where it is', async () => {
  let still = true;
  const page = fakePage();
  const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS, isStill: () => still });
  page.fire(page.near, page.boxes[0], true);
  page.fire(page.seen, page.boxes[0], true);
  await tick();
  assert.equal(page.videos.length, 0, 'no bytes spent on a picture the reader asked to keep still');
  still = false;
  gallery.sync();
  await tick();
  assert.equal(page.videos.length, 1);
  assert.equal(page.videos[0].paused, false);
  still = true;
  gallery.sync();
  assert.equal(page.videos[0].paused, true);
  assert.equal(page.videos[0].removed, false, 'paused, not swapped back for the still');
});

test('a hidden tab pauses the loops', async () => {
  const page = fakePage();
  initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  page.fire(page.near, page.boxes[0], true);
  page.fire(page.seen, page.boxes[0], true);
  await tick();
  assert.equal(page.videos[0].paused, false);
  page.doc.hidden = true;
  page.doc.listeners.visibilitychange();
  assert.equal(page.videos[0].paused, true);
});

test('a refused autoplay or a failed download keeps the still, and the video goes', async () => {
  for (const [label, video, fail] of [
    ['autoplay refused', { refuse: true }, () => {}],
    ['download failed', {}, (v) => v.emit('error')],
  ]) {
    const page = fakePage({ video });
    const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
    page.fire(page.near, page.boxes[0], true);
    page.fire(page.seen, page.boxes[0], true);
    await tick();
    fail(page.videos[0]);
    await tick();
    assert.equal(page.boxes[0].dataset.loop, 'fallback', label);
    assert.equal(page.videos[0].removed, true, label);
    const diag = gallery.getDiagnostics().items['view:01'];
    assert.equal(diag.state, 'fallback', label);
    // And it is not fetched again on the next pass.
    page.fire(page.near, page.boxes[0], true);
    await tick();
    assert.equal(page.videos.length, 1, label);
  }
});

test('nothing playable: the still stays and no video is inserted', async () => {
  const page = fakePage({ video: { playable: [] } });
  initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  page.fire(page.near, page.boxes[0], true);
  await tick();
  assert.equal(page.boxes[0].dataset.loop, 'fallback');
  assert.deepEqual(page.boxes[0].inserted, []);
});

test('no IntersectionObserver: stills only', async () => {
  const page = fakePage();
  const gallery = initGalleryLoops({ root: page.root, win: { ...page.win, IntersectionObserver: undefined }, loops: LOOPS });
  gallery.sync();
  await tick();
  assert.equal(page.videos.length, 0);
});

// ── The enlarged film ──────────────────────────────────────────────────────

const SCREEN = { left: 24, top: 97, right: 1416, bottom: 876 };

test('enlarged: twice the tile, centred where there is room, and the origin always inside the box', () => {
  const box = { left: 523, top: 400, width: 393, height: 238 };
  const g = expandGeometry({ box, bounds: SCREEN });
  assert.equal(g.scale, 2);
  assert.deepEqual([g.originX, g.originY], [196.5, 119]);
});

test('enlarged: pushed off the screen\'s edges, never past the box it grew from', () => {
  // The left column, just under the header band: it grows right and down.
  const g = expandGeometry({ box: { left: 100, top: 110, width: 393, height: 238 }, bounds: SCREEN });
  assert.equal(g.scale, 2);
  assert.ok(100 - g.originX >= 24, 'left edge on screen');
  assert.ok(110 - g.originY >= 97, 'top edge under the band');
  // Near the bottom of the screen: it grows up.
  const low = expandGeometry({ box: { left: 523, top: 620, width: 393, height: 238 }, bounds: SCREEN });
  assert.ok(620 + 238 * 2 - low.originY <= 876 + 0.01, 'bottom edge on screen');
  // Half off the screen already: the origin stays in the box, whatever that costs.
  const off = expandGeometry({ box: { left: 523, top: 780, width: 393, height: 238 }, bounds: SCREEN });
  assert.equal(off.originY, 238);
});

test('enlarged: capped in width and by the screen, and not at all without room to grow', () => {
  const wide = expandGeometry({ box: { left: 100, top: 200, width: 767, height: 465 }, bounds: { left: 24, top: 97, right: 2536, bottom: 1416 } });
  assert.equal(wide.scale, Math.round((EXPAND.maxWidth / 767) * 100) / 100, '1040 px wide at most');
  const short = expandGeometry({ box: { left: 100, top: 200, width: 393, height: 238 }, bounds: { left: 24, top: 97, right: 1416, bottom: 500 } });
  assert.equal(short.scale, Math.round((403 / 238) * 100) / 100, 'the screen\'s height binds');
  assert.equal(expandGeometry({ box: { left: 0, top: 0, width: 900, height: 545 }, bounds: SCREEN }), null);
  assert.equal(expandGeometry({ box: { left: 0, top: 0, width: 0, height: 0 }, bounds: SCREEN }), null);
});

test('the time left to a point of the film counts across its loop point', () => {
  assert.equal(timeUntil(10, 9.5, 29), 0.5);
  assert.equal(Math.round(timeUntil(0.3, 28.9, 29) * 100) / 100, 0.4);
  assert.equal(Math.round(timeUntil(10, 10.2, 29) * 100) / 100, 28.8, 'just passed: nearly a whole loop away');
});

const FILM_LOOPS = { 'view:01': { ...LOOPS['view:01'], durationS: 29 } };

test('a film enlarges after the pointer rests on it, and swaps to the wider file at the same instant', async () => {
  const page = fakePage({ expand: true, dpr: 2 });
  const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: FILM_LOOPS });
  const [box] = page.boxes;
  page.fire(page.near, box, true);
  page.fire(page.seen, box, true);
  await tick();
  const [tile] = page.videos;
  assert.equal(tile.src, '/landing/view-01-960-av1.mp4');
  tile.emit('playing');

  box.view.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(box.view.attrs['data-expanded'], undefined, 'not before the dwell');
  page.runTimers(EXPAND_DWELL_MS);
  assert.ok('data-expanded' in box.view.attrs);
  assert.equal(box.style.vars['--expand-scale'], '2');
  assert.equal(gallery.getDiagnostics().items['view:01'].expanded, true);

  // 786 CSS px at DPR 2: the 1440, parked ahead of the film, under it.
  const wider = page.videos[1];
  assert.equal(wider.src, '/landing/view-01-1440-av1.mp4');
  assert.deepEqual(tile.inserted, [wider]);
  tile.currentTime = 12;
  wider.duration = 29;
  wider.emit('loadedmetadata');
  assert.equal(wider.currentTime, 12 + SWAP_LEAD_S);
  wider.emit('seeked');
  page.runFrame();
  assert.equal(wider.paused, true, 'waits for the film to get there');
  tile.currentTime = 12 + SWAP_LEAD_S;
  page.runFrame();
  assert.equal(wider.paused, false);
  wider.emit('playing');
  assert.equal(tile.removed, true, 'the tile\'s file goes on the wider one\'s first frame');
  assert.equal(gallery.getDiagnostics().items['view:01'].rendition.width, 1440);

  box.view.emit('pointerleave');
  assert.equal(box.view.attrs['data-expanded'], undefined);
  box.view.emit('pointerenter', { pointerType: 'mouse' });
  page.runTimers(EXPAND_DWELL_MS);
  assert.equal(page.videos.length, 2, 'the wider file is kept: nothing fetched twice');
});

test('a tap, a box without a film, or a film not playing yet never enlarges', async () => {
  const page = fakePage({ expand: true });
  initGalleryLoops({ root: page.root, win: page.win, loops: FILM_LOOPS });
  const [box] = page.boxes;
  box.view.emit('pointerenter', { pointerType: 'touch' });
  page.runTimers(EXPAND_DWELL_MS);
  assert.equal(box.view.attrs['data-expanded'], undefined, 'touch');
  box.view.emit('pointerenter', { pointerType: 'mouse' });
  page.runTimers(EXPAND_DWELL_MS);
  assert.equal(box.view.attrs['data-expanded'], undefined, 'still loading');
  page.fire(page.near, box, true);
  page.fire(page.seen, box, true);
  await tick();
  page.videos[0].emit('playing');
  page.runTimers(EXPAND_DWELL_MS);
  assert.ok('data-expanded' in box.view.attrs, 'the pointer still resting on it when it starts');

  const plain = fakePage({ expand: false });
  initGalleryLoops({ root: plain.root, win: plain.win, loops: FILM_LOOPS });
  plain.boxes[0].view.emit('pointerenter', { pointerType: 'mouse' });
  plain.runTimers(EXPAND_DWELL_MS);
  assert.equal(plain.boxes[0].view.attrs['data-expanded'], undefined, 'no data-expand');
});
