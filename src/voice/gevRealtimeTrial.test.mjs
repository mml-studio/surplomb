// The hosted voice trial on the realtime path: three spoken answers, then the
// session closes itself and the premium card opens. The server cannot count
// these (the browser talks to OpenAI directly), so this is where the limit
// lives, and where a silent miss would hand out an unlimited session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GevRealtimeController,
  TRIAL_AUDIO_TAIL_MS,
  TRIAL_CLOSE_FALLBACK_MS,
  isSpokenAnswer,
  readTrialTurns,
} from './gevRealtime.js';
import { TRIAL_VOICE_TURNS_HEADER } from '../trialQuota.js';
import { WAITLIST_OPEN_EVENT } from '../trialRefusal.js';

const spoken = (id) => ({
  type: 'response.done',
  response: { id, status: 'completed', output: [{ type: 'message', role: 'assistant' }] },
});
const toolCall = (id) => ({
  type: 'response.done',
  response: { id, status: 'completed', output: [{ type: 'function_call', name: 'fly_to_location', call_id: `${id}-call` }] },
});
const failed = (id) => ({
  type: 'response.done',
  response: {
    id,
    status: 'failed',
    output: [],
    status_details: { error: { code: 'rate_limit_exceeded', message: 'Please try again in 12s' } },
  },
});

function trialController(t, turns = 3) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWindow = globalThis.window;
  const cards = [];
  const target = new EventTarget();
  target.addEventListener(WAITLIST_OPEN_EVENT, (event) => cards.push(event.detail));
  globalThis.window = target;
  t.after(() => { globalThis.window = previousWindow; });

  const ui = {
    root: { dataset: {}, classList: { remove() {} }, querySelectorAll: () => [] },
    status: { textContent: '' },
    detail: { textContent: '', title: '' },
    errorDetail: { textContent: '' },
  };
  const track = { enabled: true, stop() {} };
  const controller = new GevRealtimeController({ runner: async () => ({ ok: true }), ui });
  controller.debugLog = () => {};
  controller.sendVisualContextIfUseful = async () => false;
  controller.recordRateLimits = () => {};
  controller.rateLimitRetryDelayMs = () => null;
  const channel = { closed: false, readyState: 'open', send() {}, close() { this.closed = true; this.readyState = 'closed'; } };
  controller.voiceConfigPromise = Promise.resolve({ provider: 'openai', reachable: true, waitlist: null });
  controller.dc = channel;
  controller.stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  controller.status = 'listening';
  controller.beginTrialSession(turns);
  const feed = (payload) => controller.handleRealtimeEvent({ data: JSON.stringify(payload) });
  const flushMicrotasks = () => new Promise((resolve) => queueMicrotask(resolve));
  return { controller, cards, track, channel, feed, flushMicrotasks };
}

test('the page and the server name the trial header the same way', () => {
  const headers = new Headers({ [TRIAL_VOICE_TURNS_HEADER]: '3' });
  assert.equal(readTrialTurns(headers), 3);
  assert.equal(readTrialTurns(new Headers()), null, 'no header: not a trial');
  for (const junk of ['', ' ', 'three', '-1', '2.5']) {
    assert.equal(readTrialTurns(new Headers({ [TRIAL_VOICE_TURNS_HEADER]: junk })), null, JSON.stringify(junk));
  }
  assert.equal(readTrialTurns(undefined), null);
});

test('an answer is a completed response that speaks and calls nothing', () => {
  assert.equal(isSpokenAnswer(spoken('a').response), true);
  assert.equal(isSpokenAnswer(toolCall('b').response), false, 'the confirmation after it is the answer');
  assert.equal(isSpokenAnswer({
    status: 'completed',
    output: [{ type: 'message' }, { type: 'function_call' }],
  }), false, 'a sentence that also calls a tool is followed by its confirmation');
  assert.equal(isSpokenAnswer(failed('c').response), false);
  assert.equal(isSpokenAnswer({ status: 'cancelled', output: [{ type: 'message' }] }), false);
  assert.equal(isSpokenAnswer(undefined), false);
});

