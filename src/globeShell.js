/**
 * The globe's top row on a desktop: the place search at the top centre, and
 * the « Apparence » / « Plus d'actions » bar at the top right.
 *
 * WHY (2026-09-23). Three things the owner asked for, from a review of the
 * whole screen against a mock-up:
 *
 *   - Finding a place is how a visit starts, and the field was folded into the
 *     « LIEU » tray of the bottom dock, behind a hover. It is now a visible
 *     field at the top centre, with ⌘ K / Ctrl K and « / », and a menu of the
 *     places this browser searched before.
 *   - The look of the map was split across three places — the STYLE ACTIF chip
 *     in the top-right corner, the STYLES VISUELS tray of the dock and the
 *     AFFICHAGE panel of the right rail. One « Apparence » panel now holds the
 *     styles (as previews of the current view), the base map, the edge shade,
 *     two switches, and the former AFFICHAGE panel under « Réglages avancés ».
 *   - The top centre belonged to a row of five round buttons read by their
 *     glyph alone. They are the « Plus d'actions » menu now, with words.
 *
 * MOVE, DON'T REBUILD. Every control that already existed is MOVED here with
 * its listeners, exactly as src/phoneSheet.js adopts panels on a phone: the one
 * search form (`#location-search-form`), the city shortcuts (`#location-pills`)
 * and their landmarks (`#poi-row`), the style buttons (`#style-buttons`), the
 * base-map chips (`.map-source-section`) and `#pp-toggles`. So there is still
 * one field, one submit path, one style handler, and every id the voice
 * surface, the share link and the tests look up still finds its element.
 *
 * NOT ON A PHONE. The phone shell has its own top bar and sheet; this module
 * returns before touching the DOM there.
 *
 * @module globeShell
 */

import messages from './globeShell.i18n.js';
import { lucideIconMask } from './data/lucideIcons.js';
import { isPhoneShell } from './inputMode.js';

/** Where the recent places live. Local to this browser, never sent anywhere. */
export const PLACE_RECENTS_STORAGE_KEY = 'surplomb.placeRecents.v1';
/** How many recent places the menu keeps. */
export const PLACE_RECENTS_MAX = 5;
/** Longest label or query kept, so a pasted paragraph cannot fill storage. */
const PLACE_RECENT_TEXT_MAX = 120;
/** Longest edge of the view capture the style previews are cut from. */
export const STYLE_PREVIEW_MAX_PX = 320;
/** A capture younger than this is reused when the panel reopens. */
const STYLE_PREVIEW_REUSE_MS = 4000;

// ── Pure helpers ────────────────────────────────────────────────────────────

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PLACE_RECENT_TEXT_MAX);
}

/**
 * Normalise one stored entry, or null when it is not one.
 * A recent place is a typed search (`query`) or a city shortcut (`cityId`).
 * @param {unknown} entry
 * @returns {{label: string, query?: string, cityId?: string}|null}
 */
export function normalizePlaceRecent(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const label = cleanText(entry.label);
  const query = cleanText(entry.query);
  const cityId = cleanText(entry.cityId);
  if (!label || (!query && !cityId)) return null;
  return cityId ? { label, cityId } : { label, query };
}

/**
 * The list after visiting a place: newest first, one entry per place, capped.
 * Two entries are the same place when they name the same city shortcut, or
 * when their labels match without regard to case and accents.
 * @param {ReadonlyArray<unknown>} list
 * @param {unknown} entry
 * @param {number} [max=PLACE_RECENTS_MAX]
 * @returns {Array<{label: string, query?: string, cityId?: string}>}
 */
export function rememberPlace(list, entry, max = PLACE_RECENTS_MAX) {
  const next = normalizePlaceRecent(entry);
  const kept = (Array.isArray(list) ? list : []).map(normalizePlaceRecent).filter(Boolean);
  if (!next) return kept.slice(0, max);
  const key = (item) => (item.cityId ? `city:${item.cityId}` : `label:${foldText(item.label)}`);
  const nextKey = key(next);
  return [next, ...kept.filter((item) => key(item) !== nextKey)].slice(0, max);
}

