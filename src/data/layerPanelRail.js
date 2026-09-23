/**
 * @module layerPanelRail
 *
 * THE LAYERS PANEL ON A DESKTOP: A COLUMN OF GROUPS, AND ONE LIST BESIDE IT.
 *
 * The panel used to be one scrolling column: six group headers and 33 rows,
 * 320 px wide, where opening « Bâti & territoire » (10 rows) pushed the four
 * groups after it below the fold. This module turns it into two columns:
 *
 *   - the RAIL, 88 px: one button per group — a glyph, a short name, a badge
 *     counting the rows that are on — plus a search entry. It is what the
 *     panel is when nothing is being browsed.
 *   - the LIST, 292 px, beside it: the rows of ONE group, under that group's
 *     name, its tally, a search field and two buttons (keep open, close).
 *
 * THE LIST IS A DRAWER, AND WHAT CLOSES IT IS A CLICK ON THE GLOBE. Open, the
 * panel is 380 px — 25 % of a 13-inch MacBook, 30 % of a 1280 px laptop — and
 * most of what a reader does after switching a layer on is look at the map. So
 * a plain click on the globe (not a drag: panning is looking) closes it, the
 * way a menu closes, and the rail stays. Hovering was the other candidate and
 * was rejected: a drag across the left edge would open it mid-gesture, a touch
 * screen has no hover, and a list that closes when the pointer leaves it closes
 * every time the reader glances at what they just switched on.
 *
 * A PIN KEEPS IT OPEN, AND A WIDE SCREEN STARTS PINNED. At 1920 px and more
 * the open panel costs a fifth of the width or less, and closing it on every
 * click would be friction with nothing to gain. The reader's own choice, once
 * made, is stored and wins over the width.
 *
 * WHAT THIS MODULE DOES NOT OWN. The rows. `DataLayerManager` still builds
 * every group and every row (`setPanelLayout('rail')` makes its headers plain
 * headings and forbids collapsed groups), and this module only decides, with
 * classes, which group the list shows and which rows a search keeps. Every
 * lookup by `[data-layer-id]` — the voice surface, the refresh pass — keeps
 * finding its row. Classes rather than `hidden`: the left stack's layout
 * engine (`src/ui.js`) re-measures on class mutations, and the list's height
 * changes with every switch of group.
 *
 * THE PHONE NEVER MOUNTS THIS. Its sheet draws the same groups as an
 * accordion (`phoneSheet.js`), and `src/main.js` mounts the rail only when the
 * shell is not the phone's.
 */
import { lucideIconMask } from './lucideIcons.js';
import managerMessages from './manager.i18n.js';
import messages from './layerPanelRail.i18n.js';

/** The reader's pin choice: `'true'` or `'false'`; absent until they press it. */
export const DRAWER_PINNED_STORAGE_KEY = 'godsEyeView.v1.dataLayerDrawerPinned';

/** The group the list showed last. */
export const DRAWER_CATEGORY_STORAGE_KEY = 'godsEyeView.v1.dataLayerDrawerCategory';

/**
 * From this viewport width up, the list starts pinned. The open panel is 380 px:
 * 20 % of 1920, 15 % of 2560 — narrow enough to leave open. Below it (a 1440 or
 * 1512 MacBook, a 1280 laptop at 150 %) it is a quarter of the screen or more.
 */
export const PINNED_BY_DEFAULT_MIN_WIDTH = 1920;

/** Travel under which a press on the globe is a click, not a pan. */
const GLOBE_TAP_TRAVEL_PX = 6;

/** A press held longer than this is somebody looking, not clicking. */
const GLOBE_TAP_MAX_MS = 700;

/**
 * Lowercase, accents folded, spaces collapsed: « Électricité » matches
 * `electricite`, and a reader who types without accents is not punished.
 * @param {*} text
 * @returns {string}
 */
export function normalizeSearchText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What each row can be found by: its name, its source, its group — and the
 * names of the layers FUSED into it, because those have no row of their own.
 * « militaire » finds « Vols en direct », which carries the military flights
 * as a chip; a search that missed it would say the layer does not exist.
 *
 * @param {Array<object>} layers `DataLayerManager.getAll()` projection.
 * @param {Array<{id: string, label: string, shortLabel?: string}>} groups
 * @returns {Map<string, string>} Row layer id → normalised text.
 */
