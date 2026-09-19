/**
 * The arithmetic of the phone sheet, with no DOM in sight.
 *
 * Everything here is a pure function of numbers a caller measured, for the same
 * reason `panelStackLayout.js` exists beside `ui.js`: the three heights a sheet
 * can rest at, and the rule that picks one after a drag, are decisions worth
 * asserting on, and they are unreachable from a test the moment they live
 * inside a `pointermove` handler.
 *
 * @module phoneSheetLayout
 */

/**
 * The resting height, in CSS pixels, and it is PIXELS ON PURPOSE.
 *
 * `peek` has one job: be a handle, a credit line and four tabs that a thumb can
 * hit. That is a fixed stack of chrome — 28 px of grip, ~26 of credits, 48 of
 * tabs, plus the home-indicator inset — so it costs the same number of pixels
 * on every handset. Expressed as a percentage it would have been 13 % of a
 * portrait phone (fine) and 13 % of the same phone turned sideways, which is
 * 50 px and three unreachable tabs.
 */
export const PHONE_SHEET_PEEK_PX = 116;

/**
 * Below this viewport height the sheet is in a landscape phone and `half`
 * grows. At 390 px of height, 50 % is 195 px — about two layer rows and their
 * group header, which is a list that cannot be read without being resized
 * first. 65 % leaves the globe a usable band and the list four rows.
 */
export const PHONE_LANDSCAPE_MAX_HEIGHT_PX = 500;

/**
 * How far the viewport has to shrink before it counts as a keyboard.
 *
 * Under 100 px the shrink is the URL bar collapsing, an iOS accessory bar, or a
 * rounding difference between `innerHeight` and `visualViewport.height` — none
 * of which should throw the sheet to full height. Every soft keyboard is
 * comfortably above it (the shortest, iOS landscape, is ~160 px).
 */
export const PHONE_KEYBOARD_MIN_INSET_PX = 100;

/**
 * Past this speed, a drag is a FLICK and its direction outranks where it
 * happened to stop. In px of sheet height per millisecond: 0.5 is 500 px/s,
 * which is a deliberate throw rather than a slow reposition.
 */
export const PHONE_SHEET_FLICK_VELOCITY = 0.5;

/** The eight layers a phone reader is offered first. See `PHONE_FEATURED_LAYER_IDS`. */
const FEATURED = [
  'flights',
  'traffic',
  'transit-fr',
  'bikeshare',
  'irve-fr',
  // `meteofrance-vigilance` and NOT `meteo-stations-fr`, which is what this
  // list said first and what has no row: the stations are a CHIP on the
  // vigilance row (`layerFusions.js`), and a featured id that names a fused
  // companion is an id the panel silently drops. The test below is the guard.
  'meteofrance-vigilance',
  'schools-fr',
  'dvf-sales',
];

/**
 * « À LA UNE » — what a phone offers before the seven groups.
 *
 * THE RULE THAT PICKED THEM: live, national, and legible at 390 px. Live,
 * because a static layer on a phone is a map nobody came for; national, because
 * a phone reader arrives at their own street and a Paris-only layer would be an
 * empty screen; legible, because a 60-layer accordion is not a menu, it is an
 * inventory, and the first screen of a phone has room for one decision.
 *
 * Eight and not ten: eight rows at 52 px is 416 px, which is exactly one
 * `half` snap on a 844 px handset. The ninth row would be the one nobody
 * scrolls to and everybody has to scroll past.
 */
export const PHONE_FEATURED_LAYER_IDS = Object.freeze([...FEATURED]);

/**
 * What the chip under the search bar calls each featured layer.
 *
 * A chip is read at a glance while a thumb scrolls past it, so it gets one or
 * two words — « Vélos et véhicules partagés » is a row title, not a chip. A
 * layer with no entry here (a row switched on from the full list) falls back
 * to its row label, which the chip truncates.
 */
export const PHONE_LAYER_CHIP_LABELS = Object.freeze({
  flights: 'Vols',
  traffic: 'Trafic',
  'transit-fr': 'Transports',
  bikeshare: 'Vélos',
  'irve-fr': 'Recharge',
  'meteofrance-vigilance': 'Météo',
  'schools-fr': 'Écoles',
  'dvf-sales': 'Prix immo',
});

/**
 * The layers that cost a handset noticeably more than the others, badged
 * « LOURD » in the panel.
 *
 * A FIXED LIST, AND WHY IT HAS TO BE. There is no per-layer cost to read:
 * `profileCountBudget` is a DIVISOR applied to a layer's own cap, so two layers
 * with the same budget can differ by a factor of fifty in what they actually
 * draw. What is listed here is measured behaviour — tens of thousands of
 * primitives, a full-scene mesh, or a tile pyramid — not a number the code
 * knows. Adding a layer to this list is a judgement; leaving one off costs a
 * reader a stalled tab, so err towards listing it.
 */
