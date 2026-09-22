import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cockpitCloudRenderSize,
  cockpitWeatherRefreshDue,
  cockpitWeatherEnabledFromStoredValue,
  weatherSourceSwitchedOff,
} from './cockpitCloudEffects.js';

test('cockpit cloud framebuffer stays low resolution on large displays', () => {
  assert.deepEqual(cockpitCloudRenderSize(2048, 1152), { width: 520, height: 293 });
  assert.deepEqual(cockpitCloudRenderSize(1280, 720), { width: 520, height: 293 });
});

test('cockpit cloud framebuffer never upscales or collapses to zero', () => {
  assert.deepEqual(cockpitCloudRenderSize(640, 360), { width: 269, height: 151 });
  assert.deepEqual(cockpitCloudRenderSize(0, Number.NaN), { width: 1, height: 1 });
});

test('cockpit weather defaults off and enables only from an explicit saved opt-in', () => {
  assert.equal(cockpitWeatherEnabledFromStoredValue(null), false);
  assert.equal(cockpitWeatherEnabledFromStoredValue(''), false);
  assert.equal(cockpitWeatherEnabledFromStoredValue('0'), false);
  assert.equal(cockpitWeatherEnabledFromStoredValue('1'), true);
});

test('cockpit weather refreshes after time or meaningful movement', () => {
  const anchor = { latitude: 30, longitude: -97 };
  assert.equal(cockpitWeatherRefreshDue({
    nowMs: 1000,
    fetchedAt: 500,
    anchor,
    point: anchor,
    hasWeather: false,
  }), true);
  assert.equal(cockpitWeatherRefreshDue({
    nowMs: 60_000,
    fetchedAt: 0,
    anchor,
    point: { latitude: 30.01, longitude: -97 },
    hasWeather: true,
  }), false);
  assert.equal(cockpitWeatherRefreshDue({
    nowMs: 5 * 60_000,
    fetchedAt: 0,
    anchor,
    point: anchor,
    hasWeather: true,
  }), true);
  assert.equal(cockpitWeatherRefreshDue({
    nowMs: 60_000,
    fetchedAt: 0,
    anchor,
    point: { latitude: 30.3, longitude: -97 },
    hasWeather: true,
  }), true);
});

test('only the route\'s explicit `off` stops the cloud pass for good; a miss is retried', () => {
  assert.equal(weatherSourceSwitchedOff({ status: 'off', weather: null }), true);
  for (const payload of [null, undefined, {}, { status: 'ready', weather: {} }, { status: 'stale' }, { error: 'x' }]) {
    assert.equal(weatherSourceSwitchedOff(payload), false, JSON.stringify(payload));
  }
});
