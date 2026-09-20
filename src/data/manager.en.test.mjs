// The Data Layers panel in English: the word on a row's button, the line under
// it, the tally on a group header and the extent a map key states. Read through
// the real manager, with the smallest element stubs the three painters touch.
//
// The button is the reason this file exists. `ON` / `LOADING` / `OFF` used to be
// the same three English words on every page; they are now the page's own, and
// `data-feed-state` — which does NOT change with the language — is what every
// harness reads instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DataLayerManager, legendScopeLabel } from './manager.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/** The two elements `_syncToggleButton` and `_syncCategoryHeader` write to. */
function stubElement() {
  const element = {
    textContent: '',
    disabled: false,
    dataset: {},
    attributes: {},
    className: '',
    classList: {
      toggle(name, force) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        if (force === undefined ? !set.has(name) : force) set.add(name); else set.delete(name);
        element.className = [...set].join(' ');
      },
    },
    setAttribute(name, value) { element.attributes[name] = String(value); },
    querySelector() { return element.child; },
  };
  return element;
}

const manager = new DataLayerManager({});

/** What the toggle button of a row in this state says, and what it IS. */
function button(layer) {
  const element = stubElement();
  manager._syncToggleButton(element, layer);
  return { text: element.textContent, state: element.dataset.feedState, aria: element.attributes['aria-label'] };
}

const OFF_ROW = { id: 'traffic', label: 'Road traffic', enabled: false, stats: {} };

test('a dark row reads OFF in English and ÉTEINT in French, and is `off` in both', () => {
  const en = withLocale('en', () => button(OFF_ROW));
  assert.deepEqual(en, { text: 'OFF', state: 'off', aria: 'Road traffic: OFF' });
  const fr = button({ ...OFF_ROW, label: 'Trafic routier' });
  assert.deepEqual(fr, { text: 'ÉTEINT', state: 'off', aria: 'Trafic routier: ÉTEINT' });
});

test('a healthy feed reads ON, a loading one LOADING, and the attribute never moves', () => {
  const live = { id: 'flights', label: 'Live flights', enabled: true, stats: { count: 42, lastUpdate: Date.now() } };
  assert.deepEqual(withLocale('en', () => button(live)), {
    text: 'ON', state: 'nominal', aria: 'Live flights: ON',
  });
  assert.equal(button({ ...live, label: 'Vols en direct' }).text, 'ACTIF');
  assert.equal(button({ ...live, label: 'Vols en direct' }).state, 'nominal');

  const loading = { ...live, stats: { loading: true } };
  assert.equal(withLocale('en', () => button(loading)).text, 'LOADING');
  assert.equal(button(loading).text, 'CHARGEMENT');
  assert.equal(button(loading).state, 'loading');
});

test('the meta line under a row speaks English: freshness, guidance and faults', () => {
  const layer = {
    id: 'flights',
    label: 'Live flights',
    source: 'OpenSky Network',
    enabled: true,
    tags: { cadence: 'live', closeRange: false },
    stats: { count: 12, lastUpdate: Date.now() - 42_000 },
  };
  const meta = withLocale('en', () => manager._buildMetaText(layer));
  assert.equal(meta, 'OpenSky Network · stream · 42 s ago');
  assertNoFrench(meta);

  const pack = { ...layer, source: 'OurAirports · IGN', tags: { cadence: 'static' }, stats: { count: 4 } };
  assert.equal(withLocale('en', () => manager._buildMetaText(pack)), 'OurAirports · IGN · fixed snapshot');

  const loading = { ...layer, stats: { loading: true } };
  assert.equal(withLocale('en', () => manager._buildMetaText(loading)), 'OpenSky Network · loading…');

  const failing = { ...layer, stats: { status: 'unavailable', error: 'OpenSky unreachable', retryInSec: 24 } };
  assert.equal(
    withLocale('en', () => manager._buildMetaText(failing)),
    'UNAVAILABLE · OpenSky Network · OpenSky unreachable · retrying in 24 s',
  );
});

test('a dark row says what it holds and that it needs a close camera, in English', () => {
  const layer = {
    id: 'dvf-sales',
    label: 'Property prices',
    source: 'DVF — Etalab / DGFiP',
    enabled: false,
    tags: { closeRange: true },
    stats: {},
  };
  assert.equal(
    withLocale('en', () => manager._buildMetaText(layer)),
    'DVF — Etalab / DGFiP · close-up view',
  );
  assert.equal(manager._buildMetaText(layer), 'DVF — Etalab / DGFiP · vue rapprochée');
});

test('the registry’s source line is what the row prints, unless the layer names another feed', () => {
  const layer = {
    id: 'cadastre-fr',
    label: 'Cadastral parcels',
    source: 'IGN Api Carto — cadastre PCI vecteur',
    sourceLabel: 'IGN Api Carto — PCI vector cadastre',
    enabled: false,
    tags: {},
    stats: {},
  };
  assert.equal(
    withLocale('en', () => manager._buildMetaText(layer)),
    'IGN Api Carto — PCI vector cadastre · never',
  );
  // A module echoing its own declared source changes nothing.
  assert.equal(
    withLocale('en', () => manager._buildMetaText({ ...layer, stats: { source: layer.source } })),
    'IGN Api Carto — PCI vector cadastre · never',
  );
  // A module naming the feed it actually reached keeps its own word — that is
  // the one string here that carries news.
  assert.equal(
    withLocale('en', () => manager._buildMetaText({ ...layer, stats: { source: 'adsb.lol' } })),
    'adsb.lol · never',
  );
});

test('a group header tallies in English, and a map key states its extent', () => {
  const section = stubElement();
  section.child = stubElement();
  const group = { id: 'air-space', layers: [{ enabled: true }, { enabled: false }] };
  withLocale('en', () => manager._syncCategoryHeader(section, group));
  assert.equal(section.child.textContent, '1/2 ON');
  manager._syncCategoryHeader(section, group);
  assert.equal(section.child.textContent, '1/2 ACTIVES');

  assert.equal(withLocale('en', () => legendScopeLabel({ inView: 12400, where: null })), ' · 12,400 here');
  assert.equal(legendScopeLabel({ inView: 12400, where: null }), ' · 12\u202f400 ici');
  assert.equal(
    withLocale('en', () => legendScopeLabel({ inView: 0, where: 'Paris' })),
    ' · Paris, outside this view',
  );
  assert.equal(withLocale('en', () => legendScopeLabel({ inView: 0, where: null })), ' · outside this view');
});
