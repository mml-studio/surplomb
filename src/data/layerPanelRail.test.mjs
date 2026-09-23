// The desktop Layers panel's rail and drawer (src/data/layerPanelRail.js).
//
// The pure parts — search, pin default, which group to show — are pinned
// directly. The controller runs against a DOM stub deep enough for what it
// touches: classes, attributes, insertion, events. What needs a real cascade
// and layout (widths, the hidden rows, the 1280 × 620 rail) is
// `scripts/qa-layer-rail.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAWER_CATEGORY_STORAGE_KEY,
  DRAWER_PINNED_STORAGE_KEY,
  HOVER_CLICK_GRACE_MS,
  HOVER_OPEN_DELAY_MS,
  buildRowSearchIndex,
  matchRows,
  mountLayerPanelRail,
  normalizeSearchText,
  resolveDrawerPinned,
  resolveRailCategory,
} from './layerPanelRail.js';
import messages from './layerPanelRail.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// ─── Pure parts ──────────────────────────────────────────────────────────────

test('search text is folded: case, accents and runs of spaces', () => {
  assert.equal(normalizeSearchText('  Réseau  ÉLECTRIQUE '), 'reseau electrique');
  assert.equal(normalizeSearchText('Îlots de fraîcheur'), 'ilots de fraicheur');
  assert.equal(normalizeSearchText(null), '');
});

const LAYERS = [
  { id: 'flights', label: 'Vols en direct', name: 'Flights', source: 'OpenSky Network', category: 'air-space', showInTogglePanel: true },
  { id: 'military-flights', label: 'Vols militaires', name: 'Military', source: 'adsb.lol', category: 'air-space', showInTogglePanel: true, fusedInto: 'flights' },
  { id: 'power-grid', label: 'Réseau électrique et centrales', name: 'Grid', sourceLabel: 'RTE · OSM', source: 'x', category: 'energy', showInTogglePanel: true },
  { id: 'france-energy', label: 'Mix électrique', name: 'Mix', source: 'éCO2mix', category: 'energy', showInTogglePanel: true },
  { id: 'hidden-coordinator', label: 'Contexte', name: 'Ctx', source: '', category: 'air-space', showInTogglePanel: false },
];
const GROUPS = [
  { id: 'air-space', label: 'CIEL & MER', shortLabel: 'Ciel & mer' },
  { id: 'energy', label: 'ÉNERGIE', shortLabel: 'Énergie' },
];

test('the index holds one entry per ROW, and a fused layer is found on its primary', () => {
  const index = buildRowSearchIndex(LAYERS, GROUPS);
  assert.deepEqual([...index.keys()].sort(), ['flights', 'france-energy', 'power-grid']);
  assert.match(index.get('flights'), /vols militaires/);
  assert.match(index.get('power-grid'), /rte · osm/);
  assert.match(index.get('france-energy'), /energie/, 'the group name is searchable too');
});

test('a query keeps rows holding every word, in any order, accents or not', () => {
  const index = buildRowSearchIndex(LAYERS, GROUPS);
  assert.deepEqual([...matchRows(index, 'electrique')].sort(), ['france-energy', 'power-grid']);
  assert.deepEqual([...matchRows(index, 'centrales réseau')], ['power-grid']);
  assert.deepEqual([...matchRows(index, 'militaire')], ['flights']);
  assert.equal(matchRows(index, '   ').size, 0);
  assert.equal(matchRows(index, 'zzqx').size, 0);
});

test('the list starts pinned only when the reader pinned it', () => {
  const store = (value) => ({ getItem: () => value });
  assert.equal(resolveDrawerPinned(store(null)), false);
  assert.equal(resolveDrawerPinned(store('false')), false);
  assert.equal(resolveDrawerPinned(store('true')), true);
  const broken = { getItem: () => { throw new Error('denied'); } };
  assert.equal(resolveDrawerPinned(broken), false);
  assert.equal(resolveDrawerPinned(null), false);
  assert.equal(DRAWER_PINNED_STORAGE_KEY, 'godsEyeView.v1.dataLayerDrawerPin',
    'not the first version\'s key, which a 1920 px screen read as pinned by default');
});

