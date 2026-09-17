import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realtimeDebugLogEnabled } from '../vite.config.js';

test('a developer machine keeps the voice debug log', () => {
  assert.equal(realtimeDebugLogEnabled({ hosted: false, env: {} }), true);
});

test('a hosted server keeps no conversation unless its operator asks', () => {
  assert.equal(realtimeDebugLogEnabled({ hosted: true, env: {} }), false);
  assert.equal(realtimeDebugLogEnabled({ hosted: true, env: { GEV_REALTIME_DEBUG_LOG: '1' } }), true);
  for (const value of ['0', 'true', 'yes', '']) {
    assert.equal(realtimeDebugLogEnabled({ hosted: true, env: { GEV_REALTIME_DEBUG_LOG: value } }), false, value);
  }
});

test('the preview server is the hosted one', () => {
  const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const plugin = source.slice(source.indexOf("name: 'openai-realtime-proxy'"));
  const hook = plugin.slice(plugin.indexOf('configurePreviewServer'), plugin.indexOf('};'));
  assert.match(hook, /install\(server\.middlewares, \{ hosted: true \}\)/);
});

test('the HUD summary asks OpenAI to keep no application state', () => {
  const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const call = source.indexOf("fetch('https://api.openai.com/v1/responses'");
  assert.ok(call > 0);
  const body = source.slice(call, source.indexOf('instructions:', call));
  assert.match(body, /store: false/);
});
