/**
 * The bottom sheet a phone gets instead of ten floating panels.
 *
 * ── WHY ADOPTION AND NOT A SECOND UI ────────────────────────────────────────
 *
 * The four things a phone reader needs — search a place, switch a layer on,
 * read the key, read what they just tapped — already exist as four panels with
 * their own state, their own live updates and their own event wiring. A phone
 * version of any of them would be a SECOND implementation of the same feature,
 * and the two would drift on the first change to either. So this module moves
 * the real nodes into the sheet, exactly as `ui.js` already portals
 * `#pp-toggles` into the right rail, and `phone.css` flattens what they arrive
 * carrying (a fixed position, a backdrop, a scroller, a collapsed state).
 *
 * The cost is stated plainly: adoption is for the SESSION. A reader who could
 * somehow leave the phone shell mid-session would find four empty rails. Since
 * `src/inputMode.js` resolves the shell once, from `min(width, height)`, and a
 * rotation cannot change it, that is a shape the app cannot reach — and it is
 * in `docs/KNOWN-ISSUES.md` rather than defended against with code nothing
 * would ever run.
 *
 * ── WHY THE HEIGHT IS A CUSTOM PROPERTY ─────────────────────────────────────
 *
 * Four surfaces float above the sheet: the toast, the zoom prompt, the pulse
 * HUD and the voice pill. Each needs to know where its floor is, and the floor
 * moves — three snaps, a drag, and a soft keyboard. `--phone-sheet-height` on
 * `<html>`, written in pixels after every change, is the one number all five
 * read. A percentage would have been wrong for all four the moment the keyboard
 * opened.
 *
 * @module phoneSheet
 */

import { isPhoneShell } from './inputMode.js';
import { onWorldOverlaySelectionChange } from './overlays/worldOverlay.js';
import { renderPhoneSelection } from './phoneSelection.js';
import {
  PHONE_FEATURED_LAYER_IDS,
  PHONE_HEAVY_LAYER_IDS,
  PHONE_SHEET_PEEK_PX,
  phoneSheetKeyboardInset,
  phoneSheetSnapHeights,
  resolvePhoneSheetSnap,
} from './phoneSheetLayout.js';

/** Which panel lands in which tab. Order is the order of the tabs. */
const ADOPTIONS = [
  { id: 'location-bar', tab: 'search' },
  { id: 'data-panel', tab: 'layers' },
  { id: 'map-legend', tab: 'legend' },
  { id: 'global-context-panel', tab: 'selection' },
];

/** Travel under which a pointer gesture on the grip is a TAP, not a drag. */
const TAP_TRAVEL_PX = 6;

/** What the « LOURD » badge says when a reader holds it. */
const HEAVY_TITLE = 'Couche lourde : beaucoup d’objets à dessiner. Sur un téléphone, '
  + 'attendez-vous à un chargement plus long et à une carte moins fluide.';

let _controller = null;

/** @returns {number} Pixels the top bar owns, measured, with a sane default. */
function measureTopInset() {
  const actions = document.getElementById('top-center-actions');
  const rect = actions?.getBoundingClientRect?.();
  if (rect && rect.height > 0) return Math.round(rect.bottom + 8);
  return 64;
}

/**
 * Build the sheet, move the panels into it, and wire the gestures.
 *
 * Returns null — immediately, before touching the DOM — on anything that is not
 * a phone. That early return is the whole desktop story: the markup in
 * `index.html` stays `hidden`, `phone.css` matches nothing, and the four panels
 * are where they have always been.
 *
 * @param {{dataManager?: object}} [options]
 * @returns {{snapTo: Function, getSnap: Function, selectTab: Function,
 *   destroy: Function}|null}
 */
