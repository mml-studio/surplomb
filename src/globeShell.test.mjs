// src/globeShell.test.mjs — the desktop top row (2026-09-23).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PLACE_RECENTS_MAX,
  PLACE_RECENTS_STORAGE_KEY,
  STYLE_PREVIEW_MAX_PX,
  foldText,
  isApplePlatform,
  isPlaceSearchShortcut,
  isTypingTarget,
  normalizePlaceRecent,
  placeSearchShortcutLabel,
  readPlaceRecents,
  rememberPlace,
  stylePreviewSize,
  writePlaceRecents,
} from './globeShell.js';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('./globeShell.js', import.meta.url), 'utf8');
const styleCss = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test('a recent place is a typed search or a city shortcut, and nothing else', () => {
  assert.deepEqual(normalizePlaceRecent({ label: ' 12 rue  de Rivoli ', query: '12 rue de rivoli' }),
    { label: '12 rue de Rivoli', query: '12 rue de rivoli' });
  assert.deepEqual(normalizePlaceRecent({ label: 'Biarritz', cityId: 'biarritz', query: 'ignored' }),
    { label: 'Biarritz', cityId: 'biarritz' });
  for (const junk of [null, 'Lyon', {}, { label: 'Lyon' }, { query: 'lyon' }, { label: '   ', query: 'x' }]) {
    assert.equal(normalizePlaceRecent(junk), null);
  }
  const long = normalizePlaceRecent({ label: 'x'.repeat(500), query: 'y'.repeat(500) });
  assert.equal(long.label.length, 120, 'a pasted paragraph cannot fill storage');
});

test('visiting a place puts it first, once, and the list stays short', () => {
  let list = [];
  for (const city of ['Paris', 'Lyon', 'Nice', 'Nantes', 'Lille', 'Brest']) {
    list = rememberPlace(list, { label: city, query: city.toLowerCase() });
  }
  assert.equal(list.length, PLACE_RECENTS_MAX);
  assert.deepEqual(list.map((item) => item.label), ['Brest', 'Lille', 'Nantes', 'Nice', 'Lyon']);
  // The same place again, typed differently: it moves up, it does not repeat.
  list = rememberPlace(list, { label: 'NICE', query: 'nice' });
  assert.deepEqual(list.map((item) => item.label), ['NICE', 'Brest', 'Lille', 'Nantes', 'Lyon']);
  assert.equal(foldText('Élancourt'), 'elancourt');
  list = rememberPlace([{ label: 'Evry', query: 'evry' }], { label: 'Évry', query: 'Évry' });
  assert.equal(list.length, 1, 'accents do not make a second place');
  // A city shortcut is keyed by its id.
  list = rememberPlace([{ label: 'Biarritz', cityId: 'biarritz' }], { label: 'Biarritz (64)', cityId: 'biarritz' });
  assert.deepEqual(list, [{ label: 'Biarritz (64)', cityId: 'biarritz' }]);
  // Nothing to remember leaves the list as it was, cleaned.
  assert.deepEqual(rememberPlace([{ label: 'Lyon', query: 'lyon' }, 'junk'], null), [{ label: 'Lyon', query: 'lyon' }]);
});

test('the recent places live in this browser only, and survive bad storage', () => {
  const storage = memoryStorage();
  assert.deepEqual(readPlaceRecents(storage), []);
  writePlaceRecents(storage, [{ label: 'Lyon', query: 'lyon' }, { nope: true }]);
  assert.deepEqual(JSON.parse(storage.map.get(PLACE_RECENTS_STORAGE_KEY)), [{ label: 'Lyon', query: 'lyon' }]);
  assert.deepEqual(readPlaceRecents(storage), [{ label: 'Lyon', query: 'lyon' }]);
  storage.map.set(PLACE_RECENTS_STORAGE_KEY, '{not json');
  assert.deepEqual(readPlaceRecents(storage), []);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(readPlaceRecents(throwing), []);
  assert.doesNotThrow(() => writePlaceRecents(throwing, [{ label: 'Lyon', query: 'lyon' }]));
  assert.deepEqual(readPlaceRecents(null), []);
});

