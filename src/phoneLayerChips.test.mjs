// The layer chips under the phone's search bar. Pins the order rule (featured
// chips never move, other lit rows go in front in switch-on order), the one
// path to a layer (`toggleRow`), and the keep-don't-rebuild rule. Run with:
// npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_LAYER_CHIP_CLASS,
  mountPhoneLayerChips,
  nextLitOrder,
  phoneLayerChipModels,
} from './phoneLayerChips.js';
import { PHONE_FEATURED_LAYER_IDS, PHONE_LAYER_CHIP_LABELS } from './phoneSheetLayout.js';

const row = (id, extra = {}) => ({ id, label: `Row ${id}`, icon: '•', iconGlyph: null, enabled: false, transitioning: false, ...extra });

test('every featured layer has a short chip label, and every label names a featured layer', () => {
  assert.deepEqual(Object.keys(PHONE_LAYER_CHIP_LABELS).sort(), [...PHONE_FEATURED_LAYER_IDS].sort());
  for (const label of Object.values(PHONE_LAYER_CHIP_LABELS)) {
    assert.ok(label.length <= 12, `${label} is a row title, not a chip`);
  }
});

test('featured chips keep their order whether lit or not; other lit rows go in front', () => {
  const rows = [row('a'), row('b', { enabled: true }), row('c'), row('d', { enabled: true }), row('x')];
  const models = phoneLayerChipModels(rows, { featured: ['c', 'b', 'a'], litOrder: ['d'], labels: { b: 'Bee' } });
  assert.deepEqual(models.map((m) => m.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(models.map((m) => m.active), [true, false, true, false]);
  assert.equal(models.find((m) => m.id === 'b').label, 'Bee');
  assert.equal(models.find((m) => m.id === 'd').label, 'Row d', 'a row with no short label keeps its own');
  assert.equal(models.find((m) => m.id === 'b').title, 'Éteindre — Row b');
  assert.equal(models.find((m) => m.id === 'c').title, 'Allumer — Row c');
  assert.equal(models.some((m) => m.id === 'x'), false, 'an unlit, unfeatured row has no chip');
});

test('lit rows in front follow the switch-on order, unknown ones last and stable', () => {
  const rows = [row('p', { enabled: true }), row('q', { enabled: true }), row('r', { enabled: true })];
  const models = phoneLayerChipModels(rows, { featured: [], litOrder: ['r', 'p'] });
  assert.deepEqual(models.map((m) => m.id), ['r', 'p', 'q']);
});

test('a featured id with no row is skipped, not invented', () => {
  const models = phoneLayerChipModels([row('a')], { featured: ['missing', 'a'] });
  assert.deepEqual(models.map((m) => m.id), ['a']);
});

test('the switch-on order appends what lit and drops what went dark', () => {
  assert.deepEqual(nextLitOrder([], [row('a', { enabled: true })]), ['a']);
  assert.deepEqual(
    nextLitOrder(['a', 'b'], [row('a'), row('b', { enabled: true }), row('c', { enabled: true })]),
    ['b', 'c'],
  );
  assert.deepEqual(nextLitOrder(null, []), []);
});

// ── A DOM just big enough for the mount ─────────────────────────────────────
function makeDocument() {
  const doc = {};
  const make = (tagName) => {
    const node = {
      tagName,
      ownerDocument: doc,
      parent: null,
      kids: [],
      dataset: {},
      attributes: {},
      listeners: {},
      disabled: false,
      title: '',
      className: '',
      _text: '',
      style: {
        props: new Map(),
        setProperty(name, value) { this.props.set(name, value); },
        removeProperty(name) { this.props.delete(name); },
      },
      get textContent() { return this._text; },
      set textContent(value) { this._text = String(value); },
      get firstChild() { return this.kids[0] ?? null; },
      get nextSibling() {
        if (!this.parent) return null;
        const at = this.parent.kids.indexOf(this);
        return this.parent.kids[at + 1] ?? null;
      },
      classList: {
        has: (name) => node.className.split(/\s+/).includes(name),
        contains(name) { return this.has(name); },
        toggle(name, force) {
          const set = new Set(node.className.split(/\s+/).filter(Boolean));
          const on = force === undefined ? !set.has(name) : Boolean(force);
          if (on) set.add(name); else set.delete(name);
          node.className = [...set].join(' ');
        },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      click() { for (const fn of this.listeners.click || []) fn(); },
      append(...children) { for (const child of children) this.insertBefore(child, null); },
      insertBefore(child, ref) {
        if (child.parent) child.parent.kids.splice(child.parent.kids.indexOf(child), 1);
        const at = ref ? this.kids.indexOf(ref) : this.kids.length;
        this.kids.splice(at < 0 ? this.kids.length : at, 0, child);
        child.parent = this;
        doc.moves += 1;
      },
      remove() {
        if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1);
        this.parent = null;
      },
      replaceChildren() { for (const kid of [...this.kids]) kid.remove(); },
      querySelector(selector) {
        const cls = selector.replace(/^\./, '');
        const walk = (n) => {
          for (const kid of n.kids) {
            if (kid.className.split(/\s+/).includes(cls)) return kid;
            const found = walk(kid);
            if (found) return found;
          }
          return null;
        };
        return walk(this);
      },
    };
    return node;
  };
  doc.moves = 0;
  doc.createElement = make;
  return doc;
}

function makeManager(rows) {
  const listeners = new Set();
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    toggled: [],
    getPanelRowStates: () => [...state.values()].map((r) => ({ ...r })),
    toggleRow(id) {
      this.toggled.push(id);
      const entry = state.get(id);
      entry.enabled = !entry.enabled;
      for (const fn of listeners) fn({ type: 'visibility', layerId: id });
      return Promise.resolve();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    listenerCount: () => listeners.size,
  };
}

const ids = (host) => host.kids.map((kid) => kid.dataset.phoneLayerChip);

test('mounting draws the featured chips and the « all layers » chip last', () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  const manager = makeManager(PHONE_FEATURED_LAYER_IDS.map((id) => row(id)));
  const chips = mountPhoneLayerChips({ host, dataManager: manager });
  assert.ok(chips);
  assert.deepEqual(ids(host), [...PHONE_FEATURED_LAYER_IDS, 'all']);
  const first = host.kids[0];
  assert.equal(first.className.split(' ')[0], PHONE_LAYER_CHIP_CLASS);
  assert.equal(first.querySelector('.phone-layer-chip-name').textContent, PHONE_LAYER_CHIP_LABELS[PHONE_FEATURED_LAYER_IDS[0]]);
  assert.equal(first.attributes['aria-pressed'], 'false');
});

test('a tap goes through toggleRow, lights the chip in place, and moves nothing', async () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  const manager = makeManager(PHONE_FEATURED_LAYER_IDS.map((id) => row(id)));
  mountPhoneLayerChips({ host, dataManager: manager });
  const target = PHONE_FEATURED_LAYER_IDS[3];
  const chip = host.kids.find((kid) => kid.dataset.phoneLayerChip === target);
  const movesBefore = doc.moves;
  chip.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(manager.toggled, [target]);
  assert.equal(chip.classList.contains('active'), true);
  assert.equal(chip.attributes['aria-pressed'], 'true');
  assert.equal(chip.disabled, false, 'the busy light goes out once the manager settles');
  assert.equal(host.kids.indexOf(chip), 3, 'a featured chip lights where it is');
  assert.equal(doc.moves, movesBefore, 'nothing was re-inserted');
});

