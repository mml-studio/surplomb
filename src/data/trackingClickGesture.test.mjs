import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CESIUM_CLICK_TOLERANCE_PX_COARSE,
  MAX_TRACKING_CLICK_DURATION_MS,
  MAX_TRACKING_CLICK_DURATION_MS_COARSE,
  MAX_TRACKING_CLICK_TRAVEL_PX,
  MAX_TRACKING_CLICK_TRAVEL_PX_COARSE,
  bindTrackingClickGesture,
  isTrackingClickGesture,
  isTrackingSelectionGesture,
  relaxHandlerClickTolerance,
  trackingClickLimits,
} from './trackingClickGesture.js';
import { TRACKED_MODEL_MAX_PX as CIVIL_TRACKED_MODEL_MAX_PX } from './flights.js';
import { TRACKED_MODEL_MAX_PX as MILITARY_TRACKED_MODEL_MAX_PX } from './militaryFlights.js';

const TYPES = {
  LEFT_DOWN: 'left-down',
  MOUSE_MOVE: 'mouse-move',
  LEFT_UP: 'left-up',
  LEFT_CLICK: 'left-click',
};

function makeHandler() {
  const actions = new Map();
  return {
    setInputAction(callback, type) { actions.set(type, callback); },
    fire(type, event) { actions.get(type)?.(event); },
  };
}

test('tracking click discrimination pins the travel/duration boundary matrix', () => {
  const matrix = [
    [{ travelPx: 0, durationMs: 0 }, true],
    [{ travelPx: 6, durationMs: 400 }, true],
    [{ travelPx: 6.001, durationMs: 400 }, false],
    [{ travelPx: 6, durationMs: 400.001 }, false],
    [{ travelPx: 20, durationMs: 50 }, false],
    [{ travelPx: 0, durationMs: 1000 }, false],
  ];
  for (const [gesture, expected] of matrix) {
    assert.equal(isTrackingClickGesture(gesture), expected, JSON.stringify(gesture));
  }
  assert.equal(isTrackingSelectionGesture({ travelPx: 0, durationMs: 1000 }), true);
  assert.equal(isTrackingSelectionGesture({ travelPx: 6.001, durationMs: 10 }), false);
});

test('synthetic drag-then-click sequence does not reach the untrack callback', () => {
  let timeMs = 0;
  let untrackCalls = 0;
  const handler = makeHandler();
  bindTrackingClickGesture(handler, (_click, gesture) => {
    if (isTrackingClickGesture(gesture)) untrackCalls += 1;
  }, {
    now: () => timeMs,
    eventTypes: TYPES,
  });

  handler.fire(TYPES.LEFT_DOWN, { position: { x: 10, y: 10 } });
  timeMs = 20;
  handler.fire(TYPES.MOUSE_MOVE, { endPosition: { x: 14, y: 10 } });
  timeMs = 40;
  handler.fire(TYPES.MOUSE_MOVE, { endPosition: { x: 10, y: 10 } });
  timeMs = 60;
  handler.fire(TYPES.LEFT_UP, { position: { x: 10, y: 10 } });
  handler.fire(TYPES.LEFT_CLICK, { position: { x: 10, y: 10 } });

  assert.equal(untrackCalls, 0, '8 px accumulated travel must suppress the click despite zero displacement');

  handler.fire(TYPES.LEFT_CLICK, { position: { x: 10, y: 10 } });
  assert.equal(untrackCalls, 1, 'suppression is consumed and cannot poison the next click');
});

test('slow clean sprite clicks select, while long presses and orbit nudges cannot untrack', () => {
  let timeMs = 0;
  let selections = 0;
  let untracks = 0;
  const handler = makeHandler();
  bindTrackingClickGesture(handler, (click, gesture) => {
    if (!isTrackingSelectionGesture(gesture)) return;
    if (click.sprite) {
      selections += 1;
      return;
    }
    if (isTrackingClickGesture(gesture)) untracks += 1;
  }, {
    now: () => timeMs,
    eventTypes: TYPES,
  });

  handler.fire(TYPES.LEFT_DOWN, { position: { x: 0, y: 0 } });
  timeMs = 401;
  handler.fire(TYPES.LEFT_UP, { position: { x: 0, y: 0 } });
  handler.fire(TYPES.LEFT_CLICK, { position: { x: 0, y: 0 }, sprite: true });
  assert.equal(selections, 1, 'duration alone must not suppress entity selection');
  assert.equal(untracks, 0);

  timeMs = 500;
  handler.fire(TYPES.LEFT_DOWN, { position: { x: 10, y: 10 } });
  timeMs = 520;
  handler.fire(TYPES.MOUSE_MOVE, { endPosition: { x: 14, y: 10 } });
  timeMs = 540;
  handler.fire(TYPES.MOUSE_MOVE, { endPosition: { x: 10, y: 10 } });
  handler.fire(TYPES.LEFT_UP, { position: { x: 10, y: 10 } });
  handler.fire(TYPES.LEFT_CLICK, { position: { x: 10, y: 10 } });
  assert.equal(untracks, 0, 'return-to-origin orbit travel must not untrack');

  timeMs = 600;
  handler.fire(TYPES.LEFT_DOWN, { position: { x: 0, y: 0 } });
  timeMs = 750;
  handler.fire(TYPES.LEFT_UP, { position: { x: 3, y: 4 } });
  handler.fire(TYPES.LEFT_CLICK, { position: { x: 3, y: 4 } });
  assert.equal(untracks, 1, 'a short clean empty-space tap still untracks');
});

