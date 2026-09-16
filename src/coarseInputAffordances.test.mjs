// src/coarseInputAffordances.test.mjs
// Everything that existed only behind a key or a hover, and now has a surface
// a finger can reach. These are markup, stylesheet and source-shape assertions
// because that is where the affordances live: `ui.js` cannot be imported under
// `node:test`, and a missing `aria-label` or a `display: none` that never
// flipped is invisible to every unit test in the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
const ui = readFileSync(join(ROOT, 'src', 'ui.js'), 'utf8');
const voiceDom = readFileSync(join(ROOT, 'src', 'voice', 'voiceControlDom.js'), 'utf8');
const realtime = readFileSync(join(ROOT, 'src', 'voice', 'gevRealtime.js'), 'utf8');
const lazyVoice = readFileSync(join(ROOT, 'src', 'voice', 'lazyVoice.js'), 'utf8');
const cctv = readFileSync(join(ROOT, 'src', 'data', 'cctv.js'), 'utf8');

// ── B5. The four functions that only had a key ──────────────────────────────

test('the location field is a form, and it tells the soft keyboard what it wants', () => {
  const field = html.match(/<input[^>]*id="location-search"[^>]*>/);
  assert.ok(field, 'the location field is gone');
  // Without `enterkeyhint` an iOS keyboard shows a plain return key and the one
  // way to search is a key a reader cannot recognise.
  assert.match(field[0], /enterkeyhint="search"/);
  assert.match(field[0], /type="search"/);
  assert.match(field[0], /inputmode="search"/);
  // A corrector that turns "Créteil" into something else fails the geocode
  // silently, and a capitalised first letter is noise for a place name.
  assert.match(field[0], /autocapitalize="off"/);
  assert.match(field[0], /autocorrect="off"/);

  const form = html.match(/<form[^>]*id="location-search-form"[^>]*>/);
  assert.ok(form, 'the search form is gone');
  assert.match(form[0], /role="search"/);
  assert.match(html, /id="location-search-submit"[^>]*type="submit"/);
  assert.match(html, /id="location-search-submit"[^>]*aria-label="Rechercher"/);
});

