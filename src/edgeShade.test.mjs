// src/edgeShade.test.mjs
//
// The edge shade replaced the scope as what a first run draws (2026-09-23):
// the scene runs to the edges of the screen, with a light falloff toward the
// corners. These pins keep the three places that decide its first-run
// strength in step, keep old links honest, and keep the scope OFF by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  EDGE_SHADE_CLEAR_RATIO,
  EDGE_SHADE_DEFAULT_PCT,
  clampEdgeShadePct,
  edgeShadeBackground,
  getEdgeShadePct,
  installEdgeShade,
  setEdgeShadePct,
} from './edgeShade.js';
import { isScopeMaskEnabled } from './scopeMask.js';
import { ShareLinkManager } from './sharelink.js';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');

function managerForHash(hash) {
  globalThis.window = { location: { hash, href: `http://localhost/${hash}` } };
  globalThis.history = { replaceState(_s, _t, next) { window.location.hash = next; } };
  const viewer = {
    camera: {
      changed: { addEventListener() {} },
      positionCartographic: { latitude: 0, longitude: 0, height: 1000 },
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    },
  };
  return new ShareLinkManager(viewer);
}

test('the shade is shaped like the viewport, clear in the middle, darkest in the corners', () => {
  const css = edgeShadeBackground(30);
  assert.match(css, /^radial-gradient\(ellipse farthest-corner at 50% 50%,/);
  assert.match(css, new RegExp(`rgba\\(5, 5, 8, 0\\) ${Math.round(EDGE_SHADE_CLEAR_RATIO * 100)}%`));
  assert.match(css, /rgba\(5, 5, 8, 0\.3\) 100%\)$/);
  // Every strength is a whole percent in 0..100; nonsense falls back.
  assert.match(edgeShadeBackground(250), /rgba\(5, 5, 8, 1\) 100%/);
  assert.match(edgeShadeBackground(-4), /rgba\(5, 5, 8, 0\) 100%/);
  assert.equal(clampEdgeShadePct('41.6'), 42);
  assert.equal(clampEdgeShadePct('abc'), EDGE_SHADE_DEFAULT_PCT);
  assert.equal(clampEdgeShadePct(null, 0), 0);
  assert.equal(clampEdgeShadePct('', 7), 7);
});

test('a first run shades lightly, at every surface that decides it', () => {
  assert.equal(EDGE_SHADE_DEFAULT_PCT, 30);
  assert.equal(getEdgeShadePct(), EDGE_SHADE_DEFAULT_PCT, 'the live module starts there');
  assert.match(indexHtml, /id="edge-shade-slider"[^>]*\smin="0"[^>]*\smax="100"[^>]*\svalue="30"/,
    'index.html: the slider ships at the default, over the whole range');
  // The link a first run generates describes the shade it draws.
  const params = managerForHash('')._buildHashParams();
  assert.equal(params.get('es'), '30');
});

test('the scope is off by default, and the link a first run writes says so', () => {
  assert.equal(isScopeMaskEnabled(), false, 'the module default — read by the share link before main.js runs');
  assert.match(indexHtml, /id="scope-toggle" aria-pressed="false"/, 'the toggle ships unlit');
  assert.doesNotMatch(indexHtml, /class="pp-toggle-btn active" id="scope-toggle"/);
  assert.match(mainSource, /setScopeMaskEnabled\(false\);\s*installScopeMask\(viewer\);\s*installEdgeShade\(viewer\);/,
    'main.js switches the scope off before installing it, and installs the shade');
  assert.equal(managerForHash('')._buildHashParams().get('sc'), '0');
});

test('a link restores the shade it carries, and a link from before `es` restores none', () => {
  assert.equal(managerForHash('#lat=10&lon=20&es=55').parseInitialHash().edgeShadePct, 55);
  assert.equal(managerForHash('#lat=10&lon=20&es=0').parseInitialHash().edgeShadePct, 0);
  assert.equal(managerForHash('#lat=10&lon=20&es=180').parseInitialHash().edgeShadePct, 100);
  // Its author saw the scope (`sc` absent = on) and no shade.
  const legacy = managerForHash('#lat=10&lon=20&style=normal').parseInitialHash();
  assert.equal(legacy.edgeShadePct, 0);
  assert.equal(legacy.scopeEnabled, true);
});

test('the element takes the gradient, and leaves the compositor at zero', () => {
  const children = [];
  const makeElement = () => ({
    id: '',
    hidden: false,
    style: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
  });
  globalThis.document = { createElement: makeElement };
  installEdgeShade({ container: { appendChild: (child) => children.push(child) } });
  assert.equal(children.length, 1);
  const [shade] = children;
  assert.equal(shade.id, 'edge-shade');
  assert.equal(shade.attrs['aria-hidden'], 'true');
  assert.equal(shade.style.background, edgeShadeBackground(EDGE_SHADE_DEFAULT_PCT));
  assert.equal(setEdgeShadePct(0), 0);
  assert.equal(shade.hidden, true);
  assert.equal(setEdgeShadePct('64'), 64);
  assert.equal(shade.hidden, false);
  assert.equal(shade.style.background, edgeShadeBackground(64));
  // Idempotent: a second install adds nothing.
  installEdgeShade({ container: { appendChild: (child) => children.push(child) } });
  assert.equal(children.length, 1);
  setEdgeShadePct(EDGE_SHADE_DEFAULT_PCT);
  delete globalThis.document;
});

test('labels fade outside the scope circle only while the scope draws it', async () => {
  const { keyholeLabelAlpha, isKeyholeFadeActive, KEYHOLE_OUTSIDE_OPACITY_DEFAULT } = await import('./celestialRing.js');
  const { setScopeMaskEnabled } = await import('./scopeMask.js');
  // A label in the far corner of a 1600 × 900 view: outside the keyhole
  // (radius 472 px) and past its fade band.
  const corner = () => keyholeLabelAlpha(1580, 880, 1600, 900);
  try {
    setScopeMaskEnabled(true);
    assert.equal(isKeyholeFadeActive(), true);
    assert.equal(corner(), KEYHOLE_OUTSIDE_OPACITY_DEFAULT);
    setScopeMaskEnabled(false);
    assert.equal(isKeyholeFadeActive(), false);
    assert.equal(corner(), 1, 'with no circle drawn, a label on a clear street is not dimmed');
    assert.equal(keyholeLabelAlpha(800, 450, 1600, 900), 1, 'and the centre is untouched either way');
  } finally {
    setScopeMaskEnabled(false);
  }
});
