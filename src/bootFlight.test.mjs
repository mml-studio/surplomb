// src/bootFlight.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginBootFlight,
  endBootFlight,
  bootFlightInProgress,
  whenBootFlightEnds,
  _resetBootFlightForTest,
  BOOT_FLIGHT_DEADLINE_MS,
} from './bootFlight.js';

beforeEach(() => _resetBootFlightForTest());

test('with no flight declared, work runs immediately', () => {
  // The common case by a wide margin: a share link, a second visit, a reader
  // who navigates. None of them fly, and none of them may be held.
  let ran = 0;
  whenBootFlightEnds(() => { ran += 1; });
  assert.equal(ran, 1);
  assert.equal(bootFlightInProgress(), false);
});

test('during a flight, work waits — and then all of it runs', () => {
  beginBootFlight();
  assert.equal(bootFlightInProgress(), true);
  const order = [];
  whenBootFlightEnds(() => order.push('a'));
  whenBootFlightEnds(() => order.push('b'));
  assert.deepEqual(order, []);
  endBootFlight();
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(bootFlightInProgress(), false);
});

test('a waiter runs exactly once, however many times the end is declared', () => {
  beginBootFlight();
  let ran = 0;
  whenBootFlightEnds(() => { ran += 1; });
  endBootFlight();
  endBootFlight();
  endBootFlight();
  assert.equal(ran, 1);
});

test('a second begin during a flight does not restart or lose waiters', () => {
  // `onCameraChanged` fires on every frame of the descent; a begin that reset
  // the queue would drop the layer's booking on the floor.
  beginBootFlight();
  let ran = 0;
  whenBootFlightEnds(() => { ran += 1; });
  beginBootFlight();
  assert.equal(ran, 0);
  endBootFlight();
  assert.equal(ran, 1);
});

test('a waiter that throws does not strand the ones behind it', () => {
  beginBootFlight();
  const ran = [];
  whenBootFlightEnds(() => { throw new Error('layer blew up'); });
  whenBootFlightEnds(() => ran.push('second'));
  endBootFlight();
  assert.deepEqual(ran, ['second']);
});

test('a waiter that re-books waits for the NEXT flight, not this loop', () => {
  beginBootFlight();
  let ran = 0;
  whenBootFlightEnds(function again() {
    ran += 1;
    if (ran < 5) whenBootFlightEnds(again); // no flight now → runs immediately
  });
  endBootFlight();
  // Re-booking with no flight in progress runs straight away, so this
  // terminates rather than looping inside the drain.
  assert.equal(ran, 5);
});

test('a dropped completion releases the layers on the deadline', () => {
  // `flyTo` raises `complete` OR `cancel`; a layer waiting on one of them is
  // one lost callback away from never loading at all.
  let fire = null;
  beginBootFlight({
    deadlineMs: 1234,
    setTimer: (fn, ms) => { fire = { fn, ms }; return 'handle'; },
    clearTimer: () => {},
  });
  let ran = 0;
  whenBootFlightEnds(() => { ran += 1; });
  assert.equal(fire.ms, 1234);
  assert.equal(ran, 0);
  fire.fn();
  assert.equal(ran, 1);
  assert.equal(bootFlightInProgress(), false);
});

test('the deadline is three times the flight, not a whisker over it', () => {
  // The flight is 4 s behind a 500 ms pause. A deadline that merely cleared
  // it would fire on any machine slow enough to need this mechanism at all.
  assert.ok(BOOT_FLIGHT_DEADLINE_MS >= 3 * 4500, `deadline ${BOOT_FLIGHT_DEADLINE_MS} ms`);
});