export function buildRowSearchIndex(layers, groups = []) {
  const groupWords = new Map(groups.map((group) => [group.id, `${group.label || ''} ${group.shortLabel || ''}`]));
  const rows = new Map();
  for (const layer of layers || []) {
    if (!layer?.showInTogglePanel || layer.fusedInto) continue;
    rows.set(layer.id, [
      layer.label || layer.name,
      layer.name,
      layer.sourceLabel || layer.source,
      groupWords.get(layer.category) || '',
    ]);
  }
  for (const layer of layers || []) {
    if (!layer?.fusedInto || !rows.has(layer.fusedInto)) continue;
    rows.get(layer.fusedInto).push(layer.label || layer.name, layer.sourceLabel || layer.source);
  }
  const index = new Map();
  for (const [id, parts] of rows) index.set(id, normalizeSearchText(parts.filter(Boolean).join(' ')));
  return index;
}

/**
 * The rows a query keeps: every word of it must appear in the row's text, in
 * any order — « bruit aéroport » and « aéroports bruit » find the same row.
 * @param {Map<string, string>} index From {@link buildRowSearchIndex}.
 * @param {string} query What the reader typed.
 * @returns {Set<string>} Row layer ids; empty for an empty query.
 */
export function matchRows(index, query) {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  const hits = new Set();
  if (!words.length) return hits;
  for (const [id, text] of index) {
    if (words.every((word) => text.includes(word))) hits.add(id);
  }
  return hits;
}

/**
 * Whether the list starts pinned: the reader's stored choice, else the width.
 * @param {?{getItem: function(string): ?string}} storage
 * @param {number} viewportWidth CSS pixels.
 * @returns {boolean}
 */
export function resolveDrawerPinned(storage, viewportWidth) {
  try {
    const stored = storage?.getItem?.(DRAWER_PINNED_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Storage refused: fall through to the width, which is the default anyway.
  }
  return Number(viewportWidth) >= PINNED_BY_DEFAULT_MIN_WIDTH;
}

/**
 * The group to show: the one asked for if it still exists, else the first.
 * A stored id can name a group that has since emptied (the plugged datasets,
 * unplugged) — showing an empty list for it would read as a broken panel.
 * @param {Array<{id: string}>} groups
 * @param {?string} preferred
 * @returns {?string}
 */
export function resolveRailCategory(groups, preferred) {
  if (preferred && groups.some((group) => group.id === preferred)) return preferred;
  return groups[0]?.id || null;
}

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Best effort: a choice that does not survive a reload is a small loss.
  }
}

/**
 * Mount the rail and the drawer inside the Layers panel.
 *
 * Call AFTER `dataManager.buildTogglePanel()`: the rail reads the groups the
 * manager already drew.
 *
 * @param {object} options
 * @param {object} options.dataManager The `DataLayerManager`.
 * @param {?HTMLElement} [options.panel] `#data-panel`.
 * @param {Document} [options.doc]
 * @param {Window} [options.win]
 * @param {?Storage} [options.storage]
 * @returns {?{open: function(?string): void, close: function(): void,
 *   reveal: function(string): boolean, setPinned: function(boolean): void,
 *   getState: function(): object, destroy: function(): void}}
 */