/**
 * @param {string} text
 * @returns {string} lower case, accents removed.
 */
export function foldText(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {Array<{label: string, query?: string, cityId?: string}>}
 */
export function readPlaceRecents(storage) {
  try {
    const raw = storage?.getItem(PLACE_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return rememberPlace(parsed, null);
  } catch {
    return [];
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {ReadonlyArray<unknown>} list
 * @returns {void}
 */
export function writePlaceRecents(storage, list) {
  try {
    storage?.setItem(PLACE_RECENTS_STORAGE_KEY, JSON.stringify(rememberPlace(list, null)));
  } catch {
    // storage full or unavailable: the menu simply forgets
  }
}

/**
 * Whether the reader is on an Apple keyboard, where the shortcut is ⌘ K.
 * @param {{platform?: string, userAgentData?: {platform?: string}, userAgent?: string}} [nav]
 * @returns {boolean}
 */
export function isApplePlatform(nav = globalThis.navigator) {
  const platform = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * The key badge shown in the field.
 * @param {boolean} apple
 * @returns {string}
 */
export function placeSearchShortcutLabel(apple) {
  return apple ? '⌘ K' : 'Ctrl K';
}

/**
 * Whether a keydown asks for the place search: ⌘ K on a Mac, Ctrl K
 * elsewhere, or a bare « / » when the reader is not typing in a field.
 * @param {{key?: string, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean}} event
 * @param {{apple: boolean, typing: boolean}} context
 * @returns {boolean}
 */
export function isPlaceSearchShortcut(event, { apple, typing }) {
  if (!event || event.altKey) return false;
  const key = String(event.key || '').toLowerCase();
  if (key === 'k') {
    return apple ? !!event.metaKey && !event.ctrlKey : !!event.ctrlKey && !event.metaKey;
  }
  if (key === '/') return !typing && !event.metaKey && !event.ctrlKey;
  return false;
}

/**
 * Whether the focused element takes text, so a bare key belongs to it.
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isTypingTarget(element) {
  if (!element || typeof element.matches !== 'function') return false;
  return element.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/**
 * The capture's size for a canvas: its aspect, no larger than `maxPx`.
 * @param {number} width
 * @param {number} height
 * @param {number} [maxPx=STYLE_PREVIEW_MAX_PX]
 * @returns {{width: number, height: number}|null}
 */
export function stylePreviewSize(width, height, maxPx = STYLE_PREVIEW_MAX_PX) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return null;
  const scale = Math.min(1, maxPx / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// ── DOM ─────────────────────────────────────────────────────────────────────

/**
 * Paint every `[data-shell-icon]` under `root` with its Lucide mask. Shared
 * with the navigation bar (src/globeNav.js).
 * @param {ParentNode} root
 * @returns {void}
 */
export function paintShellIcons(root) {
  root.querySelectorAll('[data-shell-icon]').forEach((element) => {
    const uri = lucideIconMask(element.dataset.shellIcon);
    if (!uri) return;
    element.style.setProperty('--shell-icon', `url("${uri}")`);
  });
}

/**
 * Wire the desktop top row. Returns null on a phone, or when the page lacks
 * the markup (tests, a stripped page).
 *
 * @param {object} options
 * @param {object} options.ui The StyleManager: `flyToAddress`, `closeGlobeMenus`
 *   callers and the city shortcuts go through it.
 * @param {object} [options.viewer] Cesium viewer, for the style previews.
 * @param {Document} [options.doc]
 * @param {Storage|null} [options.storage]
 * @returns {{openPlaceSearch: () => void, setAppearanceOpen: (open: boolean) => void, dispose: () => void}|null}
 */
export function initGlobeShell({ ui, viewer = null, doc = globalThis.document, storage = globalThis.localStorage } = {}) {
  if (!doc || isPhoneShell()) return null;
  const placeSearch = doc.getElementById('place-search');
  const searchBar = doc.getElementById('place-search-bar');
  const menu = doc.getElementById('place-search-menu');
  const form = doc.getElementById('location-search-form');
  const field = doc.getElementById('location-search');
  const topBar = doc.getElementById('globe-top-bar');
  const panel = doc.getElementById('appearance-panel');
  if (!placeSearch || !searchBar || !menu || !form || !field || !topBar || !panel) return null;

  const m = messages();
  const apple = isApplePlatform();
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target?.addEventListener(type, handler, options);
    cleanups.push(() => target?.removeEventListener(type, handler, options));
  };

  // ── The place search ──────────────────────────────────────────────────────
  const kbd = doc.getElementById('place-search-kbd');
  searchBar.insertBefore(form, kbd);
  field.classList.add('expanded');
  // The phone's shorter placeholder is the markup's; this field says what it
  // takes. The key goes too, so a later pass of the i18n applicator cannot
  // write the short one back.
  field.removeAttribute('data-i18n-placeholder');
  field.placeholder = m.searchPlaceholder;
  field.setAttribute('aria-label', m.searchLabel);
  field.setAttribute('aria-controls', 'place-search-menu');
  field.setAttribute('aria-expanded', 'false');
  if (kbd) {
    kbd.textContent = placeSearchShortcutLabel(apple);
    kbd.title = m.shortcutHint(kbd.textContent);
  }
  field.setAttribute('aria-keyshortcuts', apple ? 'Meta+K /' : 'Control+K /');

  const citiesSection = doc.getElementById('place-search-cities-section');
  const pills = doc.getElementById('location-pills');
  const poiRow = doc.getElementById('poi-row');
  if (citiesSection && pills) citiesSection.append(pills);
  if (citiesSection && poiRow) citiesSection.append(poiRow);

  const recentsSection = doc.getElementById('place-search-recents-section');
  const recentsList = doc.getElementById('place-search-recents');
  let recents = readPlaceRecents(storage);

  const renderRecents = () => {
    if (!recentsList || !recentsSection) return;
    recentsList.replaceChildren();
    for (const recent of recents) {
      const item = doc.createElement('li');
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'place-search-recent';
      button.setAttribute('aria-label', m.recentFly(recent.label));
      const glyph = doc.createElement('span');
      glyph.className = 'shell-icon';
      glyph.dataset.shellIcon = recent.cityId ? 'map-pin' : 'clock';
      glyph.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span');
      label.className = 'place-search-recent-label';
      label.textContent = recent.label;
      button.append(glyph, label);
      button.addEventListener('click', () => visitRecent(recent));
      item.append(button);
      recentsList.append(item);
    }
    paintShellIcons(recentsList);
    recentsSection.hidden = recents.length === 0;
  };

  const remember = (entry) => {
    recents = rememberPlace(recents, entry);
    writePlaceRecents(storage, recents);
    renderRecents();
  };

  const setMenuOpen = (open) => {
    menu.hidden = !open;
    placeSearch.classList.toggle('menu-open', open);
    // `collapsed` while shut, as the dock tray was: the first-run bubble
    // closes when the search it advertises opens (src/firstRunHint.js).
    placeSearch.classList.toggle('collapsed', !open);
    field.setAttribute('aria-expanded', String(open));
  };

  const visitRecent = (recent) => {
    setMenuOpen(false);
    if (recent.cityId) {
      const pill = pills?.querySelector(`[data-location-id="${CSS.escape(recent.cityId)}"]`);
      if (pill) { pill.click(); return; }
    }
    const query = recent.query || recent.label;
    field.value = recent.label;
    field.blur();
    void ui?.flyToAddress?.(query, { searchField: field }).then((outcome) => {
      if (outcome?.status === 'flying') remember({ label: outcome.label || recent.label, query });
    });
  };

  // A typed search reports its destination on the form (ui.js
  // `_submitLocationSearch`): only a search that found somewhere is kept.
  listen(form, 'place-search:found', (event) => {
    const { query, label } = event.detail || {};
    remember({ label: label || query, query });
    setMenuOpen(false);
    field.blur();
  });
  listen(pills, 'click', (event) => {
    const pill = event.target?.closest?.('.location-pill[data-location-id]');
    if (!pill) return;
    remember({ label: pill.textContent, cityId: pill.dataset.locationId });
  });

  listen(field, 'focus', () => setMenuOpen(true));
  listen(field, 'click', () => setMenuOpen(true));
  listen(placeSearch, 'focusout', (event) => {
    if (!placeSearch.contains(event.relatedTarget)) setMenuOpen(false);
  });
  listen(field, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setMenuOpen(false);
    field.blur();
  });

  const openPlaceSearch = () => {
    setAppearanceOpen(false);
    setActionsOpen(false);
    field.focus();
    field.select?.();
    setMenuOpen(true);
  };

  renderRecents();
  placeSearch.hidden = false;

  // ── « Plus d'actions » ────────────────────────────────────────────────────
  const actions = doc.getElementById('top-center-actions');
  const actionsToggle = doc.getElementById('more-actions-toggle');
  const setActionsOpen = (open) => {
    if (!actions || !actionsToggle) return;
    actions.classList.toggle('menu-open', open);
    actionsToggle.setAttribute('aria-expanded', String(open));
  };
  if (actions && actionsToggle) {
    doc.documentElement.classList.add('globe-actions-menu');
    // The language switch shows two letters where the others show a glyph.
    const localeSwitch = doc.getElementById('locale-switch');
    if (localeSwitch) localeSwitch.dataset.shellCode = localeSwitch.textContent.trim();
    listen(actionsToggle, 'click', () => {
      const open = !actions.classList.contains('menu-open');
      setAppearanceOpen(false);
      setActionsOpen(open);
      if (open) actions.querySelector('button:not([hidden])')?.focus();
    });
    // An action ran: the menu has done its job.
    listen(actions, 'click', (event) => {
      if (event.target?.closest?.('button')) setActionsOpen(false);
    });
    listen(actions, 'keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setActionsOpen(false);
      actionsToggle.focus();
    });
  }

  // ── « Apparence » ─────────────────────────────────────────────────────────
  const appearanceToggle = doc.getElementById('appearance-toggle');
  const stylesSection = doc.getElementById('appearance-styles');
  const baseMapSection = doc.getElementById('appearance-base-map');
  const advanced = doc.getElementById('appearance-advanced');
  const styleButtons = doc.getElementById('style-buttons');
  const mapSource = doc.querySelector('.map-source-section');
  const ppToggles = doc.getElementById('pp-toggles');
  if (stylesSection && styleButtons) {
    styleButtons.classList.add('appearance-style-grid');
    stylesSection.append(styleButtons);
    styleButtons.querySelectorAll('.style-btn').forEach((button) => {
      const preview = doc.createElement('span');
      preview.className = 'style-preview';
      preview.setAttribute('aria-hidden', 'true');
      const check = doc.createElement('span');
      check.className = 'style-preview-check shell-icon';
      check.dataset.shellIcon = 'check';
      preview.append(check);
      button.prepend(preview);
    });
  }
  // The style's own parameters (NVG gain, FLIR palette…) sit right under the
  // previews, where choosing the style shows them. The cockpit borrows this
  // panel through a comment anchor left just before it (ui.js
  // `_initCockpitDisplayPortal`), so the anchor moves with it.
  const sliderPanel = doc.getElementById('param-slider-panel');
  if (stylesSection && sliderPanel) {
    const anchor = sliderPanel.previousSibling;
    const isPortalAnchor = anchor?.nodeType === 8 && String(anchor.data).startsWith('cockpit-display-home:');
    if (isPortalAnchor) stylesSection.append(anchor);
    stylesSection.append(sliderPanel);
  }
  if (baseMapSection && mapSource) baseMapSection.append(mapSource);
  if (advanced && ppToggles) {
    advanced.append(ppToggles);
    ppToggles.classList.add('in-appearance');
  }

  let previewTakenAt = -Infinity;
  const capturePreview = () => {
    const scene = viewer?.scene;
    const canvas = scene?.canvas;
    if (!scene?.postRender?.addEventListener || !canvas || !styleButtons) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - previewTakenAt < STYLE_PREVIEW_REUSE_MS) return;
    // The drawing buffer is only readable in the task that rendered it (the
    // viewer does not preserve it), so the copy is taken in postRender.
    const remove = scene.postRender.addEventListener(() => {
      remove();
      const size = stylePreviewSize(canvas.width, canvas.height);
      if (!size) return;
      try {
        const copy = doc.createElement('canvas');
        copy.width = size.width;
        copy.height = size.height;
        const ctx = copy.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(canvas, 0, 0, size.width, size.height);
        const url = copy.toDataURL('image/jpeg', 0.72);
        styleButtons.style.setProperty('--style-preview-image', `url("${url}")`);
        styleButtons.classList.add('has-preview');
        previewTakenAt = now;
      } catch {
        // A tainted or lost canvas: the previews keep their plain swatch.
      }
    });
    scene.requestRender?.();
  };

  const setAppearanceOpen = (open) => {
    if (panel.hidden === !open) return;
    panel.hidden = !open;
    appearanceToggle?.setAttribute('aria-expanded', String(open));
    appearanceToggle?.classList.toggle('active', open);
    if (open) {
      setActionsOpen(false);
      capturePreview();
    }
  };
  listen(appearanceToggle, 'click', () => setAppearanceOpen(panel.hidden));
  listen(doc.getElementById('appearance-close'), 'click', () => {
    setAppearanceOpen(false);
    appearanceToggle?.focus();
  });
  listen(panel, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setAppearanceOpen(false);
    appearanceToggle?.focus();
  });

  // The two switches drive the buttons that already own these states (the HUD,
  // H; the clean view, V), and follow them whichever way they change.
  panel.querySelectorAll('.appearance-switch[data-mirror]').forEach((button) => {
    const source = doc.getElementById(button.dataset.mirror);
    if (!source) return;
    const sync = () => button.setAttribute('aria-checked', String(source.classList.contains('active')));
    listen(button, 'click', () => {
      source.click();
      // The clean view hides this panel with the rest: close it rather than
      // leave focus inside something invisible.
      if (source.id === 'clean-view-toggle' && source.classList.contains('active')) setAppearanceOpen(false);
    });
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(sync);
      observer.observe(source, { attributes: true, attributeFilter: ['class'] });
      cleanups.push(() => observer.disconnect());
    }
    sync();
  });

  // One outside press closes whichever menu is open: what a reader does after
  // choosing is look at the map.
  listen(doc, 'pointerdown', (event) => {
    const target = event.target;
    if (!panel.hidden && !panel.contains(target) && !appearanceToggle?.contains(target)) {
      setAppearanceOpen(false);
    }
    if (actions?.classList.contains('menu-open')
      && !actions.contains(target) && !actionsToggle?.contains(target)) {
      setActionsOpen(false);
    }
    if (!menu.hidden && !placeSearch.contains(target)) setMenuOpen(false);
  }, true);

  listen(doc, 'keydown', (event) => {
    if (!isPlaceSearchShortcut(event, { apple, typing: isTypingTarget(doc.activeElement) })) return;
    if (doc.body?.classList.contains('cockpit-mode')) return;
    event.preventDefault();
    openPlaceSearch();
  });

  paintShellIcons(doc);
  topBar.hidden = false;
  doc.documentElement.classList.add('globe-shell');

  /**
   * Open where an adopted panel's contents went, for a caller that names the
   * panel (ui.js `setPanelCollapsed`, the voice surface's set_panel_open).
   * @param {string} panelId
   */
  const openAdopted = (panelId) => {
    if (panelId === 'location-bar') {
      openPlaceSearch();
      return;
    }
    setAppearanceOpen(true);
    if (panelId === 'pp-toggles' && advanced) advanced.open = true;
  };

  return {
    openPlaceSearch,
    openAdopted,
    setAppearanceOpen,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
