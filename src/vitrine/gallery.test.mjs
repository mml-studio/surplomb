// The gallery's loops (src/vitrine/gallery.js): fetched only near the screen,
// played only on it, and never against « Image fixe ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initGalleryLoops,
  LOAD_AHEAD,
  LOOP_MAX_DPR,
  nextStep,
  openingOf,
  PLAY_THRESHOLD,
  STAGE_ENTRY_HOLD_MS,
  stageGate,
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
    const view = { key };
    return {
      dataset: { media: key },
      inserted,
      view,
      closest: () => view,
      getBoundingClientRect: () => ({ width: 393, height: 238 }),
      querySelector: (selector) => (selector === 'img' ? img : picture),
      prepend: (node) => inserted.push(node),
    };
  });
  const root = { ownerDocument: doc, querySelectorAll: () => boxes };
  // Every rendition decodes smoothly in hardware here; the codec order decides.
  const mediaCapabilities = { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }) };
  let clock = 0;
  const timers = [];
  const win = {
    IntersectionObserver: FakeObserver, devicePixelRatio: dpr, navigator: { mediaCapabilities },
    performance: { now: () => clock },
    setTimeout: (fn, ms) => timers.push({ fn, at: clock + ms }),
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    addEventListener() {},
    removeEventListener() {},
  };
  /** Move the clock on and fire what falls due. */
  const advance = (ms) => {
    clock += ms;
    for (const timer of timers) {
      if (timer.fn && timer.at <= clock) {
        const { fn } = timer;
        timer.fn = null;
        fn();
      }
    }
  };
  // `near` is the observer with a margin, `seen` the one with a threshold.
  const near = () => observers.find((o) => o.options.rootMargin);
  const seen = () => observers.find((o) => o.options.threshold);
  const fire = (observer, box, isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) => {
    observer().callback([{ target: box, isIntersecting, intersectionRatio }]);
  };
  return { doc, boxes, root, win, videos, near, seen, fire, advance };
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

test('a phone is served for twice its CSS pixels, not three times', async () => {
  const page = fakePage({ dpr: 3 });
  initGalleryLoops({ root: page.root, win: page.win, loops: LOOPS });
  page.fire(page.near, page.boxes[0], true);
  await tick();
  // 393 CSS px at DPR 3 would be 1 179 device px, the 1440; capped at 2, 786: the 960.
  assert.equal(LOOP_MAX_DPR, 2);
  assert.equal(page.videos[0].src, '/landing/view-01-960-av1.mp4');
});

// ── The scene (src/vitrine/stage.js) ───────────────────────────────────────

test('the scene: fetched on stage or next in line, played on stage and on screen only', () => {
  const seen = { near: true, visible: true };
  assert.deepEqual(stageGate(seen, 'active'), { near: true, visible: true });
  assert.deepEqual(stageGate(seen, 'next'), { near: true, visible: false }, 'fetched ahead of its turn, not played');
  assert.deepEqual(stageGate(seen, 'idle'), { near: false, visible: false }, 'waits for its turn');
  assert.deepEqual(stageGate(seen, 'active', false), { near: true, visible: false }, 'the scene is off screen');
  assert.deepEqual(stageGate({ near: false, visible: false }, 'active'), { near: false, visible: false });
  assert.deepEqual(stageGate(seen, null), seen, 'the voice answer is not on stage');
  assert.deepEqual(stageGate(seen, 'idle', true, true), { near: true, visible: false }, 'the reader reached for the bar');
  assert.deepEqual(stageGate({ near: false, visible: false }, 'idle', true, true), { near: false, visible: false },
    'browsing does not fetch a scene far off screen');
});

function fakeStage(boxes) {
  const views = boxes.map((box) => box.view);
  const subscribers = new Set();
  const stage = {
    current: 0,
    paused: false,
    onScreen: true,
    browsing: false,
    isBrowsing: () => stage.browsing,
    roleOf(view) {
      const index = views.indexOf(view);
      if (index < 0) return null;
      if (index === stage.current) return 'active';
      return index === (stage.current + 1) % views.length ? 'next' : 'idle';
    },
    isPaused: () => stage.paused,
    isOnScreen: () => stage.onScreen,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    select(index) {
      stage.current = index;
      for (const fn of subscribers) fn({ type: 'select', index, view: views[index] });
    },
    setPaused(value) {
      stage.paused = value;
      for (const fn of subscribers) fn({ type: 'pause', paused: value });
    },
    subscribers,
  };
  return stage;
}

const SCENE_KEYS = ['view:01', 'view:02', 'view:03'];
const SCENE_LOOPS = Object.fromEntries(SCENE_KEYS.map((key, i) => [key, { ...LOOPS['view:01'], durationS: [29, 6, 14.67][i] }]));
// The third is the power-grid film: turned round so its still shows the grid
// lit, its story (Europe dark, France switching on) begins 11.67 s in.
SCENE_LOOPS['view:03'].openingS = 11.67;

async function scenePage() {
  const page = fakePage({ keys: [...SCENE_KEYS, 'voice-response'] });
  const scene = page.boxes.slice(0, 3);
  const stage = fakeStage(scene);
  const gallery = initGalleryLoops({ root: page.root, win: page.win, loops: SCENE_LOOPS, stage });
  // The three boxes share one place: they near and show together.
  for (const box of scene) {
    page.fire(page.near, box, true);
    page.fire(page.seen, box, true);
  }
  await tick();
  const videoOf = (key) => page.videos.find((video) => video.src && gallery.getDiagnostics().items[key].rendition?.src === video.src
    && page.boxes.find((box) => box.dataset.media === key).inserted.includes(video));
  return { page, scene, stage, gallery, videoOf };
}