test('the shortcut is ⌘ K on a Mac, Ctrl K elsewhere, and « / » when nobody is typing', () => {
  assert.equal(isApplePlatform({ userAgentData: { platform: 'macOS' } }), true);
  assert.equal(isApplePlatform({ platform: 'MacIntel' }), true);
  assert.equal(isApplePlatform({ platform: 'Win32' }), false);
  assert.equal(isApplePlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), false);
  assert.equal(placeSearchShortcutLabel(true), '⌘ K');
  assert.equal(placeSearchShortcutLabel(false), 'Ctrl K');

  const mac = { apple: true, typing: false };
  const pc = { apple: false, typing: false };
  assert.equal(isPlaceSearchShortcut({ key: 'k', metaKey: true }, mac), true);
  assert.equal(isPlaceSearchShortcut({ key: 'K', metaKey: true }, mac), true);
  assert.equal(isPlaceSearchShortcut({ key: 'k', ctrlKey: true }, mac), false, 'Ctrl K is not the Mac shortcut');
  assert.equal(isPlaceSearchShortcut({ key: 'k', ctrlKey: true }, pc), true);
  assert.equal(isPlaceSearchShortcut({ key: 'k', metaKey: true }, pc), false);
  assert.equal(isPlaceSearchShortcut({ key: 'k' }, pc), false, 'a bare K is not the shortcut');
  assert.equal(isPlaceSearchShortcut({ key: 'k', ctrlKey: true, altKey: true }, pc), false);
  assert.equal(isPlaceSearchShortcut({ key: '/' }, pc), true);
  assert.equal(isPlaceSearchShortcut({ key: '/' }, { apple: false, typing: true }), false, '« / » belongs to a field being typed in');
  assert.equal(isPlaceSearchShortcut({ key: '/', ctrlKey: true }, pc), false);
  assert.equal(isPlaceSearchShortcut(null, pc), false);

  const element = (selector) => ({ matches: (query) => query.split(', ').includes(selector) });
  assert.equal(isTypingTarget(element('input')), true);
  assert.equal(isTypingTarget(element('textarea')), true);
  assert.equal(isTypingTarget(element('button')), false);
  assert.equal(isTypingTarget(null), false);
});

test('the style previews are cut from one small copy of the view', () => {
  assert.deepEqual(stylePreviewSize(3200, 1800), { width: STYLE_PREVIEW_MAX_PX, height: 180 });
  assert.deepEqual(stylePreviewSize(900, 1600), { width: 180, height: STYLE_PREVIEW_MAX_PX });
  assert.deepEqual(stylePreviewSize(200, 100), { width: 200, height: 100 }, 'never scaled up');
  assert.equal(stylePreviewSize(0, 900), null);
  assert.equal(stylePreviewSize(NaN, 900), null);
});

test('the top row ships hidden, and only the module shows it', () => {
  // The phone shell never runs the module: everything it would show stays
  // hidden there, and the dock keeps its trays until the module has moved
  // their contents (every rule hangs off `html.globe-shell`).
  assert.match(indexHtml, /<div id="place-search" class="collapsed" hidden>/);
  assert.match(indexHtml, /<div id="globe-top-bar" hidden>/);
  assert.match(indexHtml, /<section id="appearance-panel" aria-labelledby="appearance-title" hidden>/);
  assert.match(shellSource, /if \(!doc \|\| isPhoneShell\(\)\) return null;/);
  assert.match(shellSource, /doc\.documentElement\.classList\.add\('globe-shell'\);/);
  // One field, one submit path: the form is MOVED, never cloned.
  assert.doesNotMatch(shellSource, /cloneNode/);
  assert.equal((indexHtml.match(/id="location-search"/g) || []).length, 1);
});

test('the mic leaves the dock for its own corner on a desktop, and only there', () => {
  // Ships hidden: the phone never runs the module, and keeps its mic in the dock.
  assert.match(indexHtml, /<div id="voice-corner" hidden><\/div>/);
  const mic = shellSource.slice(shellSource.indexOf('// ── The mic ─'));
  assert.match(mic, /if \(voicePanel\) voiceCorner\.append\(voicePanel\);\s*voiceCorner\.hidden = false;/);
  // The right rail watches the corner, not the panel the controller rebuilds.
  const obstacles = uiSource.slice(uiSource.indexOf('const RIGHT_STACK_OBSTACLE_SELECTOR = ['));
  assert.ok(obstacles.slice(0, obstacles.indexOf('].join')).includes("'#voice-corner'"));
  // Every desktop rule hangs off the class the module sets; the cockpit, the
  // clean view and a recording hide the corner as they hid the dock.
  const block = styleCss.slice(styleCss.indexOf('THE COMPACT MIC ON A DESKTOP'));
  assert.match(block, /html\.globe-shell #voice-corner \{\s*position: fixed;/);
  assert.match(block, /body\.cockpit-mode #voice-corner \{ display: none !important; \}/);
  assert.match(block, /body\.ui-clean-view #voice-corner,\s*body\.recording-mode #voice-corner \{/);
  // The parts added for the card are hidden unless the corner shows them.
  assert.match(block, /^\.gev-mic-caption,\s*\.gev-voice-phase,\s*\.gev-voice-stop,\s*\.gev-voice-transcript-who \{\s*display: none;/m);
});

test('a panel opened by name opens where its contents went', () => {
  assert.match(uiSource, /const GLOBE_SHELL_ADOPTED_PANEL_IDS = new Set\(\['location-bar', 'control-panel', 'pp-toggles'\]\);/);
  assert.match(uiSource, /if \(!collapsed && explicit && !restore\) this\._globeShell\.openAdopted\(panelId\);/);
  // Choosing a style never opens a panel on a desktop: its parameters sit
  // under the previews.
  const reveal = uiSource.slice(uiSource.indexOf('  _revealStyleParameters() {'));
  assert.ok(reveal.indexOf('if (this._globeShell) return;') < reveal.indexOf("this.setPanelCollapsed('pp-toggles'"));
});
