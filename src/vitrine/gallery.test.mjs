// The gallery's loops (src/vitrine/gallery.js): fetched only near the screen,
// played only on it, and never against « Image fixe ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initGalleryLoops, LOAD_AHEAD, nextStep, PLAY_THRESHOLD } from './gallery.js';

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
    emit(type) { for (const fn of listeners[type] || []) fn(); },
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

function fakePage({ keys = ['view:01', 'voice-response'], video = {}, dpr = 2 } = {}) {
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
    return {
      dataset: { media: key },
      inserted,
      getBoundingClientRect: () => ({ width: 393, height: 238 }),
      querySelector: (selector) => (selector === 'img' ? img : picture),
      prepend: (node) => inserted.push(node),
    };
  });
  const root = { ownerDocument: doc, querySelectorAll: () => boxes };
  // Every rendition decodes smoothly in hardware here; the codec order decides.
  const mediaCapabilities = { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }) };
  const win = { IntersectionObserver: FakeObserver, devicePixelRatio: dpr, navigator: { mediaCapabilities } };
  // `near` is the observer with a margin, `seen` the one with a threshold.
  const near = () => observers.find((o) => o.options.rootMargin);
  const seen = () => observers.find((o) => o.options.threshold);
  const fire = (observer, box, isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) => {
    observer().callback([{ target: box, isIntersecting, intersectionRatio }]);
  };
  return { doc, boxes, root, win, videos, near, seen, fire };
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
