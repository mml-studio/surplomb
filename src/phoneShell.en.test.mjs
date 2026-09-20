// The phone shell in English: the chip row, the Selection tab, the badge and
// the words the sheet writes into panels it adopted.
//
// `phoneSheet.js` itself is not loaded here — it needs a `document` with the
// whole markup of the page, which is what `scripts/qa-phone-shell.mjs` opens.
// What this file can prove is what the sheet WRITES, which lives in its
// catalog, plus every pure function beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneLayerChipModels } from './phoneLayerChips.js';
import { PHONE_FEATURED_LAYER_IDS, PHONE_LAYER_CHIP_LABELS } from './phoneSheetLayout.js';
import { phoneSelectionEmptyText, renderPhoneSelection } from './phoneSelection.js';
import sheetMessages from './phoneSheet.i18n.js';
import chipMessages from './phoneLayerChips.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

useTestLocale('en');

test('the eight chips under the search bar read in English, and still fit a chip', () => {
  const labels = PHONE_FEATURED_LAYER_IDS.map((id) => PHONE_LAYER_CHIP_LABELS[id]);
  assert.deepEqual(labels, ['Flights', 'Traffic', 'Transit', 'Bikes', 'Charging', 'Weather', 'Schools', 'Prices']);
  for (const label of labels) assert.ok(label.length <= 12, `${label} is a row title, not a chip`);
  assertNoFrench(labels);
  // The same loaded table, the other language.
  assert.equal(withLocale('fr', () => PHONE_LAYER_CHIP_LABELS.flights), 'Vols');
});

test('a chip says which way pressing it goes, and names the row it stands for', () => {
  const rows = [
    { id: 'flights', label: 'Live flights', enabled: true },
    { id: 'traffic', label: 'Road traffic', enabled: false },
  ];
  const models = phoneLayerChipModels(rows, { featured: ['flights', 'traffic'] });
  assert.equal(models.find((m) => m.id === 'flights').title, 'Turn off — Live flights');
  assert.equal(models.find((m) => m.id === 'traffic').title, 'Turn on — Road traffic');
  assertNoFrench(models.map(({ label, title }) => ({ label, title })));
  assert.equal(chipMessages().allLayers, 'All layers');
  assert.equal(chipMessages().allLayersTitle, 'Open the layer list');
  assert.equal(withLocale('fr', () => chipMessages().allLayers), 'Toutes les couches');
});

test('the Selection tab tells an English reader what to do, and its × says what it does', () => {
  assert.equal(phoneSelectionEmptyText(), 'Tap something on the globe to read it here.');
  assert.equal(withLocale('fr', phoneSelectionEmptyText), 'Touchez un objet sur le globe pour le lire ici.');

  const nodes = [];
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      attributes: {},
      children: [],
      dataset: {},
      appendChild(child) { node.children.push(child); return child; },
      replaceChildren() { node.children = []; },
      setAttribute(name, value) { node.attributes[name] = value; },
      addEventListener() {},
    };
    nodes.push(node);
    return node;
  };
  const host = make('div');
  host.ownerDocument = { createElement: make };
  assert.equal(renderPhoneSelection(host, []), 0);
  assert.equal(host.children[0].textContent, 'Tap something on the globe to read it here.');

  // The × only exists once there is a card to lower the sheet away from.
  assert.equal(renderPhoneSelection(host, [{ key: 'a', title: 'RCH451', details: ['C17'] }]), 1);
  const dismiss = host.children.at(-1);
  assert.equal(dismiss.attributes['aria-label'], 'Collapse the panel');
  assertNoFrench([host.children[0].textContent, dismiss.attributes['aria-label']]);
});

test('the sheet’s own words: the badge, its warning, the field it turns into the top bar', () => {
  const m = sheetMessages();
  assert.equal(m.clearLayers, 'TURN EVERYTHING OFF');
  assert.equal(m.heavy, 'HEAVY');
  assert.equal(m.heavyTitle,
    'Heavy layer: a great many objects to draw. On a phone, expect a longer load and a less fluid map.');
  assert.equal(m.searchPlaceholder, 'Search an address');
  assert.equal(m.searchLabel, 'Search a place or an address');
  assertNoFrench(m);
  // The French the phone has shipped since the sheet existed, unchanged.
  const fr = withLocale('fr', sheetMessages);
  assert.equal(fr.clearLayers, 'TOUT ÉTEINDRE');
  assert.equal(fr.heavy, 'LOURD');
  assert.equal(fr.searchPlaceholder, 'Rechercher une adresse');
});