test('three answers, then the mic is shut and the session closes after the audio', async (t) => {
  const { controller, cards, track, channel, feed, flushMicrotasks } = trialController(t);

  // A command: its tool call costs nothing, its confirmation is the answer.
  await feed(toolCall('r1'));
  assert.equal(controller.trialAnswersLeft, 3);
  await feed(spoken('r1-confirm'));
  assert.equal(controller.trialAnswersLeft, 2);
  assert.equal(controller.ui.detail.textContent, '2 commandes offertes');
  // The site-wide token limit is a wait, not an answer.
  await feed(failed('r2-limited'));
  assert.equal(controller.trialAnswersLeft, 2);
  await feed(spoken('r2'));
  assert.equal(controller.ui.detail.textContent, 'Dernière commande offerte');

  await feed({ type: 'output_audio_buffer.started' });
  await feed(spoken('r3'));
  assert.equal(controller.trialClosing, true);
  assert.equal(track.enabled, false, 'a fourth question cannot start');
  controller.setMicrophoneEnabled(true);
  assert.equal(track.enabled, false, 'push-to-talk cannot reopen it');
  assert.throws(() => controller.sendTextCommand('et encore une'), /trial is over/);

  // Still talking: nothing closes, however long the tail wait.
  t.mock.timers.tick(TRIAL_AUDIO_TAIL_MS * 3);
  assert.equal(channel.closed, false, 'the last answer is not cut off');
  await feed({ type: 'output_audio_buffer.stopped' });
  t.mock.timers.tick(TRIAL_AUDIO_TAIL_MS);
  assert.equal(channel.closed, true);
  assert.equal(controller.status, 'idle');
  assert.equal(controller.ui.detail.textContent, 'Commandes offertes utilisées');
  await flushMicrotasks();
  assert.deepEqual(cards, [{ reason: 'voice', explicit: true }]);
  assert.equal(controller.trialAnswersLeft, null, 'the next session starts clean');
  // The config cached at the first click said the trial was open. The next
  // click must ask the server again, or it lights the mic before the refusal.
  assert.equal(controller.voiceConfigPromise, null);
});

test('a server that never reports the end of the audio still closes the trial', async (t) => {
  const { cards, channel, feed, flushMicrotasks } = trialController(t, 1);
  await feed({ type: 'output_audio_buffer.started' });
  await feed(spoken('only'));
  t.mock.timers.tick(TRIAL_CLOSE_FALLBACK_MS - 1);
  assert.equal(channel.closed, false);
  t.mock.timers.tick(1);
  assert.equal(channel.closed, true);
  await flushMicrotasks();
  assert.equal(cards.length, 1);
});

test('stopping a trial session by hand still says the voice is premium', async (t) => {
  const { controller, cards, feed, flushMicrotasks } = trialController(t);
  await feed(spoken('one'));
  controller.stop();
  await flushMicrotasks();
  assert.deepEqual(cards, [{ reason: 'voice', explicit: true }]);
  assert.equal(controller.ui.detail.textContent, 'Commandes offertes utilisées');
});

test('a trial session that ends on a fault keeps its error, and opens no card', async (t) => {
  const { controller, cards, flushMicrotasks } = trialController(t);
  controller.fatalError('Realtime data channel closed');
  await flushMicrotasks();
  assert.equal(controller.status, 'error');
  assert.deepEqual(cards, []);
});

test('an ordinary session counts nothing and opens nothing', async (t) => {
  const { controller, cards, channel, track, feed, flushMicrotasks } = trialController(t, null);
  for (let i = 0; i < 5; i += 1) await feed(spoken(`free-${i}`));
  assert.equal(controller.trialClosing, false);
  assert.equal(track.enabled, true);
  controller.stop();
  await flushMicrotasks();
  assert.equal(channel.closed, true);
  assert.deepEqual(cards, []);
  assert.equal(controller.ui.detail.textContent, 'Voice off');
});
