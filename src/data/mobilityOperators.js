/**
 * @module mobilityOperators
 *
 * WHO runs a shared vehicle, and the colour that stands for them on the globe.
 *
 * The shared-mobility layers draw two different things at once. A GBFS feed
 * says what an object physically IS (`form_factor`) and, separately, the PAN
 * catalog says who publishes it. Those are independent facts, so they get
 * independent visual channels:
 *
 *   SHAPE  = what the object is      (see `sharedMobilityIcons.js`)
 *   COLOUR = who operates it         (this module)
 *
 * Without that split a Paris viewport is one undifferentiated cloud: Lime,
 * Dott and Voi all report free-floating scooters in the same streets, and a
 * per-kind palette paints all three the same violet.
 *
 * WHAT IS PUBLISHED AND WHAT IS NOT. No French GBFS feed publishes a brand
 * colour — `system_information.json` has no such field — so the colours here
 * are a DISPLAY CONVENTION, not data. Two rules keep the convention honest:
 *
 *   1. The operators that actually run several French systems are CURATED:
 *      each is pinned to one palette slot, so Lime is the same green in Lille
 *      as in Marseille, and no two curated operators ever share a slot. Where
 *      an operator's own livery is unambiguous (Lime's lime, Voi's coral,
 *      Bird's white, Citiz's orange-red) the slot echoes it; separability wins
 *      when the two goals disagree.
 *   2. Everything else — the ~110 municipal networks, Vélam, Naolib, V'lille —
 *      is DERIVED: a brand key is read off the published title and hashed onto
 *      the same palette. That is stable across sessions and across viewports,
 *      but it is a hash: two municipal networks CAN land on the same hue. The
 *      row legend names every operator in view, and that naming, not the hue,
 *      is what settles which is which.
 *
 * SINCE 2026-09-14 THE COLOUR IS NOT ALONE. 84 operators against 17 slots
 * collide by construction, and a hue is hard to place at the 7-20 px a parked
 * scooter is drawn at. Each operator therefore also carries an `initial` — the
 * monogram `sharedMobilityIcons.js` punches into the plate at close range. It
 * is the second, non-colour half of "who", and it is what replaced the idea of
 * drawing the operators' own logos: that was measured on 2026-09-14 and failed
 * on three counts at once, recorded in `sharedMobilityIcons.js`.
 *
 * The registry is shared by `bikeshare.js` and `sharedMobilityFrance.js` on
 * purpose. They draw disjoint systems (the shared-mobility index excludes the
 * four the bikeshare layer already covers), and an operator that appears in
 * both — Paris shows Vélib' docks from one layer and Dott scooters from the
 * other — has to be the same colour in both or the channel means nothing.
 */

import { interCapitalFor } from './interCapitals.js';
import messages from './mobilityOperators.i18n.js';

/**
 * Operator hues: the ChatGPT « Repères discrets » mock's six, and eleven more
 * drawn in the same key.
 *
 * WHY THESE, SINCE 2026-09-21. The first palette was seventeen hues at full
 * chroma — `#ff4d4d`, `#4fd94f`, `#b6f03c` — and Memel's review of it was
 * that it read like « une palette très basique des années 90 » beside the
 * mock. Measured on the mock's own pixels, its six sit at OKLCH lightness
 * 0.63-0.89 and chroma 0.12-0.18: bright, but a step off the screen primaries,
 * which is what reads as designed rather than default. Those six are kept to
 * the digit (slots 0, 3, 4, 7, 9, 10). The other eleven were set by hand in
 * the same key, softer where the hue circle is crowded (teal, steel, cream),
 * so the whole set clears the redmean floor the tests pin (92 at worst) and
 * never falls under 0.083 in OKLab — the old palette's worst was 0.075.
 *
 * Ordered around the hue circle, so neighbouring indices are the CLOSEST pair
 * in the set; the curated assignments below spread across it, and were
 * checked city by city — the operators that meet in one street never sit
 * closer than 0.10 in OKLab (Paris: 0.125, the mock's own green and yellow).
 */