export const PHONE_HEAVY_LAYER_IDS = Object.freeze([
  'satellites',
  'bdtopo-buildings',
  'power-grid',
  'filosofi-fr',
  'cadastre-fr',
  'ais-live-vessels',
  // `telegeography-submarine-cables` is NOT here, and it is the heaviest thing
  // on the list. It has no row of its own — it is a chip on `local-datacenters`
  // — so the badge would have landed on the data-centre row and warned a reader
  // about the wrong dataset. A badge that names the wrong subject is worse than
  // no badge: it teaches the reader to ignore the badge.
]);

/**
 * The three heights this sheet rests at, for one viewport.
 *
 * @param {object} options
 * @param {number} options.viewportHeight - Usable height in CSS px
 *   (`visualViewport.height` when there is one, `innerHeight` otherwise).
 * @param {number} [options.topInset] - Pixels the top bar owns; `full` stops
 *   below it, so the logo and the three actions are never covered.
 * @param {number} [options.peekPx] - Override for {@link PHONE_SHEET_PEEK_PX}.
 * @returns {{peek: number, half: number, full: number}} Ascending, always.
 */
export function phoneSheetSnapHeights({
  viewportHeight,
  topInset = 64,
  peekPx = PHONE_SHEET_PEEK_PX,
} = {}) {
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const inset = Number.isFinite(topInset) ? Math.max(0, topInset) : 0;
  const full = Math.max(0, Math.round(height - inset));
  const peek = Math.min(Math.round(peekPx), full);
  const halfRatio = height > 0 && height < PHONE_LANDSCAPE_MAX_HEIGHT_PX ? 0.65 : 0.5;
  // Clamped between its neighbours rather than trusted: a very short viewport
  // can put 50 % of the height BELOW the peek chrome, and a `half` smaller than
  // `peek` would make the middle snap a way of shrinking the sheet by dragging
  // it up.
  const half = Math.min(full, Math.max(peek, Math.round(height * halfRatio)));
  return { peek, half, full };
}

/**
 * Where a drag ends up.
 *
 * Nearest snap, unless the gesture was a flick — in which case the direction it
 * was thrown wins over the pixel it was released at. Without that clause a fast
 * upward throw that let go at 40 % of the screen would settle BACK to `peek`,
 * which reads as the sheet refusing the gesture.
 *
 * @param {object} options
 * @param {number} options.height - Sheet height at release, in px.
 * @param {number} [options.velocity] - Height change in px/ms; positive is
 *   growing (finger moving up the screen).
 * @param {{peek: number, half: number, full: number}} options.snaps
 * @returns {'peek'|'half'|'full'}
 */
export function resolvePhoneSheetSnap({ height, velocity = 0, snaps }) {
  const order = ['peek', 'half', 'full'];
  const values = order.map((name) => ({ name, value: Number(snaps?.[name]) }))
    .filter((entry) => Number.isFinite(entry.value));
  if (!values.length) return 'peek';
  const current = Number.isFinite(height) ? height : 0;
  let nearest = values[0];
  for (const entry of values) {
    if (Math.abs(entry.value - current) < Math.abs(nearest.value - current)) nearest = entry;
  }
  const speed = Number.isFinite(velocity) ? velocity : 0;
  if (Math.abs(speed) < PHONE_SHEET_FLICK_VELOCITY) return nearest.name;
  // A flick moves at least one snap in its own direction from where the finger
  // let go — not from the nearest snap, which on a fast throw is often already
  // the one ahead of the gesture.
  const ahead = speed > 0
    ? values.find((entry) => entry.value > current + 1)
    : [...values].reverse().find((entry) => entry.value < current - 1);
  return (ahead || nearest).name;
}

/**
 * How many pixels a soft keyboard is eating, or 0 when there is none.
 *
 * `interactive-widget=resizes-content` in the viewport meta makes Chrome shrink
 * `innerHeight` itself; iOS Safari does not, and only moves
 * `visualViewport.height`. This is the difference, which is the number that is
 * right on both.
 *
 * @param {{innerHeight: number, visualViewportHeight: ?number}} options
 * @returns {number} Inset in px, 0 below {@link PHONE_KEYBOARD_MIN_INSET_PX}.
 */
export function phoneSheetKeyboardInset({ innerHeight, visualViewportHeight }) {
  const outer = Number(innerHeight);
  // `Number(null)` is 0, which is finite — and a browser with no
  // `visualViewport` hands exactly that. Read as a keyboard it would report the
  // whole viewport as an inset and throw the sheet to full height on load.
  const inner = visualViewportHeight == null ? NaN : Number(visualViewportHeight);
  if (!Number.isFinite(outer) || !Number.isFinite(inner)) return 0;
  const delta = outer - inner;
  return delta > PHONE_KEYBOARD_MIN_INSET_PX ? Math.round(delta) : 0;
}
