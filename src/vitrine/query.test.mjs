// `?q=`: read once, gone from the address at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeInitialQuery } from './query.js';

function refs(href) {
  const calls = [];
  return {
    calls,
    location: { href },
    history: { state: null, replaceState: (state, title, url) => calls.push(url) },
  };
}

test('a query is trimmed, returned and removed, and the rest of the address survives', () => {
  const r = refs('https://surplomb.app/?input=phone&q=%20Lyon%20#v=2&lat=1');
  assert.equal(takeInitialQuery(r), 'Lyon');
  assert.deepEqual(r.calls, ['/?input=phone#v=2&lat=1']);
});

test('an empty field is the initial view, not an absent one', () => {
  const r = refs('https://surplomb.app/?q=');
  assert.equal(takeInitialQuery(r), '');
  assert.deepEqual(r.calls, ['/']);
});

test('no query, no rewrite', () => {
  const r = refs('https://surplomb.app/#v=2&lat=1');
  assert.equal(takeInitialQuery(r), null);
  assert.deepEqual(r.calls, []);
});

test('a runaway paste is bounded, and a refusing history does not lose the answer', () => {
  const long = 'a'.repeat(500);
  const r = {
    location: { href: `https://surplomb.app/?q=${long}` },
    history: { replaceState() { throw new Error('sandboxed'); } },
  };
  assert.equal(takeInitialQuery(r).length, 200);
});