test('the scene: only the view on stage and the next one are fetched, and only the first plays', async () => {
  const { page, gallery, videoOf } = await scenePage();
  const items = gallery.getDiagnostics().items;
  assert.equal(items['view:01'].role, 'active');
  assert.equal(items['view:02'].role, 'next');
  assert.equal(items['view:03'].state, 'still', 'the third waits for its turn');
  assert.equal(page.videos.length, 2);
  assert.equal(videoOf('view:01').paused, false);
  assert.equal(videoOf('view:02').paused, true, 'fetched ahead, held');
});

test('the scene: a view that comes on stage starts from the beginning, the one leaving stops', async () => {
  const { page, stage, gallery, videoOf } = await scenePage();
  const second = videoOf('view:02');
  second.currentTime = 4.2;
  stage.select(1);
  await tick();
  assert.equal(second.currentTime, 0, 'from its start, so the clock and the film end together');
  assert.equal(second.paused, true, 'its first frame waits for the fade');
  page.advance(STAGE_ENTRY_HOLD_MS);
  assert.equal(second.paused, false);
  assert.equal(videoOf('view:01').paused, true);
  assert.equal(gallery.getDiagnostics().items['view:03'].state, 'loading', 'the new next one is fetched');
  assert.equal(page.videos.length, 3);
});

test('the scene: its pause and the scene off screen stop the picture, not the voice answer', async () => {
  const { stage, videoOf } = await scenePage();
  stage.setPaused(true);
  assert.equal(videoOf('view:01').paused, true);
  stage.setPaused(false);
  assert.equal(videoOf('view:01').paused, false);
  stage.onScreen = false;
  stage.subscribers.forEach((fn) => fn({ type: 'screen', onScreen: false }));
  assert.equal(videoOf('view:01').paused, true);
});

test('the scene is told each view\'s recording length, and none for a view that fell back to its still', async () => {
  const { page, scene, gallery } = await scenePage();
  assert.equal(gallery.durationOf(scene[0].view), 29);
  assert.equal(gallery.durationOf(scene[2].view), 14.67, 'known before it is fetched');
  assert.equal(gallery.durationOf({}), null);
  page.videos[0].emit('error');
  assert.equal(gallery.durationOf(scene[0].view), null);
});

test('disposed: the scene no longer drives the loops', async () => {
  const { stage, gallery } = await scenePage();
  assert.equal(stage.subscribers.size, 1);
  gallery.dispose();
  assert.equal(stage.subscribers.size, 0);
});

test('a recording\'s story begins at 0, or where a turned-round film says it does', () => {
  assert.equal(openingOf({ durationS: 6 }), 0);
  assert.equal(openingOf({ durationS: 14.67, openingS: 11.67 }), 11.67);
  assert.equal(openingOf({ durationS: 6, openingS: 9 }), 0, 'past the end: ignored');
  assert.equal(openingOf({ durationS: 6, openingS: -1 }), 0);
  assert.equal(openingOf(null), 0);
});

test('the scene: pointed at, a view restarts from its story\'s beginning, not where it was left', async () => {
  const { page, stage, videoOf } = await scenePage();
  stage.select(1);
  await tick();
  const grid = videoOf('view:03');
  assert.ok(grid, 'the power-grid film is fetched as the next in line');
  assert.equal(grid.currentTime, 11.67, 'cued on Europe dark before it is ever shown');
  grid.currentTime = 4;
  stage.select(2);
  assert.equal(grid.currentTime, 11.67, 'France switching on, not the middle of the film');
  assert.equal(grid.paused, true, 'held on Europe dark while the view fades in');
  page.advance(STAGE_ENTRY_HOLD_MS - 1);
  assert.equal(grid.paused, true);
  page.advance(1);
  assert.equal(grid.paused, false, 'then the story plays');
  const loop = videoOf('view:02');
  loop.currentTime = 3.3;
  stage.select(1);
  assert.equal(loop.currentTime, 0, 'a loop starts at 0');
});

test('a film cued before its metadata is cued again once it has them, unless it already moved', async () => {
  const { stage, videoOf } = await scenePage();
  stage.select(1);
  await tick();
  const grid = videoOf('view:03');
  grid.currentTime = 0; // the browser dropped the early seek
  grid.emit('loadedmetadata');
  assert.equal(grid.currentTime, 11.67);
});

test('the scene: the reader reaching for the bar fetches every view, each cued at its opening', async () => {
  const { page, stage, gallery } = await scenePage();
  assert.equal(page.videos.length, 2);
  stage.browsing = true;
  stage.subscribers.forEach((fn) => fn({ type: 'browse' }));
  await tick();
  assert.equal(page.videos.length, 3);
  const grid = page.boxes[2].inserted[0];
  assert.equal(grid.currentTime, 11.67, 'ready on Europe dark');
  assert.equal(grid.paused, true, 'fetched, not played');
  assert.ok('data-cut' in grid.attrs, 'its still is not its opening: it cuts in rather than fading over it');
  assert.equal('data-cut' in page.boxes[1].inserted[0].attrs, false, 'a loop fades in over its own frame 0');
  assert.equal(gallery.getDiagnostics().items['view:03'].state, 'loading');
  // Shown on its opening frame before it plays, over the still (frame 0, the grid lit).
  grid.readyState = 2;
  grid.emit('seeked');
  assert.ok('data-cued' in grid.attrs);
});
