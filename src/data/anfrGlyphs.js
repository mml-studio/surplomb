/**
 * @module anfrGlyphs
 *
 * The marks of `anfrFrance.js`: a glowing TRIANGLE per mast, a DIAMOND for the
 * selected one.
 *
 * ── WHY A TRIANGLE, AND WHY IT GLOWS ────────────────────────────────────────
 * The masts were flat round dots, the mark every other point layer on this
 * globe also uses — a school, a charger, a buoy. The approved mock of
 * 2026-09-23 draws them as small upright triangles with a halo: the silhouette
 * of a mast, which a reader decodes as "antenna" without a key, and a light
 * that reads against the dimmed ground of Dusk (`styles/dusk.js`). The
 * colour channel does not change meaning — the fill is still the newest
 * generation that radiates, the pale outline still an approved project that
 * would add one — and the size is still the operator count.
 *
 * ── ONE ATLAS ENTRY PER VARIANT, NOT PER MAST ───────────────────────────────
 * A `BillboardCollection` keys its texture atlas by `imageId`, and a canvas
 * with no id gets a fresh guid — one atlas entry per billboard, which is how a
 * 6 000-mast city would fill the atlas. Every variant here (five bands × plain
 * or ringed, plus the selection) is drawn ONCE, cached, and handed out with a
 * stable id, so the atlas holds eleven images whatever the view.
 *
 * The images are drawn at twice their CSS size and every billboard is scaled
 * by half, so they stay sharp on a 2× screen and the scale that sizes a mast
 * by its operators only ever shrinks them.
 *
 * DOM-guarded: under `node --test` there is no canvas, the factory returns
 * null, and the layer falls back to a billboard with no image — the tests
 * read the style, not the pixels.
 */

/** Canvas side, in device pixels at 2×. */
export const ANFR_GLYPH_CANVAS_PX = 64;
/** A drawn image pixel is half a CSS pixel. */
export const ANFR_GLYPH_DENSITY = 2;
/** Triangle side at scale 1, in canvas pixels. */
const TRIANGLE_SIDE_PX = 30;
/** Triangle side, in CSS pixels, per pixel of the old dot's diameter. */
export const ANFR_TRIANGLE_PER_DOT_PX = 1.4;
/** The selection's diamond: amber, white edge, a wider halo. */
export const ANFR_SELECTED_FILL = '#ffb238';
const SELECTED_EDGE = '#fff6e5';
const PROJECT_EDGE = '#c9d4e2';

const _cache = new Map();

function makeCanvas() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  if (!canvas?.getContext) return null;
  canvas.width = ANFR_GLYPH_CANVAS_PX;
  canvas.height = ANFR_GLYPH_CANVAS_PX;
  return canvas;
}

function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) || 0);
}

function halo(ctx, color, radius, strength) {
  const [r, g, b] = hexToRgb(color);
  const c = ANFR_GLYPH_CANVAS_PX / 2;
  const gradient = ctx.createRadialGradient(c, c + 2, 0, c, c + 2, radius);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${strength})`);
  gradient.addColorStop(0.45, `rgba(${r},${g},${b},${strength * 0.35})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ANFR_GLYPH_CANVAS_PX, ANFR_GLYPH_CANVAS_PX);
}

function trianglePath(ctx, side) {
  const c = ANFR_GLYPH_CANVAS_PX / 2;
  const h = (side * Math.sqrt(3)) / 2;
  // Centred on its centroid, so the anchor sits where the old dot's centre did.
  ctx.beginPath();
  ctx.moveTo(c, c - (2 * h) / 3);
  ctx.lineTo(c + side / 2, c + h / 3);
  ctx.lineTo(c - side / 2, c + h / 3);
  ctx.closePath();
}

/**
 * The image for one mast style, or null outside a browser.
 *
 * @param {{band: string, color: string, hollow: boolean, ringed: boolean}} style
 *   What `anfrSupportStyle` / `anfrMeshStyle` return.
 * @returns {?{id: string, image: HTMLCanvasElement}}
 */