test('a row lit elsewhere gets a chip in front, and loses it when it goes dark', async () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  const manager = makeManager([...PHONE_FEATURED_LAYER_IDS.map((id) => row(id)), row('cadastre-fr')]);
  const chips = mountPhoneLayerChips({ host, dataManager: manager });
  await manager.toggleRow('cadastre-fr');
  assert.equal(ids(host)[0], 'cadastre-fr');
  assert.equal(host.kids[0].querySelector('.phone-layer-chip-name').textContent, 'Row cadastre-fr');
  await manager.toggleRow('cadastre-fr');
  assert.equal(ids(host).includes('cadastre-fr'), false);
  chips.destroy();
  assert.equal(manager.listenerCount(), 0);
  assert.equal(host.kids.length, 0);
});

test('the last chip opens the full list', () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  let opened = 0;
  mountPhoneLayerChips({ host, dataManager: makeManager([row('flights')]), onOpenAll: () => { opened += 1; } });
  host.kids.at(-1).click();
  assert.equal(opened, 1);
});

test('no host or no row API mounts nothing', () => {
  assert.equal(mountPhoneLayerChips({ host: null, dataManager: makeManager([]) }), null);
  assert.equal(mountPhoneLayerChips({ host: makeDocument().createElement('div'), dataManager: {} }), null);
});