test('the group shown is the one asked for if it still has rows, else the first', () => {
  assert.equal(resolveRailCategory(GROUPS, 'energy'), 'energy');
  assert.equal(resolveRailCategory(GROUPS, 'plugged'), 'air-space');
  assert.equal(resolveRailCategory(GROUPS, null), 'air-space');
  assert.equal(resolveRailCategory([], 'energy'), null);
});

// ─── A DOM stub ──────────────────────────────────────────────────────────────

function parseSelector(selector) {
  const tag = selector.match(/^[a-z]+/i)?.[0] || null;
  const id = selector.match(/#([\w-]+)/)?.[1] || null;
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  // `[attr]` tests presence (value `null`), `[attr="v"]` equality.
  const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((match) => [match[1], match[2] ?? null]);
  return { tag, id, classes, attrs };
}

class FakeElement {
  constructor(tagName, doc) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.title = '';
    this.id = '';
    this._classes = new Set();
    this.style = { props: {}, setProperty(name, value) { this.props[name] = value; } };
    const self = this;
    this.classList = {
      add: (...names) => names.forEach((name) => self._classes.add(name)),
      remove: (...names) => names.forEach((name) => self._classes.delete(name)),
      contains: (name) => self._classes.has(name),
      toggle(name, force) {
        const on = force === undefined ? !self._classes.has(name) : Boolean(force);
        if (on) self._classes.add(name); else self._classes.delete(name);
        return on;
      },
    };
  }

  get className() { return [...this._classes].join(' '); }

  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  removeAttribute(name) { this.attributes.delete(name); }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) { for (const node of nodes) this.appendChild(node); }

  insertBefore(child, reference) {
    child.parentNode?.removeChild(child);
    const at = this.children.indexOf(reference);
    child.parentNode = this;
    if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }

  remove() { this.parentNode?.removeChild(this); }

  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }

  matches(selector) {
    const { tag, id, classes, attrs } = parseSelector(selector);
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (id && this.id !== id) return false;
    if (!classes.every((name) => this._classes.has(name))) return false;
    return attrs.every(([attr, value]) => {
      const actual = attr.startsWith('data-')
        ? this.dataset[attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
        : this.getAttribute(attr);
      if (value === null) return actual !== undefined && actual !== null;
      return String(actual ?? '') === value;
    });
  }

  closest(selector) {
    for (let current = this; current; current = current.parentNode) {
      if (current.matches?.(selector)) return current;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== handler));
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: init.target || this,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...init,
    };
    event.target = init.target || this;
    for (let node = this; node && !event.propagationStopped; node = node.parentNode) {
      for (const handler of node.listeners.get(type) || []) handler(event);
    }
    return event;
  }

  click() { this.dispatch('click'); }

  focus() { this.ownerDocument.activeElement = this; }
}

function makeDocument() {
  const doc = {
    activeElement: null,
    listeners: new Map(),
    createElement: (tag) => new FakeElement(tag, doc),
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== handler));
    },
    /** A document-level (capture) listener sees the event first. */
    fire(type, event) { for (const handler of this.listeners.get(type) || []) handler(event); },
  };
  return doc;
}

/** `setTimeout` and `performance.now` the test moves forward by hand. */
function makeClock() {
  let time = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, ms) {
      const id = nextId++;
      pending.set(id, { at: time + ms, callback });
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
    performance: { now: () => time },
    advance(ms) {
      time += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at > time) continue;
        pending.delete(id);
        entry.callback();
      }
    },
  };
}

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    store,
  };
}

/**
 * The panel as `index.html` and the manager leave it: a header, then the list
 * holding one section per group, one row per layer.
 */
function makePanel(doc, groups) {
  const panel = doc.createElement('div');
  panel.id = 'data-panel';
  panel.className = 'panel-collapsible active';
  const inner = doc.createElement('div');
  inner.className = 'data-panel-inner';
  const header = doc.createElement('div');
  header.className = 'panel-header';
  const list = doc.createElement('div');
  list.id = 'data-toggles';
  list.className = 'data-toggle-list';
  inner.append(header, list);
  panel.appendChild(inner);
  const paint = () => {
    list.children = [];
    for (const group of groups()) {
      const section = doc.createElement('div');
      section.className = 'data-category';
      section.dataset.categoryId = group.id;
      for (const id of group.layerIds) {
        const row = doc.createElement('div');
        row.className = 'data-toggle-row';
        row.dataset.layerId = id;
        section.appendChild(row);
      }
      list.appendChild(section);
    }
  };
  return { panel, list, paint };
}

