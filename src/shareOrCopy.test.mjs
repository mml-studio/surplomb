// src/shareOrCopy.test.mjs
// The four things that can happen when a reader asks for the link, and the one
// rule that decides between them: a phone gets the system sheet, a desktop
// keeps the clipboard it already had.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareOrCopy } from './sharelink.js';

const URL_UNDER_TEST = 'https://surplomb.app/#lat=48.85&lon=2.29';

function harness({ share, canShare, clipboardWrite } = {}) {
  const calls = { share: [], clipboard: [] };
  return {
    calls,
    share: share === null ? undefined : (payload) => {
      calls.share.push(payload);
      return share ? share(payload) : Promise.resolve();
    },
    canShare,
    clipboardWrite: clipboardWrite === null ? undefined : (text) => {
      calls.clipboard.push(text);
      return clipboardWrite ? clipboardWrite(text) : Promise.resolve();
    },
  };
}

test('a finger gets the system sheet, with the title and the url', async () => {
  const h = harness();
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...h, coarse: true, title: 'Surplomb' }), 'shared');
  assert.deepEqual(h.calls.share, [{ title: 'Surplomb', url: URL_UNDER_TEST }]);
  assert.deepEqual(h.calls.clipboard, [], 'the link is not also pasted somewhere unseen');
});

test('a desktop keeps its clipboard even where the sheet exists', async () => {
  // Chrome and Edge both implement `navigator.share` on the desktop and answer
  // it with a picker of apps the reader never associated with this browser.
  const h = harness();
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...h, coarse: false }), 'copied');
  assert.deepEqual(h.calls.share, []);
  assert.deepEqual(h.calls.clipboard, [URL_UNDER_TEST]);
});

test('dismissing the sheet is not a failure and says nothing', async () => {
  const abort = Object.assign(new Error('share cancelled'), { name: 'AbortError' });
  const h = harness({ share: () => Promise.reject(abort) });
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...h, coarse: true }), 'cancelled');
  assert.deepEqual(h.calls.clipboard, [], 'a cancelled share must not silently copy instead');
});

test('a sheet that breaks falls back rather than losing the link', async () => {
  const h = harness({ share: () => Promise.reject(new Error('no share targets')) });
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...h, coarse: true }), 'copied');
  assert.deepEqual(h.calls.clipboard, [URL_UNDER_TEST]);

  // Safari answers `canShare(false)` for payloads a sheet cannot carry; calling
  // `share()` anyway would throw.
  const refused = harness({ canShare: () => false });
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...refused, coarse: true }), 'copied');
  assert.deepEqual(refused.calls.share, []);
});

test('with neither a sheet nor a clipboard, the answer is failed, not a throw', async () => {
  const h = harness({ share: null, clipboardWrite: null });
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...h, coarse: true }), 'failed');
  const denied = harness({ clipboardWrite: () => Promise.reject(new Error('denied')) });
  assert.equal(await shareOrCopy(URL_UNDER_TEST, { ...denied, coarse: false }), 'failed');
});

test('the share url is assembled before the first await', () => {
  // `navigator.share()` needs transient user activation, and the tap that
  // called it is spent by the first `await`. A snapshot built after one throws
  // `NotAllowedError` on every iPhone.
  const source = readFileSync(new URL('./sharelink.js', import.meta.url), 'utf8');
  const body = source.match(/async shareLink\(\{[^}]*\} = \{\}\) \{([\s\S]*?)\n  \}/);
  assert.ok(body, 'shareLink is gone');
  const handoff = body[1].indexOf('shareOrCopy(');
  assert.ok(handoff >= 0, 'shareLink no longer reaches the shared helper');
  const firstAwait = body[1].indexOf('await');
  assert.ok(firstAwait === -1 || firstAwait > handoff, 'the activation is spent before the sheet opens');
  assert.ok(body[1].indexOf('_buildHashParams()') < handoff);
  assert.ok(body[1].indexOf('url.hash =') < handoff);

  // And inside the helper, the decision is taken before anything is awaited.
  const decision = source.indexOf('const useSheet');
  const opened = source.indexOf('await share(');
  assert.ok(decision >= 0 && opened > decision, 'the sheet opens on the tap, not after a round trip');

  const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  assert.match(ui, /await this\.shareLinkManager\.shareLink\(\)/);
  assert.match(ui, /if \(outcome === 'copied'\)/);
});
