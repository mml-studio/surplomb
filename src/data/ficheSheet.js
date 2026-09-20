/**
 * @module data/ficheSheet
 *
 * **La porte vers la radiographie** — the one thing that was missing between
 * the globe and `fiche.html`.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 *
 * This repository has two surfaces that answer the same question about the
 * same door, and until now no link between them:
 *
 *   · the globe's `Fiche implantation` card, capped at SIX LINES
 *     (`createAddressScanOverlayEntry`, `.slice(0, 6)`) — the right cap for a
 *     label pinned on a doorway, and hopeless for ten themes;
 *   · `fiche.html`, the address radiography: seventeen routes, ten themes, sixty
 *     rows, printable, embeddable, and reachable ONLY by typing its URL.
 *
 * The second was written for the first and nothing pointed at it. A reader who
 * clicked a door on the globe read six lines and had no way to learn that the
 * other fifty-four existed. That is not a missing layer — every byte of the
 * sheet is already served — it is a missing DOOR.
 *
 * ── Why an iframe, and why that is not a shortcut ───────────────────────────
 *
 * `fiche.html` is a page with no Cesium in it, by explicit decision recorded in
 * its own header and enforced by `CESIUM_FREE_PAGES` in `vite.config.js`. It
 * takes `?embed=1` — a mode it has ALREADY SHIPPED, which strips the masthead
 * form and the print button — precisely so it can be framed. Re-implementing
 * its sixty rows inside the globe bundle would mean two renderers for one
 * document, and the second would be the one nobody prints.
 *
 * So the panel frames the page the app already builds and serves, at the point
 * the globe is already scanning. Same origin, same session, same server cache:
 * the seventeen routes behind the sheet are the routes the globe's own layers
 * warmed a moment earlier.
 *
 * ── Why the panel mounts itself ─────────────────────────────────────────────
 *
 * Same idiom, and the same reason, as `veloPulseHud.js`: it exists only while
 * somebody asked for it, and it costs `index.html` nothing for the thirty-odd
 * layers that never open it. It is draggable through the shared
 * `panelDrag.js`, so it saves its own position under its own key.
 *
 * ── What it never does ──────────────────────────────────────────────────────
 *
 * It does not fetch. It does not compose. It does not decide what the sheet
 * says — `adresseRadiographie.js` does, and it is unit-tested against captured
 * payloads. Everything here is a frame, a title and three buttons.
 */

import { isPhoneShell } from '../inputMode.js';
import {
  attachPanelDrag,
  clearPanelPosition,
  restorePanelPosition,
} from '../panelDrag.js';
import { DEFAULT_LOCALE, getLocale } from '../i18n/locale.js';
import messages from './ficheSheet.i18n.js';

export const FICHE_SHEET_ID = 'fiche-sheet';

/** Where the sheet lives. Same origin — this is the app's own second page. */
export const FICHE_SHEET_PATH = '/fiche.html';

/**
 * The URL the frame loads.
 *
 * `embed=1` is what `fiche.js` reads to drop the lookup form and the print
 * button (`document.body.classList.add('embed')`); the panel supplies both of
 * those itself, in its own head, where they belong when the sheet is a panel
 * rather than a page.
 *
 * Coordinates are printed at six decimals — about 11 cm — which is finer than
 * any register behind the sheet resolves and short enough to stay readable in
 * a URL a reader may copy out of the "open in a tab" button.
 *
 * THE LANGUAGE TRAVELS WITH THE POINT. `fiche.html` runs its own copy of the
 * locale gate, which reads `?lang=` before the stored choice, so a globe
 * showing English frames an English sheet whatever the browser remembers.
 * Nothing is added in French: French is the default of both gates, and a URL
 * that says so would only be longer — and would move the string every test
 * and every share link pins.
 *
 * @param {{lat: number, lon: number}} point
 * @param {{embed?: boolean, locale?: string}} [options] `locale` defaults to
 *   the page's; pass it explicitly from a test.
 * @returns {string|null} URL, or null when the point is not a point.
 */
export function ficheSheetUrl(point, { embed = true, locale = null } = {}) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const params = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6) });
  if (embed) params.set('embed', '1');
  if (locale && locale !== DEFAULT_LOCALE) params.set('lang', locale);
  return `${FICHE_SHEET_PATH}?${params.toString()}`;
}

/**
 * The coordinate line under the title.
 * @param {{lat: number, lon: number}} point
 * @returns {string}
 */