function makeRail({ width = 1470, storage = makeStorage(), groups: seedGroups } = {}) {
  const doc = makeDocument();
  let groups = seedGroups || [
    { id: 'air-space', label: 'CIEL & MER', shortLabel: 'Ciel & mer', glyph: 'plane', total: 2, active: 0, layerIds: ['flights', 'satellites'] },
    { id: 'energy', label: 'ÉNERGIE', shortLabel: 'Énergie', glyph: 'zap', total: 2, active: 1, layerIds: ['power-grid', 'france-energy'] },
  ];
  const { panel, list, paint } = makePanel(doc, () => groups);
  const listeners = new Set();
  const calls = { layout: [] };
  const manager = {
    revealHandler: null,
    getPanelGroups: () => groups,
    getAll: () => LAYERS.concat({ id: 'satellites', label: 'Satellites', name: 'Sat', source: 'CelesTrak', category: 'air-space', showInTogglePanel: true }),
    subscribePanelPaint(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    setPanelRevealHandler(handler) { this.revealHandler = handler; },
    setPanelLayout(layout) { calls.layout.push(layout); paint(); for (const callback of listeners) callback({ rebuilt: true }); },
    revealPanelRow(id) { return this.revealHandler?.(id); },
  };
  paint();
  const clock = makeClock();
  const win = {
    innerWidth: width,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    performance: clock.performance,
  };
  const rail = mountLayerPanelRail({ dataManager: manager, panel, doc, win, storage });
  const canvas = doc.createElement('canvas');
  const container = doc.createElement('div');
  container.id = 'cesiumContainer';
  container.appendChild(canvas);
  const q = (selector) => panel.querySelector(selector);
  const button = (id) => panel.querySelector(`.data-rail-item[data-rail-category="${id}"]`);
  const shownSections = () => list.querySelectorAll('.data-category')
    .filter((section) => section.classList.contains('is-rail-current')
      || (panel.classList.contains('rail-searching') && !section.classList.contains('is-search-empty')))
    .map((section) => section.dataset.categoryId);
  const pressGlobe = (travel = 0, target = canvas, button = 0) => {
    doc.fire('pointerdown', { target, button, pointerId: 1, clientX: 100, clientY: 100, timeStamp: 0 });
    doc.fire('pointerup', { target, button, pointerId: 1, clientX: 100 + travel, clientY: 100, timeStamp: 120 });
  };
  const wheelGlobe = (target = canvas) => doc.fire('wheel', { target, deltaY: -120 });
  // The panel hears `pointerenter` and `pointerleave` on itself (they do not
  // bubble) and `pointermove` from whatever it holds.
  const enter = () => panel.dispatch('pointerenter', { pointerType: 'mouse', buttons: 0 });
  const leave = () => panel.dispatch('pointerleave', { pointerType: 'mouse', buttons: 0 });
  const move = (target, init = {}) => target.dispatch('pointermove', { pointerType: 'mouse', buttons: 0, ...init });
  const type = (value) => {
    const input = q('.data-drawer-search-input');
    input.value = value;
    input.dispatch('input');
  };
  const setGroups = (next) => {
    groups = next;
    paint();
    for (const callback of listeners) callback({ rebuilt: true });
  };
  return {
    rail, doc, panel, list, manager, calls, storage, clock, q, button, shownSections,
    pressGlobe, wheelGlobe, enter, leave, move, type, setGroups,
  };
}

// ─── The controller ──────────────────────────────────────────────────────────

test('mounting needs the manager, the panel and its list', () => {
  const doc = makeDocument();
  assert.equal(mountLayerPanelRail({ dataManager: null, panel: doc.createElement('div'), doc }), null);
  assert.equal(mountLayerPanelRail({ dataManager: {}, panel: doc.createElement('div'), doc }), null);
});

test('the rail draws one button per group, in order, and switches the manager to its layout', () => {
  const t = makeRail();
  assert.deepEqual(t.calls.layout, ['rail']);
  assert.ok(t.panel.classList.contains('has-rail'));
  const inner = t.q('.data-panel-inner');
  assert.deepEqual(inner.children.map((node) => node.className.split(' ')[0]),
    ['panel-header', 'data-rail', 'data-drawer-head', 'data-drawer-search', 'data-toggle-list'],
    'rail, head and search go between the header and the list, which keeps its place');
  const buttons = t.panel.querySelectorAll('.data-rail-item[data-rail-category]');
  assert.deepEqual(buttons.map((node) => node.dataset.railCategory), ['air-space', 'energy']);
  assert.equal(t.button('energy').querySelector('.data-rail-label').textContent, 'Énergie');
  assert.ok(t.button('energy').querySelector('.data-rail-icon').style.props['--data-rail-glyph'].startsWith('url("data:image/svg+xml'));
  assert.equal(t.button('energy').querySelector('.data-rail-badge').textContent, '1');
  assert.ok(t.button('air-space').querySelector('.data-rail-badge').classList.contains('is-empty'));
  assert.equal(t.button('energy').title, 'ÉNERGIE · 1/2 ACTIVES');
});

test('at every width the list starts closed; a stored pin starts it open', () => {
  for (const width of [1280, 1470, 1920, 2560]) {
    const t = makeRail({ width });
    assert.deepEqual([t.rail.getState().open, t.rail.getState().pinned], [false, false], `${width} px`);
    assert.ok(!t.panel.classList.contains('drawer-open'));
    assert.equal(t.q('.data-drawer-pin').getAttribute('aria-pressed'), 'false');
  }
  const pinned = makeRail({ storage: makeStorage({ [DRAWER_PINNED_STORAGE_KEY]: 'true' }) });
  assert.deepEqual([pinned.rail.getState().open, pinned.rail.getState().pinned], [true, true]);
});

test('a group opens the list on itself, swaps it, and closes it when pressed again', () => {
  const t = makeRail();
  t.button('energy').click();
  assert.equal(t.rail.getState().open, true);
  assert.deepEqual(t.shownSections(), ['energy']);
  assert.equal(t.button('energy').getAttribute('aria-expanded'), 'true');
  assert.equal(t.q('.data-drawer-title').textContent, 'ÉNERGIE');
  assert.equal(t.q('.data-drawer-count').textContent, '1/2 ACTIVES');
  assert.equal(t.storage.store.get(DRAWER_CATEGORY_STORAGE_KEY), 'energy');

  t.button('air-space').click();
  assert.deepEqual(t.shownSections(), ['air-space']);
  assert.equal(t.button('energy').getAttribute('aria-expanded'), 'false');

  t.button('air-space').click();
  assert.equal(t.rail.getState().open, false);
  assert.ok(!t.panel.classList.contains('drawer-open'));
  assert.equal(t.panel.querySelectorAll('.data-rail-item.is-current').length, 0);
});

test('the last group shown is the one the list reopens on', () => {
  const storage = makeStorage({ [DRAWER_CATEGORY_STORAGE_KEY]: 'energy' });
  const t = makeRail({ storage });
  t.rail.open();
  assert.deepEqual(t.shownSections(), ['energy']);
});

test('touching the globe folds the list: a click, a pan, any button, a wheel', () => {
  const t = makeRail();
  const reopen = () => t.button('energy').click();
  const folds = [
    ['a click', () => t.pressGlobe(0)],
    ['a pan', () => t.pressGlobe(40)],
    ['a right-drag zoom', () => t.pressGlobe(40, undefined, 2)],
    ['a wheel or a pinch', () => t.wheelGlobe()],
  ];
  for (const [gesture, act] of folds) {
    reopen();
    assert.equal(t.rail.getState().open, true);
    act();
    assert.equal(t.rail.getState().open, false, gesture);
    assert.ok(!t.panel.classList.contains('drawer-open'), gesture);
  }

  reopen();
  t.pressGlobe(0, t.doc.createElement('canvas'));
  t.wheelGlobe(t.doc.createElement('div'));
  assert.equal(t.rail.getState().open, true, 'a canvas outside the globe, or any other surface, is not the globe');
});

test('pinned, the list survives the globe; the close button still closes it', () => {
  const t = makeRail();
  t.button('energy').click();
  t.q('.data-drawer-pin').click();
  assert.equal(t.storage.store.get(DRAWER_PINNED_STORAGE_KEY), 'true');
  t.pressGlobe(40);
  t.wheelGlobe();
  assert.equal(t.rail.getState().open, true);
  t.q('.data-drawer-close').click();
  assert.equal(t.rail.getState().open, false, 'the close button closes a pinned list too');
});

test('a mouse resting on the rail unfolds the list on the group it showed last', () => {
  const t = makeRail();
  t.button('energy').click();
  t.pressGlobe(40);
  assert.equal(t.rail.getState().open, false);

  t.enter();
  t.move(t.button('air-space'));
  t.clock.advance(HOVER_OPEN_DELAY_MS - 1);
  assert.equal(t.rail.getState().open, false, 'not before the pointer has rested');
  t.move(t.button('air-space'));
  t.clock.advance(1);
  assert.equal(t.rail.getState().open, true);
  assert.deepEqual(t.shownSections(), ['energy'], 'the list comes back as it was, not on the group under the pointer');

  t.leave();
  t.clock.advance(5_000);
  assert.equal(t.rail.getState().open, true, 'the pointer leaving the panel folds nothing');
});

test('a pointer crossing the rail, a held button, a finger or a collapsed panel unfold nothing', () => {
  const t = makeRail();
  t.enter();
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS / 2);
  t.leave();
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, false, 'a pointer passing through');

  t.enter();
  t.move(t.button('energy'), { buttons: 1 });
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, false, 'a pan dragged across the rail');
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS / 2);
  t.move(t.button('energy'), { buttons: 1 });
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, false, 'a button pressed while the pointer rests cancels the wait');
  t.leave();

  t.enter();
  t.move(t.button('energy'), { pointerType: 'touch' });
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, false, 'a finger');
  t.leave();

  t.panel.classList.add('collapsed');
  t.enter();
  t.move(t.panel);
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, false, 'a panel folded to its launcher');
});