export const MOBILITY_OPERATOR_PALETTE = Object.freeze([
  '#fb6759', //  0 coral       (mock)
  '#f99e65', //  1 apricot
  '#fac787', //  2 cream
  '#fcd73e', //  3 yellow      (mock)
  '#98e26a', //  4 green       (mock)
  '#42c070', //  5 emerald
  '#1d9999', //  6 teal
  '#40d4d9', //  7 cyan        (mock)
  '#5aa0d0', //  8 steel
  '#3c8cf6', //  9 blue        (mock)
  '#a765df', // 10 violet      (mock)
  '#9792ec', // 11 periwinkle
  '#e07acc', // 12 orchid
  '#ff9cb3', // 13 pink
  '#c6a483', // 14 sand
  '#a3b3c4', // 15 slate
  '#eef3f8', // 16 white
]);

/** Colour for an object whose operator could not be resolved at all. */
export const MOBILITY_OPERATOR_UNKNOWN_COLOR = '#6b7a8a';

/**
 * A dock's MARK, read the same way by both layers: a dark disc, ringed in its
 * operator's hue, holding a core of the same hue as large as the dock is full.
 *
 * The ring carries the operator (above); the core carries the one number a
 * rider acts on. `bikeshare.js` and `sharedMobilityFrance.js` both draw it,
 * and over Paris both are on screen at once, so the thresholds and the shapes
 * live here once. `full` is above 60 %, `half` from 30 %, `low` under it.
 *
 * A CORE, NOT A TINT — SINCE 2026-09-21, THE SECOND TIME THAT DAY. The level
 * was the ring's hue poured in at 100 %, 42 % or 10 % opacity. Over the
 * photorealistic city that made every half-full Vélib' dock a violet smudge
 * the roof showed through, and Memel's review put it plainly: « ça ne se voit
 * pas du tout ». Nothing is translucent now. The disc is the cockpit's dark
 * glass, the pins' own, so a dock keeps its edge on a pale roof; the ring
 * keeps it on a dark street; and the core — solid, or small, or absent —
 * says how many bikes are left in a shape, where the tint said it in an
 * opacity nobody could read at 12 px.
 *
 * The dark disc is also what tells a dock from a vehicle: a vehicle is a
 * solid dot, a dock always has the dark ring inside its coloured one.
 */
export const MOBILITY_DOCK_DISC = 'rgba(18,27,24,0.94)';

/** The core's diameter as a share of the disc's, per level. */
export const MOBILITY_DOCK_CORE_SCALE = Object.freeze({
  full: 0.62,
  half: 0.36,
  low: 0,
});

/**
 * The two states that are NOT a level — no data, and closed. The disc goes
 * grey instead of dark, and faded, so « we do not know » never reads as
 * « empty »; the ring still says whose it is.
 */
export const MOBILITY_DOCK_STATE_DISC = Object.freeze({
  unknown: 'rgba(145,164,180,0.6)',
  closed: 'rgba(104,117,129,0.45)',
});

/**
 * The mark of one dock.
 * @param {'full'|'half'|'low'|'unknown'|'closed'} level
 * @param {string} operatorColor The ring's hue, `#rrggbb`.
 * @returns {{disc: string, ring: string, core: ?string, coreScale: number}}
 *   CSS colours; `core` is null when nothing is drawn inside the ring.
 */
export function mobilityDockMark(level, operatorColor) {
  const ring = /^#[0-9a-f]{6}$/i.test(operatorColor || '') ? operatorColor : MOBILITY_OPERATOR_UNKNOWN_COLOR;
  const state = MOBILITY_DOCK_STATE_DISC[level];
  if (state) return { disc: state, ring, core: null, coreScale: 0 };
  const coreScale = MOBILITY_DOCK_CORE_SCALE[level] ?? 0;
  return { disc: MOBILITY_DOCK_DISC, ring, core: coreScale > 0 ? ring : null, coreScale };
}