export function initPhoneSheet({ dataManager = null } = {}) {
  if (!isPhoneShell()) return null;
  if (_controller) return _controller;
  const sheet = document.getElementById('phone-sheet');
  if (!sheet) return null;

  const root = document.documentElement;
  const grip = sheet.querySelector('[data-phone-grip]');
  const tabStrip = sheet.querySelector('.phone-sheet-tabs');
  const tabButtons = [...sheet.querySelectorAll('[data-phone-tab-btn]')];
  const panels = [...sheet.querySelectorAll('[data-phone-tab]')];
  const creditHost = sheet.querySelector('[data-phone-credits]');
  const selectionHost = sheet.querySelector('#phone-selection');
  const cleanups = [];

  // ── Adoption ──────────────────────────────────────────────────────────────
  for (const { id, tab } of ADOPTIONS) {
    const node = document.getElementById(id);
    const host = sheet.querySelector(`[data-phone-tab="${tab}"]`);
    if (!node || !host) continue;
    host.appendChild(node);
    // The collapsed class is removed from the DOM but NOT from storage: it is
    // the reader's desktop preference, and a phone session has no business
    // rewriting it. `phone.css` also forces the toggle list open, because the
    // panel's own collapse button can put the class back and there is no
    // visible header left on which to press it again.
    node.classList.remove('collapsed');
  }

  const credits = document.getElementById('cesium-credits');
  // Google's and Cesium's terms require the attribution to be visible while
  // their content is. In the sheet it is visible at ALL THREE snaps; left where
  // it was, the sheet would have covered it at two of them.
  if (credits && creditHost) creditHost.appendChild(credits);

  // « Tout éteindre » moves out of the top-right corner — the worst place on a
  // phone for a thumb — and becomes the first row of the tab it acts on.
  const clearBtn = document.getElementById('clear-selected-layers');
  const layersPanel = sheet.querySelector('[data-phone-tab="layers"]');
  if (clearBtn && layersPanel) {
    const label = document.createElement('span');
    label.className = 'phone-action-label';
    label.textContent = 'TOUT ÉTEINDRE';
    clearBtn.appendChild(label);
    clearBtn.classList.add('phone-sheet-action');
    layersPanel.insertBefore(clearBtn, layersPanel.firstChild);
  }

  sheet.hidden = false;

  // ── Snaps ─────────────────────────────────────────────────────────────────
  let snap = 'peek';
  let dismissedSelection = false;

  const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight;

  /**
   * `peek` is MEASURED, not assumed.
   *
   * The resting height has one job — show the grip, the credit line and four
   * tabs — and two of those three are content nobody here controls: the
   * attribution wraps onto a second line at 390 px and not at 430, and it grows
   * a line for every data source that registers a credit. A constant was four
   * pixels short of the tabs on an iPhone 13 the first time this ran, which is
   * a tab strip nobody can press. `PHONE_SHEET_PEEK_PX` stays as the floor for
   * the frame before the browser has laid any of it out.
   */
  const measurePeek = () => {
    const chrome = [grip, creditHost, tabStrip]
      .reduce((total, node) => total + (node?.offsetHeight || 0), 0);
    return chrome > 0 ? Math.max(PHONE_SHEET_PEEK_PX, Math.ceil(chrome)) : PHONE_SHEET_PEEK_PX;
  };

  const snaps = () => phoneSheetSnapHeights({
    viewportHeight: viewportHeight(),
    topInset: measureTopInset(),
    peekPx: measurePeek(),
  });

  const writeHeight = (px) => {
    root.style.setProperty('--phone-sheet-height', `${Math.round(px)}px`);
  };

  const snapTo = (name) => {
    const heights = snaps();
    const target = Number.isFinite(heights[name]) ? name : 'peek';
    snap = target;
    sheet.dataset.snap = target;
    writeHeight(heights[target]);
    return target;
  };

  // ── The viewport, and the keyboard inside it ──────────────────────────────
  const syncViewport = () => {
    root.style.setProperty('--phone-vv-height', `${Math.round(viewportHeight())}px`);
    root.style.setProperty('--phone-top-safe', `${measureTopInset()}px`);
    const keyboard = phoneSheetKeyboardInset({
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
    });
    // A keyboard means the reader is typing into the search field, which lives
    // in this sheet: anything less than `full` and the field they are typing in
    // is behind the keyboard they are typing on.
    snapTo(keyboard > 0 ? 'full' : snap);
  };

  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
    cleanups.push(() => {
      viewport.removeEventListener('resize', syncViewport);
      viewport.removeEventListener('scroll', syncViewport);
    });
  }
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
  cleanups.push(() => {
    window.removeEventListener('resize', syncViewport);
    window.removeEventListener('orientationchange', syncViewport);
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const selectTab = (name) => {
    for (const button of tabButtons) {
      const active = button.dataset.phoneTabBtn === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.phoneTab !== name;
    // Opening a tab at `peek` shows a tab strip and nothing under it. Anyone
    // who presses a tab is asking to see its contents.
    if (snap === 'peek') snapTo('half');
    return name;
  };
  for (const button of tabButtons) {
    const handler = () => selectTab(button.dataset.phoneTabBtn);
    button.addEventListener('click', handler);
    cleanups.push(() => button.removeEventListener('click', handler));
  }

  // ── The grip ──────────────────────────────────────────────────────────────
  //
  // `pointerdown` and not `touchstart`: the same handler then serves a finger,
  // a stylus and the mouse a QA run drives it with. The grip is the only
  // element on the page with `touch-action: none` — without it the browser
  // claims a vertical drag for scrolling before the second `pointermove` ever
  // fires, and the sheet simply refuses to move.
  let drag = null;

  const beginDrag = (event, { tapCycles }) => {
    if (!event.isPrimary || drag) return;
    const height = sheet.getBoundingClientRect().height;
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      startHeight: height,
      height,
      velocity: 0,
      travel: 0,
      tapCycles,
    };
    sheet.dataset.dragging = '';
    // A synthetic PointerEvent — which is what every harness dispatches — has
    // no active pointer to capture, and Chrome throws rather than ignoring it.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* no live pointer */ }
  };

  const moveDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const heights = snaps();
    const raw = drag.startHeight + (drag.startY - event.clientY);
    const next = Math.min(heights.full, Math.max(heights.peek, raw));
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocity = (next - drag.height) / dt;
    drag.travel = Math.max(drag.travel, Math.abs(event.clientY - drag.startY));
    drag.height = next;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    writeHeight(next);
    event.preventDefault();
  };

  const endDrag = (event) => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const finished = drag;
    drag = null;
    delete sheet.dataset.dragging;
    if (finished.travel < TAP_TRAVEL_PX) {
      // A press that did not travel is a tap. On the grip that is the cheapest
      // way to open the sheet; on the tab strip the tab's own click handler
      // owns the gesture and this must not fight it.
      if (finished.tapCycles) snapTo(snap === 'peek' ? 'half' : 'peek');
      else writeHeight(snaps()[snap]);
      return;
    }
    snapTo(resolvePhoneSheetSnap({
      height: finished.height,
      velocity: finished.velocity,
      snaps: snaps(),
    }));
  };

  for (const [surface, tapCycles] of [[grip, true], [tabStrip, false]]) {
    if (!surface) continue;
    const down = (event) => beginDrag(event, { tapCycles });
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', moveDrag);
    surface.addEventListener('pointerup', endDrag);
    surface.addEventListener('pointercancel', endDrag);
    cleanups.push(() => {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', moveDrag);
      surface.removeEventListener('pointerup', endDrag);
      surface.removeEventListener('pointercancel', endDrag);
    });
  }

  // ── The selection, mirrored as DOM ────────────────────────────────────────
  //
  // The cards themselves are built by `src/phoneSelection.js`, which takes its
  // host as an argument and imports nothing: it is the only part of this shell
  // that no browser harness can reach, because nothing selects anything under
  // Puppeteer.
  const renderSelection = (items) => renderPhoneSelection(selectionHost, items, {
    onDismiss: () => {
      dismissedSelection = true;
      snapTo('peek');
    },
  });

  const unsubscribeSelection = onWorldOverlaySelectionChange((items) => {
    renderSelection(items);
    if (!items.length) {
      dismissedSelection = false;
      return;
    }
    if (dismissedSelection) return;
    selectTab('selection');
    if (snap === 'peek') snapTo('half');
  });
  cleanups.push(unsubscribeSelection);

  // ── « À LA UNE » and « LOURD » ────────────────────────────────────────────
  dataManager?.setPanelFeaturedLayers?.(PHONE_FEATURED_LAYER_IDS);

  const toggleContainer = document.getElementById('data-toggles');
  const heavy = new Set(PHONE_HEAVY_LAYER_IDS);
  const decorateHeavyRows = () => {
    if (!toggleContainer) return;
    for (const id of heavy) {
      const row = toggleContainer.querySelector(`[data-layer-id="${CSS.escape(id)}"]`);
      const left = row?.querySelector('.data-toggle-left');
      if (!left || left.querySelector('.data-scope-chip.is-heavy')) continue;
      const chip = document.createElement('span');
      chip.className = 'data-scope-chip is-heavy';
      chip.textContent = 'LOURD';
      chip.title = HEAVY_TITLE;
      left.appendChild(chip);
    }
  };
  // A DECORATION, RE-APPLIED. `_renderToggles()` rebuilds the whole list from
  // scratch on at least four occasions (registration, seal, a dataset plugged,
  // the featured group above), and each rebuild throws these badges away. An
  // observer is what survives all four without the manager having to know this
  // module exists.
  let rowObserver = null;
  if (toggleContainer && typeof MutationObserver === 'function') {
    rowObserver = new MutationObserver(decorateHeavyRows);
    rowObserver.observe(toggleContainer, { childList: true, subtree: true });
    cleanups.push(() => rowObserver.disconnect());
  }
  decorateHeavyRows();

  // ── The fiche, which is taller than the sheet ─────────────────────────────
  //
  // `src/data/ficheSheet.js` mounts one panel into `#cesiumContainer` and
  // toggles it with `hidden`. On a phone it covers the viewport, so the sheet
  // gets out of the way rather than stacking two sheets on one screen.
  const cesiumContainer = document.getElementById('cesiumContainer');
  if (cesiumContainer && typeof MutationObserver === 'function') {
    const ficheObserver = new MutationObserver(() => {
      const open = cesiumContainer.querySelector('.fiche-sheet:not([hidden])');
      if (open && snap !== 'peek') snapTo('peek');
    });
    ficheObserver.observe(cesiumContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    cleanups.push(() => ficheObserver.disconnect());
  }

  syncViewport();
  selectTab('layers');
  snapTo('peek');

  _controller = {
    snapTo,
    getSnap: () => snap,
    selectTab,
    element: sheet,
    destroy() {
      for (const cleanup of cleanups) {
        try { cleanup(); } catch { /* teardown is best-effort */ }
      }
      cleanups.length = 0;
      _controller = null;
    },
  };
  return _controller;
}

/** Test seam: forget the mounted controller without tearing the DOM down. */
export function resetPhoneSheetForTests() {
  _controller = null;
}