test('a list closed under the pointer stays closed until the pointer comes back', () => {
  const t = makeRail();
  t.enter();
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, true);
  t.clock.advance(HOVER_CLICK_GRACE_MS);

  t.q('.data-drawer-close').click();
  t.move(t.q('.data-drawer-close'));
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS * 5);
  assert.equal(t.rail.getState().open, false, 'the reader just closed it');

  t.leave();
  t.enter();
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.equal(t.rail.getState().open, true);
});

test('a click aimed before the pointer unfolded the list does not fold it', () => {
  const t = makeRail({ storage: makeStorage({ [DRAWER_CATEGORY_STORAGE_KEY]: 'energy' }) });
  t.enter();
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  assert.deepEqual(t.shownSections(), ['energy']);
  t.clock.advance(HOVER_CLICK_GRACE_MS - 100);
  t.button('energy').click();
  assert.equal(t.rail.getState().open, true, 'the click asked for the group the list opened on');
  t.clock.advance(100);
  t.button('energy').click();
  assert.equal(t.rail.getState().open, false, 'once the reader has seen it, a second press folds it');

  t.leave();
  t.enter();
  t.move(t.button('energy'));
  t.clock.advance(HOVER_OPEN_DELAY_MS);
  t.button('air-space').click();
  t.button('air-space').click();
  assert.equal(t.rail.getState().open, false, 'the grace belongs to the group the pointer unfolded, not the next one');
});