test('civilian and military click handlers apply duration only at the deselect branch', () => {
  const sources = [
    readFileSync(new URL('./flights.js', import.meta.url), 'utf8'),
    readFileSync(new URL('./militaryFlights.js', import.meta.url), 'utf8'),
  ];
  for (const source of sources) {
    assert.match(source, /isTrackingSelectionGesture\(gesture\)[\s\S]+pickAt\(viewer\.scene/);
    assert.match(source, /isTrackingClickGesture\(gesture\)[\s\S]+_clearTracking\([^)]*\{ origin: 'user' \}\)/);
  }
  assert.doesNotMatch(
    sources[0],
    /_trackedEntity = _viewer\.entities\.add\(\{\s*id:/,
    'civilian tracked entities must retain Cesium-generated GUIDs',
  );
});

test('civilian and military tracked model caps both expose the selected 200 px feel', () => {
  assert.equal(CIVIL_TRACKED_MODEL_MAX_PX, 200);
  assert.equal(MILITARY_TRACKED_MODEL_MAX_PX, 200);
});

test('a finger gets twice the travel and half again the time, and the boundary is pinned', () => {
  const coarse = trackingClickLimits(true);
  assert.deepEqual(coarse, { travelPx: 12, durationMs: 600 });
  assert.deepEqual(trackingClickLimits(false), {
    travelPx: MAX_TRACKING_CLICK_TRAVEL_PX,
    durationMs: MAX_TRACKING_CLICK_DURATION_MS,
  });
  // Node has neither matchMedia nor touch points: the session default is fine.
  assert.deepEqual(trackingClickLimits(), trackingClickLimits(false));

  const matrix = [
    [{ travelPx: 12, durationMs: 600 }, true],
    [{ travelPx: 12.001, durationMs: 600 }, false],
    [{ travelPx: 12, durationMs: 600.001 }, false],
    // The gesture a mouse would have rejected, which is the whole point.
    [{ travelPx: 9, durationMs: 520 }, true],
  ];
  for (const [gesture, expected] of matrix) {
    assert.equal(isTrackingClickGesture(gesture, coarse), expected, JSON.stringify(gesture));
    assert.equal(isTrackingClickGesture(gesture), false, 'a cursor keeps the tight budget');
  }
  assert.equal(isTrackingSelectionGesture({ travelPx: 12, durationMs: 9000 }, coarse), true);
  assert.equal(isTrackingSelectionGesture({ travelPx: 12.001 }, coarse), false);
  assert.equal(MAX_TRACKING_CLICK_TRAVEL_PX_COARSE, 12);
  assert.equal(MAX_TRACKING_CLICK_DURATION_MS_COARSE, 600);
});

test('Cesium’s own 5 px gate is raised for a finger, and left alone for a cursor', () => {
  // Without this the 12 px budget above is unreachable: the handler drops the
  // click before the accounting ever sees it.
  const coarse = { _clickPixelTolerance: 5 };
  assert.equal(relaxHandlerClickTolerance(coarse, true), true);
  assert.equal(coarse._clickPixelTolerance, CESIUM_CLICK_TOLERANCE_PX_COARSE);

  const fine = { _clickPixelTolerance: 5 };
  assert.equal(relaxHandlerClickTolerance(fine, false), false);
  assert.equal(fine._clickPixelTolerance, 5, 'a mouse session is byte-for-byte untouched');

  // A future Cesium that renames the private field must degrade, not throw.
  assert.equal(relaxHandlerClickTolerance({}, true), false);
  assert.equal(relaxHandlerClickTolerance(null, true), false);

  const bound = makeHandler();
  bound._clickPixelTolerance = 5;
  bindTrackingClickGesture(bound, () => {}, { eventTypes: TYPES, coarse: true });
  assert.equal(bound._clickPixelTolerance, CESIUM_CLICK_TOLERANCE_PX_COARSE);

  const boundFine = makeHandler();
  boundFine._clickPixelTolerance = 5;
  bindTrackingClickGesture(boundFine, () => {}, { eventTypes: TYPES, coarse: false });
  assert.equal(boundFine._clickPixelTolerance, 5);
});

test('the globe canvas refuses the iOS callout and the selection loupe, and only for a finger', () => {
  const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
  const block = css.match(/html\[data-input="coarse"\] #cesiumContainer[^{]*\{[^}]*\}/);
  assert.ok(block, 'the coarse-input guard on #cesiumContainer is gone');
  assert.match(block[0], /-webkit-touch-callout:\s*none/);
  assert.match(block[0], /-webkit-user-select:\s*none/);
  assert.match(block[0], /\bcanvas\b/, 'the callout fires on the canvas, not only on its host');
});