export function anfrMastGlyph(style) {
  const hollow = Boolean(style?.hollow);
  const ringed = Boolean(style?.ringed) && !hollow;
  const id = `anfr-fr:tri:${style?.band || 'projet'}:${hollow ? 'hollow' : ringed ? 'ringed' : 'plain'}`;
  if (_cache.has(id)) return _cache.get(id);
  const canvas = makeCanvas();
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const color = style?.color || PROJECT_EDGE;
  if (hollow) {
    // Nothing radiates: a file at ANFR, not a mast. No light of its own.
    trianglePath(ctx, TRIANGLE_SIDE_PX - 4);
    ctx.fillStyle = 'rgba(201, 212, 226, 0.12)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PROJECT_EDGE;
    ctx.stroke();
  } else {
    halo(ctx, color, 30, 0.75);
    trianglePath(ctx, TRIANGLE_SIDE_PX);
    const c = ANFR_GLYPH_CANVAS_PX / 2;
    // A hot core, the way a light source reads: pale at the centroid, the
    // band's colour at the edges.
    const core = ctx.createRadialGradient(c, c + 2, 0, c, c + 2, TRIANGLE_SIDE_PX * 0.6);
    core.addColorStop(0, 'rgba(255, 250, 235, 1)');
    core.addColorStop(0.35, color);
    core.addColorStop(1, color);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.lineJoin = 'round';
    if (ringed) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = PROJECT_EDGE;
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(13, 20, 32, 0.55)';
    }
    ctx.stroke();
  }
  const glyph = { id, image: canvas };
  _cache.set(id, glyph);
  return glyph;
}

/** The selected mast: an amber diamond with a pale edge and a wide halo. */
export function anfrSelectedGlyph() {
  const id = 'anfr-fr:selected';
  if (_cache.has(id)) return _cache.get(id);
  const canvas = makeCanvas();
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  halo(ctx, ANFR_SELECTED_FILL, 32, 0.9);
  const c = ANFR_GLYPH_CANVAS_PX / 2;
  const r = 15;
  ctx.beginPath();
  ctx.moveTo(c, c - r);
  ctx.lineTo(c + r, c);
  ctx.lineTo(c, c + r);
  ctx.lineTo(c - r, c);
  ctx.closePath();
  ctx.fillStyle = ANFR_SELECTED_FILL;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SELECTED_EDGE;
  ctx.stroke();
  // The inner diamond of the mock: a darker heart that makes the edge read.
  ctx.beginPath();
  ctx.moveTo(c, c - 6);
  ctx.lineTo(c + 6, c);
  ctx.lineTo(c, c + 6);
  ctx.lineTo(c - 6, c);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 60, 0, 0.55)';
  ctx.fill();
  const glyph = { id, image: canvas };
  _cache.set(id, glyph);
  return glyph;
}

/**
 * Billboard scale for a mast whose old dot was `sizePx` across.
 * @param {number} sizePx `anfrPointSize(operators)`.
 * @returns {number}
 */
export function anfrGlyphScale(sizePx) {
  // The image is drawn at 2×, so a triangle of TRIANGLE_SIDE_PX image pixels
  // is that many CSS pixels at scale 1 — and twice as sharp as it needs to be.
  const side = Math.max(1, Number(sizePx) || 0) * ANFR_TRIANGLE_PER_DOT_PX;
  return side / TRIANGLE_SIDE_PX;
}

/** Scale of the selected diamond: 18 CSS px across. */
export const ANFR_SELECTED_SCALE = 0.6;

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${body}</svg>`,
)}`;

/**
 * The key's swatch for a band: the triangle the map draws, masked and tinted
 * with the band's colour by `manager.js` (the `glyph` field of a legend row).
 * The hollow one for `projet`, where nothing radiates.
 */
export const ANFR_TRIANGLE_LEGEND_GLYPH = svg("<path d='M8 1.5 15 14H1z' fill='#000'/>");
export const ANFR_HOLLOW_TRIANGLE_LEGEND_GLYPH = svg(
  "<path d='M8 3.2 13.6 13H2.4z' fill='none' stroke='#000' stroke-width='1.8' stroke-linejoin='round'/>",
);