test('the search spans every group, says when nothing matches, and Escape empties then closes', () => {
  const t = makeRail();
  t.button('air-space').click();
  t.type('électrique');
  assert.ok(t.panel.classList.contains('rail-searching'));
  assert.deepEqual(t.shownSections(), ['energy']);
  assert.deepEqual(t.rail.getState().hits.sort(), ['france-energy', 'power-grid']);
  assert.equal(t.q('.data-drawer-title').textContent, 'RÉSULTATS');
  assert.equal(t.q('.data-drawer-count').textContent, '2 COUCHES');
  assert.ok(t.list.querySelector('.data-toggle-row[data-layer-id="flights"]').classList.contains('is-search-miss'));
  assert.ok(t.q('.data-rail-search').classList.contains('is-current'));

  t.type('zzqx');
  assert.equal(t.q('.data-drawer-empty').hidden, false);
  assert.equal(t.q('.data-drawer-empty').textContent, 'Aucune couche ne correspond à « zzqx ».');

  const input = t.q('.data-drawer-search-input');
  const first = input.dispatch('keydown', { key: 'Escape' });
  assert.equal(first.propagationStopped, true, 'the first Escape is spent on the field');
  assert.equal(input.value, '');
  assert.equal(t.rail.getState().open, true);
  assert.ok(!t.panel.classList.contains('rail-searching'));
  assert.equal(t.list.querySelectorAll('.is-search-miss').length, 0, 'an empty query hides no row');

  input.dispatch('keydown', { key: 'Escape' });
  assert.equal(t.rail.getState().open, false);
});

