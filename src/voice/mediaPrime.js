/**
 * The two objects iOS will only hand over during a tap, taken during the tap.
 *
 * ── THE THREE-LINE VERSION ──────────────────────────────────────────────────
 *
 * Safari on iOS grants audio output exactly once per gesture, SYNCHRONOUSLY,
 * inside the handler the reader's finger triggered. The moment that handler
 * awaits anything — a dynamic import, `getUserMedia`, a fetch — the transient
 * activation is spent, and every `play()` and `AudioContext` created afterwards
 * is refused. The voice stack did all three: the module is lazy-loaded on the
 * click, the `<audio autoplay>` element is created after `await getUserMedia`,
 * and the `AudioContext` after that. The assistant therefore connected, the
 * transcript scrolled, the meter moved — and nothing was ever heard. Not a bug
 * anyone could see from a desktop.
 *
 * This module is the fix, and it is deliberately dependency-free and tiny so
 * the boot chunk can import it: it runs on the FIRST line of the click handler,
 * before the `await import()` that loads the 360 kB, and holds what it took.
 *
 * ── WHY A SINGLETON, AND WHY IT IS NEVER CLOSED ─────────────────────────────
 *
 * An `AudioContext` that has been unlocked stays unlocked, and iOS caps how
 * many a page may create (six, historically) before `new AudioContext()` starts
 * throwing. A session that closed its context on stop and built another on the
 * next start would work five times and then go permanently silent. So both the
 * element and the context outlive every session; `stop()` detaches the stream
 * and leaves the objects in place.
 *
 * ── WHY `playsinline` ───────────────────────────────────────────────────────
 *
 * Without it, iOS may route a media element to full-screen playback. An
 * invisible audio element flipping the page to a black full-screen player the
 * moment the assistant speaks is a worse failure than silence.
 *
 * @module voice/mediaPrime
 */

/** Marks the one audio element every session shares. */
export const REALTIME_AUDIO_ATTRIBUTE = 'data-gev-realtime-audio';

let _audioEl = null;
let _audioContext = null;

/**
 * Take the audio grant. Synchronous, and safe to call on every tap.
 *
 * @param {object} [options]
 * @param {Document} [options.doc]
 * @param {Function} [options.AudioContextClass] Injected for tests.
 * @returns {{audioEl: ?HTMLAudioElement, audioContext: ?AudioContext}}
 */
export function primeVoiceMedia({
  doc = globalThis.document,
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
} = {}) {
  if (!_audioEl && doc?.createElement) {
    // A previous build's element, or one left by a session that predates this
    // module: adopt it rather than stacking a second hidden player.
    _audioEl = doc.querySelector?.(`audio[${REALTIME_AUDIO_ATTRIBUTE}="true"]`) || null;
    if (!_audioEl) {
      _audioEl = doc.createElement('audio');
      _audioEl.autoplay = true;
      _audioEl.setAttribute('playsinline', '');
      _audioEl.setAttribute(REALTIME_AUDIO_ATTRIBUTE, 'true');
      _audioEl.style.display = 'none';
      doc.body?.appendChild(_audioEl);
    }
  }
  if (!_audioContext && typeof AudioContextClass === 'function') {
    try {
      _audioContext = new AudioContextClass();
    } catch {
      // Six contexts already alive, or audio disabled by policy. The element
      // alone still plays; only the meter is lost.
      _audioContext = null;
    }
  }
  resumeVoiceMedia();
  return { audioEl: _audioEl, audioContext: _audioContext };
}

/**
 * Re-take the grant on a later tap.
 *
 * iOS suspends an `AudioContext` when the tab goes to the background and does
 * not resume it on return, and an element whose stream was detached needs its
 * `play()` again. Both calls are fire-and-forget: a refusal here is not an
 * error, it is a reader who has not tapped yet.
 * @returns {void}
 */
export function resumeVoiceMedia() {
  try { void _audioEl?.play?.()?.catch?.(() => {}); } catch { /* not yet granted */ }
  try { void _audioContext?.resume?.()?.catch?.(() => {}); } catch { /* not yet granted */ }
}

/** @returns {?HTMLAudioElement} The shared element, if it has been primed. */
export function getVoiceAudioElement() {
  return _audioEl;
}

/** @returns {?AudioContext} The shared context, if one could be created. */
export function getVoiceAudioContext() {
  return _audioContext;
}

/** Test seam: drop both handles without touching the DOM. Not used by the app. */
export function resetVoiceMediaForTests() {
  _audioEl = null;
  _audioContext = null;
}
