import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REALTIME_AUDIO_ATTRIBUTE,
  getVoiceAudioContext,
  getVoiceAudioElement,
  primeVoiceMedia,
  resetVoiceMediaForTests,
  resumeVoiceMedia,
} from './mediaPrime.js';

/** A document stand-in that records what was built and appended. */
function stubDoc({ existing = null } = {}) {
  const appended = [];
  return {
    appended,
    querySelector: () => existing,
    createElement() {
      const attrs = {};
      return {
        style: {},
        plays: 0,
        setAttribute(name, value) { attrs[name] = String(value); },
        getAttribute(name) { return name in attrs ? attrs[name] : null; },
        hasAttribute(name) { return name in attrs; },
        play() { this.plays += 1; return Promise.resolve(); },
      };
    },
    body: { appendChild: (el) => appended.push(el) },
  };
}

function stubContextClass({ throws = false } = {}) {
  const made = [];
  class Ctx {
    constructor() {
      if (throws) throw new Error('too many AudioContexts');
      this.resumes = 0;
      this.closed = 0;
      made.push(this);
    }

    resume() { this.resumes += 1; return Promise.resolve(); }
    close() { this.closed += 1; return Promise.resolve(); }
  }
  Ctx.made = made;
  return Ctx;
}

test('the grant is taken synchronously, and the element declares playsinline', async () => {
  resetVoiceMediaForTests();
  const doc = stubDoc();
  const AudioContextClass = stubContextClass();
  const { audioEl, audioContext } = primeVoiceMedia({ doc, AudioContextClass });

  assert.ok(audioEl, 'no element was taken');
  assert.equal(audioEl.autoplay, true);
  // Without it, iOS may route the element to full-screen playback: a black
  // player over the globe the moment the assistant speaks.
  assert.equal(audioEl.hasAttribute('playsinline'), true);
  assert.equal(audioEl.getAttribute(REALTIME_AUDIO_ATTRIBUTE), 'true');
  assert.deepEqual(doc.appended, [audioEl]);
  // `play()` and `resume()` are the grant, and both happen inside the call —
  // not after an await a tap's activation would not survive.
  assert.equal(audioEl.plays, 1);
  assert.equal(audioContext.resumes, 1);
  await Promise.resolve();
});

test('priming twice reuses one element and one context', () => {
  resetVoiceMediaForTests();
  const doc = stubDoc();
  const AudioContextClass = stubContextClass();
  const first = primeVoiceMedia({ doc, AudioContextClass });
  const second = primeVoiceMedia({ doc, AudioContextClass });
  assert.equal(first.audioEl, second.audioEl);
  assert.equal(first.audioContext, second.audioContext);
  assert.equal(doc.appended.length, 1, 'a second hidden player must never stack');
  // iOS caps how many contexts a page may create; a session that made its own
  // each time would work a handful of times and then go silent for good.
  assert.equal(AudioContextClass.made.length, 1);
  assert.equal(first.audioEl.plays, 2, 'a later tap re-takes the grant');
  assert.equal(first.audioContext.resumes, 2);
});

test('an element left by a previous build is adopted, not duplicated', () => {
  resetVoiceMediaForTests();
  const existing = { style: {}, plays: 0, play() { this.plays += 1; return Promise.resolve(); } };
  const doc = stubDoc({ existing });
  primeVoiceMedia({ doc, AudioContextClass: stubContextClass() });
  assert.equal(getVoiceAudioElement(), existing);
  assert.deepEqual(doc.appended, []);
});

test('a refused AudioContext costs the meter, never the playback', () => {
  resetVoiceMediaForTests();
  const doc = stubDoc();
  const { audioEl, audioContext } = primeVoiceMedia({
    doc,
    AudioContextClass: stubContextClass({ throws: true }),
  });
  assert.ok(audioEl, 'the element is what actually plays');
  assert.equal(audioContext, null);
  assert.equal(getVoiceAudioContext(), null);
  // And resuming nothing is not a throw.
  assert.doesNotThrow(() => resumeVoiceMedia());
});

test('a rejected play() is a refusal to report, not an unhandled rejection', async () => {
  resetVoiceMediaForTests();
  const doc = stubDoc({
    existing: { style: {}, play: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) },
  });
  assert.doesNotThrow(() => primeVoiceMedia({ doc, AudioContextClass: stubContextClass() }));
  await new Promise((resolve) => { setTimeout(resolve, 5); });
});

test('the primer runs before the await on both click paths', () => {
  // THE WHOLE BUG. `await import()` and `await getUserMedia` each spend the
  // tap's transient activation; anything created afterwards plays to nobody.
  const lazy = readFileSync(new URL('./lazyVoice.js', import.meta.url), 'utf8');
  const lazyHandler = lazy.match(/const onButtonClick = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(lazyHandler, 'onButtonClick is gone');
  assert.ok(
    lazyHandler[1].indexOf('primeVoiceMedia()') < lazyHandler[1].indexOf('load()'),
    'the grant must be taken before the dynamic import',
  );

  const realtime = readFileSync(new URL('./gevRealtime.js', import.meta.url), 'utf8');
  const buttonHandler = realtime.match(/controller\.buttonHandler = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(buttonHandler, 'buttonHandler is gone');
  assert.ok(
    buttonHandler[1].indexOf('primeVoiceMedia()') < buttonHandler[1].indexOf('controller.start('),
    'the grant must be taken before start() awaits getUserMedia',
  );

  // And the session adopts the primed element rather than building one after
  // the await, which is exactly what it used to do.
  assert.match(realtime, /this\.audioEl = primeVoiceMedia\(\)\.audioEl;/);
  assert.doesNotMatch(realtime, /this\.audioEl = document\.createElement\('audio'\)/);
  // Detached on stop, never removed: the element carries the grant.
  assert.match(realtime, /this\.audioEl\.srcObject = null;/);
  assert.doesNotMatch(realtime, /this\.audioEl\.remove\(\)/);
  // The meter shares the unlocked context and must not close it.
  assert.doesNotMatch(realtime, /visualizerAudioContext\.close\(\)/);
});

test('an assistant track that will not play says so instead of looking fine', () => {
  const realtime = readFileSync(new URL('./gevRealtime.js', import.meta.url), 'utf8');
  const ontrack = realtime.match(/this\.pc\.ontrack = \(event\) => \{([\s\S]*?)\n      \};/);
  assert.ok(ontrack, 'ontrack is gone');
  assert.match(ontrack[1], /this\.audioEl\.play\?\.\(\)\.catch\(/);
  assert.match(ontrack[1], /NotAllowedError/);
});

test('a live session does not keep the microphone once the app is off screen', () => {
  const realtime = readFileSync(new URL('./gevRealtime.js', import.meta.url), 'utf8');
  assert.match(realtime, /suspendVoiceInBackground\(\) \{[\s\S]*?if \(!isCoarseInput\(\) \|\| !this\.isActive\(\)\) return;/);
  // iOS fires `pagehide`, not `visibilitychange`, on its back/forward cache.
  assert.match(realtime, /window\.addEventListener\('pagehide', this\.shortcutPageHideHandler\)/);
  assert.match(realtime, /window\.removeEventListener\('pagehide', this\.shortcutPageHideHandler\)/);
});