test('the voice surface reveals a row by opening its group', () => {
  const t = makeRail();
  t.type('zzqx');
  assert.equal(t.manager.revealPanelRow('france-energy'), true);
  assert.deepEqual(t.shownSections(), ['energy']);
  assert.equal(t.rail.getState().query, '', 'a reveal clears the search that would hide the row');
  assert.equal(t.manager.revealPanelRow('nowhere'), false);
});

test('a plugged dataset brings its group into the open list; an emptied group falls back', () => {
  const air = { id: 'air-space', label: 'CIEL & MER', shortLabel: 'Ciel & mer', glyph: 'plane', total: 2, active: 0, layerIds: ['flights', 'satellites'] };
  const energy = { id: 'energy', label: 'ÉNERGIE', shortLabel: 'Énergie', glyph: 'zap', total: 2, active: 1, layerIds: ['power-grid', 'france-energy'] };
  const plugged = { id: 'plugged', label: 'JEUX BRANCHÉS', shortLabel: 'Branchés', glyph: 'plug', total: 1, active: 0, layerIds: ['dataset-1'] };
  const t = makeRail();
  t.button('energy').click();
  t.setGroups([air, energy, plugged]);
  const ids = t.panel.querySelectorAll('.data-rail-item[data-rail-category]').map((node) => node.dataset.railCategory);
  assert.deepEqual(ids, ['air-space', 'energy', 'plugged']);
  assert.deepEqual(t.shownSections(), ['plugged'], 'the reader sees the row they just plugged in');

  t.setGroups([air, energy]);
  assert.equal(t.panel.querySelector('.data-rail-item[data-rail-category="plugged"]'), null);
  assert.equal(t.rail.getState().category, 'air-space', 'the emptied group falls back to the first');
  assert.deepEqual(t.shownSections(), ['air-space']);

  t.rail.close();
  t.setGroups([air, energy, plugged]);
  assert.equal(t.rail.getState().category, 'air-space', 'a closed list is not reopened, nor moved');
  assert.equal(t.rail.getState().open, false);
});

test('destroy gives the panel back to the accordion', () => {
  const t = makeRail();
  t.rail.destroy();
  assert.deepEqual(t.calls.layout, ['rail', 'accordion']);
  assert.equal(t.panel.querySelector('.data-rail'), null);
  assert.ok(!t.panel.classList.contains('has-rail'));
  assert.equal(t.manager.revealHandler, null);
});

test('the rail and its list answer in English', () => {
  const m = withLocale('en', () => messages());
  assert.equal(m.search.label, 'Search');
  assert.equal(m.search.placeholder, 'Search layers…');
  assert.equal(m.search.resultsCount(1), '1 LAYER');
  assert.equal(m.search.resultsCount(4), '4 LAYERS');
  assert.equal(m.search.noMatch('radar'), 'No layer matches “radar”.');
  assert.equal(m.drawer.pin, 'Keep the list open');
  assertNoFrench(m);
  assert.equal(messages().search.resultsCount(1), '1 COUCHE');
});