/** A 14 px key glyph: the ring, and a core of `scale` — masked, so one colour. */
function dockGlyph(scale) {
  const core = scale > 0 ? `<circle cx="7" cy="7" r="${(5 * scale).toFixed(2)}"/>` : '';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14">'
    + `<circle cx="7" cy="7" r="5.9" fill="none" stroke="#000" stroke-width="2.2"/>${core}</svg>`;
  const base64 = typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/** Swatch tone of the dock key: the levels are a property of every ring, not of one operator. */
const DOCK_LEGEND_TONE = '#eef3f8';

/**
 * The three dock lines of the key, in the page's language.
 *
 * Only the three a rider acts on: « unknown » and « closed » are greys that
 * read as absence without a key, and every line spent on them pushes the
 * operators down the card. Each swatch is the mark's own shape — the ring and
 * its core — in a neutral tone, because the map draws every operator's hue.
 * @returns {Array<{label:string, color:string, glyph:string, channel:string}>}
 */
export function dockFillLegend() {
  const m = messages().legend;
  return [
    { label: m.full, color: DOCK_LEGEND_TONE, glyph: dockGlyph(MOBILITY_DOCK_CORE_SCALE.full), channel: m.docks },
    { label: m.half, color: DOCK_LEGEND_TONE, glyph: dockGlyph(MOBILITY_DOCK_CORE_SCALE.half), channel: m.docks },
    { label: m.low, color: DOCK_LEGEND_TONE, glyph: dockGlyph(MOBILITY_DOCK_CORE_SCALE.low), channel: m.docks },
  ];
}

/**
 * Whether a string can name an operator — a curated id (`lime`,
 * `leo-and-go`) or a derived one (`derived:velo modalis`).
 *
 * A FORM, not a registry lookup: an operator focus is fanned out across a
 * row, and a docked network the bikeshare layer draws is an operator the
 * shared-fleet layer has never seen. Focusing it there is still a valid
 * question — the answer is "none of mine" — so the check is only that the id
 * could have come from {@link resolveMobilityOperator}.
 * @param {*} id
 * @returns {boolean}
 */
export function isMobilityOperatorId(id) {
  return typeof id === 'string' && /^(derived:)?[a-z0-9][a-z0-9 -]{0,79}$/.test(id);
}

/**
 * Operators pinned to a palette slot.
 *
 * `match` entries are whole-WORD sequences tested against the normalized
 * title. Word boundaries matter: "Vélibleu Grand Châtellerault" is a
 * Châtellerault municipal network and must not be read as Vélib' Paris, which
 * a prefix test would do.
 *
 * `slot` indexes {@link MOBILITY_OPERATOR_PALETTE}. Each is unique — a test
 * pins that.
 */
// i18n-ignore-start — operator BRANDS and the words their titles lead with:
// data, matched against published titles and never translated.
const CURATED_OPERATORS = Object.freeze([
  // ── Free-floating majors (the ones that overlap each other in one city) ──
  // Paris holds Voi, Dott, Lime, YEGO and the Vélib' docks: the mock's coral,
  // blue, green, yellow and cyan, one each.
  { id: 'lime', label: 'Lime', slot: 4, match: ['lime'] },
  { id: 'voi', label: 'Voi', slot: 0, match: ['voi'] },
  { id: 'dott', label: 'Dott', slot: 9, match: ['dott'] },
  { id: 'tier', label: 'Tier', slot: 11, match: ['tier'] },
  { id: 'bird', label: 'Bird', slot: 16, match: ['bird'] },
  // The mock's violet: Pony meets Dott's blue and YEGO's yellow in Bordeaux
  // and Nice, and violet is the hue furthest from both.
  { id: 'pony', label: 'Pony', slot: 10, match: ['pony'] },
  { id: 'yego', label: 'YEGO', slot: 3, match: ['yego'] },
  // Cityscoot went bankrupt in 2024 and none of the 165 catalogued systems is
  // still its own: a quiet slot.
  { id: 'cityscoot', label: 'Cityscoot', slot: 14, match: ['cityscoot'] },

  // ── Carsharing ──────────────────────────────────────────────────────────
  { id: 'citiz', label: 'Citiz', slot: 1, match: ['citiz'] },
  // Orchid, off the five Paris hues its cars park among.
  { id: 'clem', label: "Clem'", slot: 12, match: ['clem'] },
  // Teal, not sand: sand sat 0.10 from Citiz's apricot in Lyon, where both run.
  { id: 'leo-and-go', label: 'Leo&Go', slot: 6, match: ['leo go', 'leoandgo', 'leogo'] },

  // ── The four docked networks the Bikeshare layer draws ──────────────────
  // Cyan, the mock's fifth hue and the nearest to Vélib's own turquoise. It
  // was a saturated violet from 2026-09-21 — chosen to part it from Lime's
  // green — and Memel found it « moche » over the photorealistic city; cyan
  // parts it from green just as well.
  { id: 'velib', label: "Vélib'", slot: 7, match: ['velib', 'velib metropole'] },
  { id: 'velov', label: "Vélo'v", slot: 13, match: ['velov'] },
  // Steel, not cream: YEGO's yellow and Citiz's apricot run in Toulouse too.
  { id: 'velotoulouse', label: 'VélÔToulouse', slot: 8, match: ['velotoulouse'] },
  { id: 'levelo-tbm', label: 'Le Vélo (TBM)', slot: 5, match: ['tbm', 'le velo tbm'] },
]);
// i18n-ignore-end

/**
 * Leading words that carry no brand. A title starting with one of these is
 * read one word deeper: "Vélo Modalis Grand Angoulême" is Vélo Modalis, not a
 * fourth network called "Vélo".
 */
// i18n-ignore-start — normalization tokens, compared against titles.
const GENERIC_LEAD_WORDS = new Set([
  'le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'velo', 'velos', 'vls',
]);
// i18n-ignore-end

/**
 * Monograms pinned by hand, where the first letter of the LABEL is not the
 * letter the operator is known by.
 *
 * The default is the first letter of the label, and the four entries below are
 * the curated operators where that letter is already taken by an operator they
 * actually MEET: Citiz, Cityscoot and Clem' all begin with C, and Leo&Go shares
 * Toulouse with Lime.
 *
 * WHAT IS NOT FIXED, AND WHY. Counted over the 165 catalogued systems, 33 of
 * the 84 operators monogram to V — nearly all of them a municipal "Vélo…"
 * network. They are not disambiguated, for two reasons. They are one per urban
 * area, so two of them never share a viewport; and monogramming them on their
 * distinctive word instead was tried and measured on the real catalogue, which
 * moved V from 33 to 29 while turning "Le Marcel" into an M and "Vélo Fluo"
 * into an F — a worse letter for a marginal gain. Voi is the one free-floating
 * major that can meet a V network in the same street, and the row legend names
 * both, which is the same contract the hue already carries for a hash
 * collision.
 */
const CURATED_MONOGRAMS = Object.freeze({
  // Citiz takes the C it shares with two others, being by far the largest of
  // the three and a carsharing network the other two are not.
  cityscoot: 'S',      // the SCOOT half, which is what is not Citiz
  clem: 'M',           // Clem', past the C
  'leo-and-go': 'G',   // the GO half; L belongs to Lime, which it meets in Toulouse
  // A municipal bike network, monogrammed like every other one. Its own label
  // starts with "Le", and an L would collide with Lime in Bordeaux, which is
  // exactly the city it runs in.
  'levelo-tbm': 'V',
});

/**
 * Fold a published title to comparable words: lowercase, unaccented,
 * apostrophes CLOSED rather than split (so "Vélo'v" is one word `velov` and
 * "V'lille" is `vlille`), everything else a separator.
 *
 * @param {string} text Raw title.
 * @returns {string} Space-separated normalized words (may be empty).
 */
export function normalizeOperatorText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** FNV-1a 32-bit — a stable hash with no dependency and no `Math.random`. */
function hashKey(text) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Longest contiguous word-sequence match, anywhere in the title.
 *
 * Longest wins so a specific token beats a generic one; position breaks ties
 * so the leading brand beats a trailing mention.
 *
 * @param {Array<string>} words Normalized title words.
 * @returns {?Object} The curated entry, or null.
 */
function matchCurated(words) {
  let best = null;
  let bestLength = 0;
  let bestIndex = Infinity;
  for (const operator of CURATED_OPERATORS) {
    for (const candidate of operator.match) {
      const tokens = candidate.split(' ');
      for (let i = 0; i + tokens.length <= words.length; i++) {
        let hit = true;
        for (let j = 0; j < tokens.length; j++) {
          if (words[i + j] !== tokens[j]) { hit = false; break; }
        }
        if (!hit) continue;
        if (tokens.length > bestLength || (tokens.length === bestLength && i < bestIndex)) {
          best = operator;
          bestLength = tokens.length;
          bestIndex = i;
        }
        break;
      }
    }
  }
  return best;
}

/**
 * Brand label derived from a title that no curated entry claims.
 *
 * Reads the leading word, stepping past articles and the generic "Vélo"
 * prefix that a third of French municipal networks share. This is a HEURISTIC
 * over a human-written catalog title, which is why it only ever produces the
 * derived half of the registry — the curated half is spelled out above.
 *
 * @param {string} name Raw title.
 * @returns {?{label:string, key:string}}
 */
function deriveBrand(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return null;
  // Split the RAW title so the label keeps its accents and capitalisation,
  // while the key is compared on the folded form.
  const rawWords = raw.split(/\s+/).filter(Boolean);
  const normalized = normalizeOperatorText(raw);
  if (!normalized) return null;
  const words = normalized.split(' ');

  let take = 1;
  while (take < words.length && take < 3 && GENERIC_LEAD_WORDS.has(words[take - 1])) take += 1;

  const label = rawWords.slice(0, take).join(' ').replace(/[(),.;:]+$/, '') || raw;
  return { label, key: words.slice(0, take).join(' ') };
}

/** @type {Map<string, Object>} Resolution cache, keyed by the raw title. */
const _resolved = new Map();

/**
 * Resolve a published system/provider title to the operator it belongs to.
 *
 * @param {string} name Title as published — "Lime Paris", "Naolib Nantes
 *   Métropole", "Vélib' Métropole".
 * @returns {{id:string, label:string, color:string, initial:?string, curated:boolean}}
 *   `curated` is true when the operator was pinned by hand, false when the
 *   label and hue were derived from the title. `initial` is the monogram the
 *   map plate punches, or null for a label with no Latin letter in it at all —
 *   in which case the caller must draw NO badge rather than invent one.
 */
export function resolveMobilityOperator(name) {
  const raw = String(name ?? '');
  const cached = _resolved.get(raw);
  if (cached) return cached;

  const normalized = normalizeOperatorText(raw);
  let operator;
  if (!normalized) {
    operator = {
      id: 'unknown',
      label: messages().unknownOperator,
      color: MOBILITY_OPERATOR_UNKNOWN_COLOR,
      // No title, so no letter. The plate draws bare rather than badging a
      // capital the catalogue never published.
      initial: null,
      curated: false,
    };
  } else {
    const curated = matchCurated(normalized.split(' '));
    if (curated) {
      operator = {
        id: curated.id,
        label: curated.label,
        color: MOBILITY_OPERATOR_PALETTE[curated.slot],
        initial: CURATED_MONOGRAMS[curated.id] || interCapitalFor(curated.label),
        curated: true,
      };
    } else {
      const brand = deriveBrand(raw);
      const key = brand?.key || normalized;
      operator = {
        id: `derived:${key}`,
        label: brand?.label || raw,
        color: MOBILITY_OPERATOR_PALETTE[hashKey(key) % MOBILITY_OPERATOR_PALETTE.length],
        initial: interCapitalFor(brand?.label || raw),
        curated: false,
      };
    }
  }

  Object.freeze(operator);
  _resolved.set(raw, operator);
  return operator;
}

/**
 * Operator colour for a published title.
 * @param {string} name Title as published.
 * @returns {string} CSS hex colour.
 */
export function mobilityOperatorColor(name) {
  return resolveMobilityOperator(name).color;
}

/**
 * Short operator label, clipped for the fixed-width detection overlay.
 * @param {string} name Title as published.
 * @param {number} [maxChars=12]
 * @returns {string}
 */
export function mobilityOperatorShortLabel(name, maxChars = 12) {
  const label = resolveMobilityOperator(name).label;
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

/** Curated table, for tests and for documentation surfaces. */
export function curatedMobilityOperators() {
  return CURATED_OPERATORS.map((operator) => ({
    id: operator.id,
    label: operator.label,
    color: MOBILITY_OPERATOR_PALETTE[operator.slot],
    initial: CURATED_MONOGRAMS[operator.id] || interCapitalFor(operator.label),
  }));
}

/**
 * The monogram a published title is drawn with, or null when its label carries
 * no Latin letter.
 * @param {string} name Title as published.
 * @returns {?string} One capital.
 */
export function mobilityOperatorMonogram(name) {
  return resolveMobilityOperator(name).initial;
}
