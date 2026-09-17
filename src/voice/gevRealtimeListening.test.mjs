// LISTENING means the microphone is open, and nothing else.
//
// Reported on surplomb.app, 2026-09-17: the dock said LISTENING while nothing
// was listening. `status` is the session's phase, and the dock printed it as
// it stood — so an open session under a muted push-to-talk mic, or one busy
// answering, read LISTENING. A click is now one request: the mic opens, the
// server takes the request, the mic shuts. Space opens it while held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GevRealtimeController,
  TRIAL_IDLE_CLOSE_MS,
  VOICE_IDLE_CLOSE_MS,
} from './gevRealtime.js';
import { GevBrainVoiceSession } from './gevBrainVoice.js';

function listeningController(t, { trialTurns = null, pushToTalk = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = {
    root: { dataset: {}, classList: { remove() {} }, querySelectorAll: () => [] },
    button: { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
    status: { textContent: '' },
    detail: { textContent: '', title: '' },
    errorDetail: { textContent: '' },
  };
  const track = { enabled: true, stop() {} };
  const controller = new GevRealtimeController({ runner: async () => ({ ok: true }), ui });
  controller.debugLog = () => {};
  controller.recordRateLimits = () => {};
  const starts = [];
  controller.start = async (options) => { starts.push(options); };
  const channel = { readyState: 'open', send() {}, close() { this.readyState = 'closed'; } };
  controller.dc = channel;
  controller.stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  controller.pushToTalkMode = pushToTalk;
  if (trialTurns !== null) controller.beginTrialSession(trialTurns);
  // What start() leaves behind once the data channel opens.
  controller.setMicrophoneEnabled(!pushToTalk);
  controller.setStatus('listening');
  const feed = (type, extra = {}) => controller.handleRealtimeEvent({ data: JSON.stringify({ type, ...extra }) });
  const shown = () => [ui.status.textContent, ui.root.dataset.status];
  return { controller, ui, track, channel, starts, feed, shown };
}

const spokenAnswer = {
  response: { id: 'r1', status: 'completed', output: [{ type: 'message', role: 'assistant' }] },
};

test('a click session says LISTENING, and stops saying it once the request is taken', async (t) => {
  const { controller, ui, track, feed, shown } = listeningController(t);
  assert.deepEqual(shown(), ['LISTENING', 'listening']);
  assert.equal(ui.detail.textContent, 'Question ou commande');
  assert.equal(ui.button.attributes['aria-pressed'], 'true');

  await feed('input_audio_buffer.speech_started');
  assert.deepEqual(shown(), ['LISTENING', 'listening'], 'still hearing the request');
  await feed('input_audio_buffer.committed');
  assert.equal(track.enabled, false, 'nothing said after the request is sent');
  assert.equal(controller.microphoneLive, false);
  assert.deepEqual(shown(), ['ANSWERING', 'answering']);
  assert.equal(ui.button.attributes['aria-pressed'], 'false');

  await feed('response.created', { response: { id: 'r1' } });
  await feed('output_audio_buffer.started');
  await feed('response.done', spokenAnswer);
  assert.deepEqual(shown(), ['ANSWERING', 'answering'], 'the answer is still playing');
  await feed('output_audio_buffer.stopped');
  assert.deepEqual(shown(), ['READY', 'ready']);
  assert.equal(ui.detail.textContent, 'Micro ou Espace pour parler');
  assert.equal(controller.status, 'listening', 'the session itself stays open');
});

test('a click on a shut mic opens it for the next request, without a new session', (t) => {
  const { controller, track, channel, starts, shown } = listeningController(t, { trialTurns: 3 });
  controller.setMicrophoneEnabled(false);
  assert.deepEqual(shown(), ['READY', 'ready']);

  controller.toggleListening();
  assert.deepEqual(shown(), ['LISTENING', 'listening']);
  assert.equal(track.enabled, true);
  assert.deepEqual(starts, [], 'no second session: minting one would spend a second trial');

  // A click on an open mic cancels the listen, and keeps the trial's session.
  controller.toggleListening();
  assert.deepEqual(shown(), ['READY', 'ready']);
  assert.equal(channel.readyState, 'open');
  assert.equal(controller.trialAnswersLeft, 3);
});

test('a click on an idle dock starts a session; a click while connecting cancels it', (t) => {
  const { controller, starts } = listeningController(t);
  controller.stop();
  assert.equal(controller.status, 'idle');
  controller.toggleListening();
  assert.deepEqual(starts, [{ pushToTalk: false }]);

  controller.status = 'connecting';
  controller.toggleListening();
  assert.equal(controller.status, 'idle');
});

test('the dock names the trial while the mic is shut, and never says LISTENING', async (t) => {
  const { controller, ui, feed, shown } = listeningController(t, { trialTurns: 3 });
  assert.equal(ui.detail.textContent, '3 commandes offertes');
  await feed('input_audio_buffer.committed');
  await feed('response.done', spokenAnswer);
  assert.deepEqual(shown(), ['READY', 'ready']);
  assert.equal(ui.detail.textContent, '2 commandes offertes');
  assert.equal(controller.microphoneLive, false);
});

test('a caption with news survives the shut mic, and goes once the operator acts', (t) => {
  const { controller, ui, shown } = listeningController(t);
  controller.setMicrophoneEnabled(false);
  controller.setStatus('listening', 'TOKEN LIMIT REACHED — RESETS IN 12 S');
  assert.deepEqual(shown(), ['READY', 'ready']);
  assert.equal(ui.detail.textContent, 'TOKEN LIMIT REACHED — RESETS IN 12 S');
  controller.toggleListening();
  assert.equal(ui.detail.textContent, 'Question ou commande');
});

function bindKeys(t, controller) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  t.after(() => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  });
  controller.bindPushToTalkShortcut();
  const target = { isContentEditable: false, closest: () => null };
  const key = (type) => {
    const event = { code: 'Space', key: ' ', target, repeat: false, preventDefault() {} };
    if (type === 'keydown') controller.shortcutKeyDownHandler(event);
    else controller.shortcutKeyUpHandler(event);
  };
  return key;
}

