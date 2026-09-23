import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LUCIDE_ICONS, lucideIconMask } from './lucideIcons.js';

const decode = (uri) => Buffer.from(uri.slice(uri.indexOf('base64,') + 7), 'base64').toString('utf8');

test('each vendored icon is a mask carrying Lucide’s elements verbatim, at Lucide’s stroke', () => {
  for (const [name, elements] of Object.entries(LUCIDE_ICONS)) {
    const uri = lucideIconMask(name);
    assert.ok(uri.startsWith('data:image/svg+xml;base64,'), name);
    const svg = decode(uri);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/);
    for (const element of elements) assert.ok(svg.includes(element), `${name}: ${element}`);
    // Cached: the key asks on every repaint.
    assert.equal(lucideIconMask(name), uri);
  }
});

test('an icon this module does not carry is null, never a stand-in', () => {
  assert.equal(lucideIconMask('rocket'), null);
  assert.equal(lucideIconMask('constructor'), null);
  assert.equal(lucideIconMask(''), null);
});

test('the Lucide NOTICE names every icon this module vendors', () => {
  const notice = readFileSync(new URL('../../licenses/lucide/NOTICE', import.meta.url), 'utf8');
  assert.match(notice, /src\/data\/lucideIcons\.js/);
  for (const name of Object.keys(LUCIDE_ICONS)) {
    assert.match(notice, new RegExp(`^\\s+${name}\\s+—`, 'm'), `${name} is not listed in licenses/lucide/NOTICE`);
  }
});