export function mountLayerPanelRail({
  dataManager,
  panel = typeof document !== 'undefined' ? document.getElementById('data-panel') : null,
  doc = typeof document !== 'undefined' ? document : null,
  win = typeof window !== 'undefined' ? window : null,
  storage = (() => {
    try {
      return win?.localStorage ?? null;
    } catch {
      return null;
    }
  })(),
} = {}) {
  const inner = panel?.querySelector?.('.data-panel-inner');
  const list = panel?.querySelector?.('#data-toggles');
  if (!dataManager || !doc || !inner || !list) return null;

  const m = messages();
  const state = {
    open: false,
    pinned: resolveDrawerPinned(storage, win?.innerWidth ?? 0),
    category: readStorage(storage, DRAWER_CATEGORY_STORAGE_KEY),
    query: '',
  };
  let groups = [];
  let searchIndex = null;
  let hits = new Set();

  const make = (tag, className) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  };
  const glyph = (className, name) => {
    const node = make('span', className);
    node.setAttribute('aria-hidden', 'true');
    const uri = lucideIconMask(name);
    if (uri) node.style.setProperty('--data-rail-glyph', `url("${uri}")`);
    return node;
  };

  // ── The rail ────────────────────────────────────────────────────────────
  const rail = make('nav', 'data-rail');
  rail.setAttribute('aria-label', m.railAria);

  const searchButton = make('button', 'data-rail-item data-rail-search');
  searchButton.type = 'button';
  searchButton.title = m.search.title;
  searchButton.setAttribute('aria-controls', 'data-toggles');
  searchButton.setAttribute('aria-expanded', 'false');
  const searchLabel = make('span', 'data-rail-label');
  searchLabel.textContent = m.search.label;
  searchButton.append(glyph('data-rail-icon', 'search'), searchLabel);

  const railRule = make('span', 'data-rail-rule');
  railRule.setAttribute('aria-hidden', 'true');

  const railGroups = make('div', 'data-rail-groups');
  rail.append(searchButton, railRule, railGroups);

  /** @type {Map<string, HTMLElement>} */
  const railButtons = new Map();

  // ── The drawer's head ───────────────────────────────────────────────────
  const head = make('div', 'data-drawer-head');
  const titles = make('div', 'data-drawer-titles');
  const title = make('span', 'data-drawer-title');
  title.id = 'data-drawer-title';
  const tally = make('span', 'data-drawer-count');
  titles.append(title, tally);

  const pinButton = make('button', 'data-drawer-btn data-drawer-pin');
  pinButton.type = 'button';
  pinButton.append(glyph('data-drawer-glyph', 'pin'));

  const closeButton = make('button', 'data-drawer-btn data-drawer-close');
  closeButton.type = 'button';
  closeButton.title = m.drawer.close;
  closeButton.setAttribute('aria-label', m.drawer.close);
  closeButton.append(glyph('data-drawer-glyph', 'x'));
  head.append(titles, pinButton, closeButton);

  // ── The drawer's search ─────────────────────────────────────────────────
  const search = make('div', 'data-drawer-search');
  const field = make('label', 'data-drawer-search-field');
  const input = make('input', 'data-drawer-search-input');
  input.type = 'search';
  input.placeholder = m.search.placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', m.search.title);
  input.setAttribute('aria-controls', 'data-toggles');
  field.append(glyph('data-drawer-search-icon', 'search'), input);
  const empty = make('p', 'data-drawer-empty');
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  search.append(field, empty);

  inner.insertBefore(rail, list);
  inner.insertBefore(head, list);
  inner.insertBefore(search, list);
  panel.classList.add('has-rail');

  // ── State → DOM ─────────────────────────────────────────────────────────
  // Text is written only when it changes. This runs on every refresh of the
  // panel, and the left stack's layout engine (src/ui.js) re-measures on any
  // text mutation inside it — rewriting the same tally would buy a layout
  // pass per stats tick for nothing.
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const searching = () => state.query.trim().length > 0;
  const currentGroup = () => groups.find((group) => group.id === state.category) || null;

  function syncRailButtons() {
    const seen = new Set();
    for (const group of groups) {
      seen.add(group.id);
      let button = railButtons.get(group.id);
      if (!button) {
        button = make('button', 'data-rail-item');
        button.type = 'button';
        button.dataset.railCategory = group.id;
        button.setAttribute('aria-controls', 'data-toggles');
        const label = make('span', 'data-rail-label');
        const badge = make('span', 'data-rail-badge');
        badge.setAttribute('aria-hidden', 'true');
        button.append(glyph('data-rail-icon', group.glyph), label, badge);
        button.addEventListener('click', () => onGroupPressed(group.id));
        railButtons.set(group.id, button);
      }
      railGroups.appendChild(button);
    }
    for (const [id, button] of railButtons) {
      if (seen.has(id)) continue;
      button.remove();
      railButtons.delete(id);
    }
  }

  function syncCounts() {
    const tallies = managerMessages().panel;
    for (const group of groups) {
      const button = railButtons.get(group.id);
      if (!button) continue;
      const label = button.querySelector('.data-rail-label');
      if (label) setText(label, group.shortLabel);
      const badge = button.querySelector('.data-rail-badge');
      if (badge) {
        setText(badge, group.active > 0 ? String(group.active) : '');
        badge.classList.toggle('is-empty', group.active === 0);
      }
      const summary = `${group.label} · ${tallies.categoryCount(group.active, group.total)}`;
      if (button.title !== summary) {
        button.title = summary;
        button.setAttribute('aria-label', summary);
      }
      button.classList.toggle('has-active', group.active > 0);
    }
    const group = searching() ? null : currentGroup();
    setText(title, searching() ? m.search.resultsTitle : (group?.label || ''));
    setText(tally, searching()
      ? m.search.resultsCount(hits.size)
      : (group ? tallies.categoryCount(group.active, group.total) : ''));
    tally.classList.toggle('has-active', Boolean(group?.active));
  }

  function applyView() {
    const isSearching = searching();
    panel.classList.toggle('drawer-open', state.open);
    panel.classList.toggle('rail-searching', state.open && isSearching);

    for (const [id, button] of railButtons) {
      const current = state.open && !isSearching && id === state.category;
      button.classList.toggle('is-current', current);
      button.setAttribute('aria-expanded', current ? 'true' : 'false');
    }
    const searchCurrent = state.open && isSearching;
    searchButton.classList.toggle('is-current', searchCurrent);
    searchButton.setAttribute('aria-expanded', searchCurrent ? 'true' : 'false');

    if (isSearching) {
      if (!searchIndex) searchIndex = buildRowSearchIndex(dataManager.getAll(), groups);
      hits = matchRows(searchIndex, state.query);
    } else {
      hits = new Set();
    }

    for (const section of list.querySelectorAll('.data-category')) {
      const id = section.dataset?.categoryId;
      section.classList.toggle('is-rail-current', !isSearching && id === state.category);
      let sectionHits = 0;
      for (const row of section.querySelectorAll('.data-toggle-row')) {
        const miss = isSearching && !hits.has(row.dataset?.layerId);
        row.classList.toggle('is-search-miss', miss);
        if (!miss) sectionHits += 1;
      }
      section.classList.toggle('is-search-empty', isSearching && sectionHits === 0);
    }

    const noMatch = isSearching && hits.size === 0;
    empty.hidden = !noMatch;
    setText(empty, noMatch ? m.search.noMatch(state.query.trim()) : '');

    const pinLabel = state.pinned ? m.drawer.unpin : m.drawer.pin;
    pinButton.title = pinLabel;
    pinButton.setAttribute('aria-label', pinLabel);
    pinButton.setAttribute('aria-pressed', state.pinned ? 'true' : 'false');
    pinButton.classList.toggle('is-pinned', state.pinned);

    syncCounts();
  }

  // Rows present when the rail was last rebuilt. A row that appears after
  // that is one the reader just plugged in from the bottom of the list
  // (`datasetPlugPanel.js`), and it lands in « Jeux branchés » or in the
  // group its manifest names — most often not the group on screen, which would
  // leave the reader wondering where their dataset went.
  let knownRows = null;

  function refreshGroups({ rebuilt = false } = {}) {
    groups = dataManager.getPanelGroups();
    if (rebuilt) {
      const rows = groups.flatMap((group) => group.layerIds);
      const added = knownRows ? rows.filter((id) => !knownRows.has(id)) : [];
      knownRows = new Set(rows);
      const home = added.length ? groups.find((group) => group.layerIds.includes(added[0])) : null;
      if (home && state.open) state.category = home.id;
    }
    state.category = resolveRailCategory(groups, state.category);
  }

  // ── Verbs ───────────────────────────────────────────────────────────────
  function open(categoryId = null) {
    if (categoryId) {
      state.category = resolveRailCategory(groups, categoryId);
      writeStorage(storage, DRAWER_CATEGORY_STORAGE_KEY, state.category || '');
    }
    state.open = true;
    applyView();
  }

  function clearQuery() {
    state.query = '';
    if (input.value) input.value = '';
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    clearQuery();
    applyView();
  }

  function setPinned(pinned) {
    state.pinned = Boolean(pinned);
    writeStorage(storage, DRAWER_PINNED_STORAGE_KEY, state.pinned ? 'true' : 'false');
    applyView();
  }

  function reveal(rowId) {
    const group = groups.find((entry) => entry.layerIds.includes(rowId));
    if (!group) return false;
    clearQuery();
    open(group.id);
    return true;
  }

  function onGroupPressed(id) {
    if (state.open && !searching() && state.category === id) {
      close();
      return;
    }
    clearQuery();
    open(id);
  }

  // ── Listeners ───────────────────────────────────────────────────────────
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target?.addEventListener?.(type, handler, options);
    cleanups.push(() => target?.removeEventListener?.(type, handler, options));
  };

  listen(searchButton, 'click', () => {
    if (state.open && searching()) {
      close();
      return;
    }
    open();
    input.focus?.({ preventScroll: true });
  });
  listen(pinButton, 'click', () => setPinned(!state.pinned));
  listen(closeButton, 'click', () => {
    close();
    railButtons.get(state.category)?.focus?.({ preventScroll: true });
  });
  listen(input, 'input', () => {
    state.query = String(input.value || '');
    applyView();
  });
  listen(input, 'keydown', (event) => {
    if (event.key !== 'Escape' || !input.value) return;
    // First Escape empties the field; the second, handled below, closes.
    event.preventDefault();
    event.stopPropagation();
    clearQuery();
    applyView();
  });
  listen(panel, 'keydown', (event) => {
    if (event.key !== 'Escape' || !state.open || panel.classList.contains('collapsed')) return;
    const focusWasInDrawer = head.contains(event.target) || search.contains(event.target) || list.contains(event.target);
    close();
    if (focusWasInDrawer) railButtons.get(state.category)?.focus?.({ preventScroll: true });
  });

  // A plain click on the globe closes the list, unless it is pinned. Capture
  // phase, because the globe's own handlers (picking, selection) may stop the
  // event; the list closes whatever the click went on to do.
  let press = null;
  const isGlobe = (target) => target?.tagName === 'CANVAS' && Boolean(target.closest?.('#cesiumContainer'));
  listen(doc, 'pointerdown', (event) => {
    press = null;
    if (!state.open || state.pinned || event.button !== 0 || !isGlobe(event.target)) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp };
  }, { capture: true, passive: true });
  listen(doc, 'pointerup', (event) => {
    const start = press;
    press = null;
    if (!start || event.pointerId !== start.id || !state.open || state.pinned) return;
    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (travel > GLOBE_TAP_TRAVEL_PX || event.timeStamp - start.t > GLOBE_TAP_MAX_MS) return;
    close();
  }, { capture: true, passive: true });

  // Expanding the panel from its launcher opens the list with it: one click
  // to reach a row, as before. A panel the layout engine collapsed to make
  // room and now gives back is not the reader asking for anything.
  const PanelObserver = win?.MutationObserver ?? globalThis.MutationObserver;
  const panelObserver = typeof PanelObserver === 'function'
    ? new PanelObserver((records) => {
      for (const record of records) {
        const before = String(record.oldValue || '').split(/\s+/);
        const wasCollapsed = before.includes('collapsed');
        if (!wasCollapsed || panel.classList.contains('collapsed')) continue;
        if (before.includes('layout-auto-collapsed')) continue;
        open();
        return;
      }
    })
    : null;
  panelObserver?.observe(panel, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  cleanups.push(() => panelObserver?.disconnect());

  cleanups.push(dataManager.subscribePanelPaint(({ rebuilt }) => {
    refreshGroups({ rebuilt });
    if (rebuilt) {
      searchIndex = null;
      syncRailButtons();
      applyView();
    } else {
      syncCounts();
    }
  }));
  dataManager.setPanelRevealHandler(reveal);
  cleanups.push(() => dataManager.setPanelRevealHandler(null));

  // ── First paint ─────────────────────────────────────────────────────────
  // The rows are rebuilt as headings rather than accordion buttons, which
  // repaints through the listener above.
  dataManager.setPanelLayout('rail');
  refreshGroups({ rebuilt: true });
  syncRailButtons();
  state.open = state.pinned;
  applyView();

  return {
    open,
    close,
    reveal,
    setPinned,
    getState: () => ({
      open: state.open,
      pinned: state.pinned,
      category: state.category,
      query: state.query,
      hits: [...hits],
    }),
    destroy() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      rail.remove();
      head.remove();
      search.remove();
      panel.classList.remove('has-rail', 'drawer-open', 'rail-searching');
      dataManager.setPanelLayout('accordion');
    },
  };
}