test('Space held says LISTENING; released, it does not', (t) => {
  const { controller, ui, track, shown } = listeningController(t, { pushToTalk: true });
  const key = bindKeys(t, controller);
  assert.deepEqual(shown(), ['READY', 'ready'], 'a push-to-talk session at rest is not listening');
  assert.equal(track.enabled, false);

  key('keydown');
  assert.deepEqual(shown(), ['LISTENING', 'listening']);
  assert.equal(ui.detail.textContent, 'Relâchez Espace pour envoyer');
  assert.equal(track.enabled, true);

  key('keyup');
  assert.deepEqual(shown(), ['READY', 'ready']);
  assert.equal(track.enabled, false);
});

test('Space claims a click-started session, and a request taken mid-hold keeps the mic', async (t) => {
  const { controller, track, feed, shown } = listeningController(t);
  const key = bindKeys(t, controller);
  controller.setMicrophoneEnabled(false);

  key('keydown');
  assert.deepEqual(shown(), ['LISTENING', 'listening']);
  // A pause mid-sentence lets the server commit; the finger is still down.
  await feed('input_audio_buffer.committed');
  assert.equal(track.enabled, true);
  assert.deepEqual(shown(), ['LISTENING', 'listening']);

  key('keyup');
  assert.equal(track.enabled, false);
  assert.notEqual(shown()[0], 'LISTENING');
});

test('a shut mic closes an ordinary session after the idle delay', (t) => {
  const { controller, channel } = listeningController(t);
  controller.setMicrophoneEnabled(false);
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS - 1);
  assert.equal(controller.status, 'listening');
  t.mock.timers.tick(1);
  assert.equal(controller.status, 'idle');
  assert.equal(channel.readyState, 'closed', 'the microphone and the connection are released');
});

test('opening the mic, or an answer still playing, holds the idle close off', (t) => {
  const { controller } = listeningController(t);
  controller.setMicrophoneEnabled(false);
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS - 10);
  controller.toggleListening();
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS);
  assert.equal(controller.status, 'listening', 'an open mic never idles out');

  controller.toggleListening();
  controller.assistantAudioPlaying = true;
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS);
  assert.equal(controller.status, 'listening', 'a long answer is not idleness');
  controller.assistantAudioPlaying = false;
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS);
  assert.equal(controller.status, 'idle');
});

test('a trial session idles far longer, because closing it spends the trial', (t) => {
  const { controller } = listeningController(t, { trialTurns: 3 });
  controller.announceTrialEnd = () => {};
  controller.setMicrophoneEnabled(false);
  t.mock.timers.tick(VOICE_IDLE_CLOSE_MS);
  assert.equal(controller.status, 'listening');
  t.mock.timers.tick(TRIAL_IDLE_CLOSE_MS - VOICE_IDLE_CLOSE_MS);
  assert.equal(controller.status, 'idle');
});

test('the keyless path shuts the ears after a request and paints LISTENING only while open', async (t) => {
  const { controller, shown } = listeningController(t);
  controller.stop();
  controller.setVoiceOptions = () => {};
  class FakeRecognition {
    start() {}
    stop() {}
    abort() {}
  }
  const session = new GevBrainVoiceSession({
    host: controller,
    runner: async () => ({ ok: true }),
    config: { language: 'fr-FR', model: 'x/brain', maxRounds: 2 },
    fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: '' }, usage: {} }) }),
    scope: { SpeechRecognition: FakeRecognition },
  });
  controller.brainSession = session;
  await session.start({});
  assert.deepEqual(shown(), ['LISTENING', 'listening']);

  const final = (transcript) => ({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] });
  session.handleRecognitionResult(final('va à Lyon'));
  assert.equal(session.micEnabled, false, 'the next sentence is not a request');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.busy, false);
  assert.deepEqual(shown(), ['READY', 'ready']);

  // Heard while shut: neither painted nor sent.
  session.handleRecognitionResult({ resultIndex: 0, results: [Object.assign([{ transcript: 'bruit' }], { isFinal: false })] });
  assert.equal(controller.ui.status.textContent, 'READY');
  controller.toggleListening();
  assert.equal(session.micEnabled, true);
  assert.deepEqual(shown(), ['LISTENING', 'listening']);
  session.stop();
});