export function ficheSheetCoords(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/**
 * The panel's own head, built when it mounts.
 *
 * A function and not a constant: the messages are read at CALL time, which is
 * the rule that lets one page be French and the next English without the
 * module being reloaded (docs/i18n/CONVENTIONS.md § 2).
 * @returns {string}
 */
function panelMarkup() {
  const m = messages();
  return `
  <div class="fiche-sheet-head" data-fiche-grip
       title="${m.head.dragTitle}">
    <span class="fiche-sheet-grip" aria-hidden="true"></span>
    <span class="fiche-sheet-title">${m.head.title}</span>
    <span class="fiche-sheet-coords" data-fiche-coords></span>
    <span class="fiche-sheet-actions">
      <a class="fiche-sheet-btn" data-fiche-open target="_blank" rel="noopener"
         title="${m.head.openTitle}">${m.head.open}</a>
      <button type="button" class="fiche-sheet-btn" data-fiche-print
              title="${m.head.printTitle}">${m.head.print}</button>
      <button type="button" class="fiche-sheet-btn fiche-sheet-close" data-fiche-close
              aria-label="${m.head.close}">×</button>
    </span>
  </div>
  <iframe class="fiche-sheet-frame" data-fiche-frame title="${m.label}"
          referrerpolicy="same-origin"></iframe>
`;
}

/** @returns {boolean} Whether there is a document to mount into. */
function canMount() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Mount the sheet panel, or return the one already mounted.
 *
 * A single instance by construction: the sheet is about ONE point at a time,
 * and two frames of the same page would double seventeen requests to say the
 * same thing twice.
 *
 * @param {{onClose?: () => void}} [handlers]
 * @returns {{show: (point: object, title?: string) => boolean, hide: () => void,
 *   destroy: () => void, element: object}|null} Controller, or null with no DOM.
 */
export function mountFicheSheet({ onClose = null } = {}) {
  if (!canMount()) return null;
  const existing = document.getElementById(FICHE_SHEET_ID);
  if (existing) existing.remove();

  const panel = document.createElement('aside');
  panel.id = FICHE_SHEET_ID;
  panel.className = 'fiche-sheet';
  panel.setAttribute('aria-label', messages().label);
  panel.hidden = true;
  panel.innerHTML = panelMarkup();
  (document.getElementById('cesiumContainer') || document.body).appendChild(panel);

  const node = (selector) => panel.querySelector(selector);
  const frame = node('[data-fiche-frame]');
  const coords = node('[data-fiche-coords]');
  const openLink = node('[data-fiche-open]');

  let current = null;

  const hide = () => {
    panel.hidden = true;
    // The frame is emptied, not merely hidden: an iframe left pointed at the
    // sheet keeps its seventeen requests alive and its timers running behind a
    // panel nobody is reading.
    if (frame) frame.removeAttribute('src');
    current = null;
  };

  node('[data-fiche-close]')?.addEventListener('click', () => {
    hide();
    onClose?.();
  });

  node('[data-fiche-print]')?.addEventListener('click', () => {
    // Printing the FRAME, not the app: `window.print()` here would paper over
    // the globe. Same origin, so the frame's own `contentWindow` is reachable;
    // a browser that refuses it falls back to the tab, which prints correctly
    // because that is what the page was written for.
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    } catch {
      const href = openLink?.getAttribute?.('href');
      if (href) window.open(href, '_blank', 'noopener');
    }
  });

  // The HEAD is the grab surface here, not the whole panel: the body is an
  // iframe a reader scrolls and selects text in, and a drag that started on a
  // paragraph would make the sheet unreadable. `velo-pulse-hud` makes the
  // opposite call for the opposite reason — it has no scrollable body.
  //
  // NOT ON A PHONE. `panelDrag.js` writes inline `left`/`top` on the element —
  // and an inline style beats every rule in `phone.css`, including the one that
  // anchors this sheet to the bottom edge at full height. A restored position
  // from a desktop session would land it half off a 390 px screen with no way
  // back except the double-click this shell cannot produce. There is also
  // nowhere to drag it TO: it already owns the viewport.
  const phone = isPhoneShell();
  let detachDrag = null;
  if (!phone) {
    panel.classList.add('panel-draggable');
    restorePanelPosition(panel, FICHE_SHEET_ID);
    // A panel dragged somewhere unfortunate has to have a way home that does
    // not involve clearing site data. Two gestures for the one verb: a cursor
    // double-clicks the grip, and a coarse pointer that still gets this shell —
    // a tablet — holds it for half a second, because it has no double-click.
    const resetPosition = () => {
      clearPanelPosition(FICHE_SHEET_ID);
      for (const property of ['left', 'top', 'right', 'bottom', 'transform']) {
        panel.style.removeProperty(property);
      }
    };
    detachDrag = attachPanelDrag(panel, {
      panelId: FICHE_SHEET_ID,
      handle: node('[data-fiche-grip]'),
      onLongPress: resetPosition,
    });
    node('[data-fiche-grip]')?.addEventListener('dblclick', resetPosition);
  }

  return {
    element: panel,
    /**
     * Point the sheet at a place.
     * @param {{lat: number, lon: number}} point
     * @param {string} [label] What the reader clicked, printed beside the coords.
     * @returns {boolean} False when the point is not a point — nothing opens.
     */
    show(point, label = '') {
      // The frame inherits the globe's language (see `ficheSheetUrl`), and so
      // does the tab link: a reader who opens the sheet whole must not land
      // on the other language.
      const locale = getLocale();
      const url = ficheSheetUrl(point, { locale });
      if (!url) return false;
      const embedded = ficheSheetUrl(point, { embed: false, locale });
      // `setAttribute`, not `.href =`: the property form resolves against the
      // document base and reads back absolute, so a test — and anything else
      // comparing what was asked for — would never see the string this module
      // built.
      if (openLink && embedded) openLink.setAttribute('href', embedded);
      if (coords) {
        coords.textContent = [label, ficheSheetCoords(point)].filter(Boolean).join(' · ');
      }
      // Re-pointing at the SAME place is a no-op rather than a reload: the
      // chip is one click away from the row and a second press must not throw
      // seventeen requests at the server to redraw what is already on screen.
      if (frame && frame.getAttribute('src') !== url) frame.setAttribute('src', url);
      panel.hidden = false;
      current = { ...point };
      return true;
    },
    hide,
    /** @returns {?object} The point the sheet is currently showing. */
    point() { return current ? { ...current } : null; },
    destroy() {
      detachDrag?.();
      panel.remove();
      current = null;
    },
  };
}