test('the search runs from one place, so a submit cannot fire the lookup twice', () => {
  assert.match(ui, /async _submitLocationSearch\(\)/);
  assert.match(ui, /_locationSearchForm\?\.addEventListener\('submit'/);
  // THE REGRESSION THIS PINS. Leaving the old Enter handler in place beside the
  // form submit sends two geocode requests per search and races two camera
  // flights against each other.
  assert.doesNotMatch(ui, /_locationSearch\.addEventListener\('keydown'/);
});

test('the submit button and the key badges are a touchscreen’s, not a cursor’s', () => {
  assert.match(css, /\.search-submit-btn\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /html\[data-input="coarse"\] \.search-submit-btn\s*\{/);
  // `Q W E R T`, `1`…`7`, `O`: width on the tightest row of the screen, naming
  // keys that do not exist. The handlers stay — a Bluetooth keyboard still works.
  const badges = css.match(/html\[data-input="coarse"\] \.poi-pill-key,\s*html\[data-input="coarse"\] \.btn-key\s*\{\s*display:\s*none;\s*\}/);
  assert.ok(badges, 'the key badges are still taking room on a phone');
});

test('ORBIT has a way in and a way out that are not the `o` key', () => {
  assert.match(ui, /orbitPill\.id = 'orbit-toggle'/);
  assert.match(ui, /orbitPill\.addEventListener\('click', \(\) => this\._toggleOrbit\(\)\)/);
  // The indicator was the only sign orbit was running, and it was
  // `pointer-events: none` — lit, and unreachable.
  assert.match(ui, /_orbitIndicator\.addEventListener\('click', \(\) => this\._stopOrbit\(\)\)/);
  const active = css.match(/#orbit-indicator\.active\s*\{[^}]*\}/);
  assert.ok(active, '#orbit-indicator.active is gone');
  assert.match(active[0], /pointer-events:\s*auto/);
  // Both entry points write the same state back onto the pill.
  assert.match(ui, /_syncOrbitPressed\(\)/);
});

test('"stop following" has a button, it polls only for a finger, and it is cleaned up', () => {
  assert.match(html, /id="tracking-release"[^>]*hidden[^>]*aria-label="Ne plus suivre"/);
  assert.match(ui, /_initTrackingReleaseButton\(\)/);
  // The poll is the cost, so it must not exist on a desktop that still has
  // Escape and a click in the void.
  assert.match(ui, /if \(!this\._trackingReleaseBtn \|\| !isCoarseInput\(\)\) return;/);
  assert.match(ui, /_trackingReleaseTicker = setInterval\(\(\) => this\._syncTrackingReleaseButton\(\), 250\)/);
  assert.match(ui, /clearInterval\(this\._trackingReleaseTicker\)/);
  assert.match(ui, /_releaseFollowCamera\(\{ preserveVesselSelection: false, trackingOrigin: 'user' \}\)/);
  // `#top-center-actions button { display: flex }` beats the user agent's
  // `[hidden] { display: none }`, so without this rule both buttons that ship
  // hidden — the release and "Autour de moi" — were painted anyway, inert.
  assert.match(css, /#top-center-actions button\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

// ── B6. What was only reachable by hovering ─────────────────────────────────

test('the voice help tray, the only usage instructions there are, opens on a tap', () => {
  assert.match(voiceDom, /id="gev-voice-help-btn"[^>]*aria-expanded="false"/);
  assert.match(voiceDom, /helpButton: root\.querySelector\('#gev-voice-help-btn'\)/);
  assert.match(realtime, /ui\.helpButton\.addEventListener\('click', controller\.helpHandler\)/);
  // A latch, not a hover: a tap that opened something has to close it again.
  assert.match(realtime, /delete ui\.root\.dataset\.help/);
  assert.match(css, /#gev-voice-control\[data-help='open'\] \.gev-voice-help-tray/);
  assert.match(css, /html\[data-input="coarse"\] \.gev-voice-help-btn\s*\{/);
});

test('reaching for the mic warms the 360 kB, whether or not there is a cursor', () => {
  assert.match(lazyVoice, /ui\.root\?\.addEventListener\('mouseenter', onWarm\)/);
  assert.match(lazyVoice, /ui\.root\?\.addEventListener\('pointerdown', onWarm, \{ passive: true \}\)/);
});

test('the CCTV hover pass does not run at all for a finger', () => {
  // The tap path already does strictly more than the preview — it ACTIVATES the
  // camera — so the picks a pan would spend here buy nothing.
  const hover = cctv.match(/function handleHoverMove\(position\) \{([\s\S]*?)\n\}/);
  assert.ok(hover, 'handleHoverMove is gone');
  assert.match(hover[1], /^\s*(\/\/[^\n]*\n\s*)*if \(isCoarseInput\(\)\) return;/);
  // And the one hint saying the frame opens is simply on where there is no hover.
  assert.match(css, /html\[data-input="coarse"\] \.cctv-frame-wrap\.has-frame \.cctv-frame-expand-hint/);
});

test('why the map source failed is no longer delivered only as a tooltip', () => {
  assert.match(ui, /this\._mapStackStatus\.dataset\.trouble = trouble;/);
  assert.match(ui, /_showToast\(trouble, \{ durationMs: 5000 \}\)/);
});

test('no button is left whose only accessible name is a tooltip', () => {
  // A `title` is the one label a touchscreen can never summon. Every button
  // whose visible content is empty or a bare symbol now carries an aria-label.
  const offenders = [];
  for (const match of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const open = match[0].match(/<button\b[^>]*>/)[0];
    if (open.includes('aria-label=')) continue;
    const text = match[1].replace(/<[^>]+>/g, '').replace(/&[#a-zA-Z0-9]+;/g, '').trim();
    if (text && !['−', '+', '▶', '-'].includes(text)) continue;
    // The toast's action button is named at runtime, from the toast that owns it.
    if (open.includes('id="toast-action"')) continue;
    offenders.push(open.slice(0, 90));
  }
  assert.deepEqual(offenders, []);
});
