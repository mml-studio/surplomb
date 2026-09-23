/**
 * @module datacenterGlyphs
 *
 * The marks of the data-centre layer since the approved mock of 2026-09-23: a
 * violet four-pointed SPARKLE per site, and a STACK of them where several
 * sites share one spot on the screen (« Regroupement »).
 *
 * The layer used to draw a 6 px cyan dot at the top of a 65 px cyan stem, with
 * a card beside each one: at the national view that was a field of light beams
 * and three hundred cards. The mock keeps the idea of a mark standing over its
 * site — a short, faint stem — and puts the light in the mark itself.
 *
 * Violet because the row's other members already hold the other lights:
 * cables are cyan, antennas amber, the dead zones pink. The airports layer
 * uses a violet too (`#b388ff`), in another row, for another subject.
 *
 * The images are drawn once on a canvas and handed out as DATA URLs. An entity
 * billboard given a canvas gets a fresh atlas id per entity; given a string it
 * is keyed by that string, so the 4 638 sites share two atlas entries.
 * DOM-guarded: without a canvas (`node --test`) there are no glyphs and the
 * layer keeps its dots.
 */

/** The sites' violet, and the fill of their footprints. */
export const DATACENTER_VIOLET = '#a98bff';
/** The pale core of the sparkle. */
const CORE = '#f4efff';

/** Image pixels per CSS pixel: drawn at 2× and scaled by half. */
const DENSITY = 2;

let _glyphs;

function sparklePath(ctx, cx, cy, rx, ry, waist) {
  // A four-pointed star, taller than wide: the points on the axes, the waist
  // pulled in towards the centre.
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.quadraticCurveTo(cx + waist, cy - waist, cx + rx, cy);
  ctx.quadraticCurveTo(cx + waist, cy + waist, cx, cy + ry);
  ctx.quadraticCurveTo(cx - waist, cy + waist, cx - rx, cy);
  ctx.quadraticCurveTo(cx - waist, cy - waist, cx, cy - ry);
  ctx.closePath();
}

function glow(ctx, cx, cy, radius, alpha) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(169, 139, 255, ${alpha})`);
  gradient.addColorStop(0.4, `rgba(169, 139, 255, ${alpha * 0.35})`);
  gradient.addColorStop(1, 'rgba(169, 139, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function sparkle(ctx, cx, cy, size) {
  sparklePath(ctx, cx, cy, size * 0.62, size, size * 0.16);
  const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
  fill.addColorStop(0, CORE);
  fill.addColorStop(0.3, '#d6c8ff');
  fill.addColorStop(1, DATACENTER_VIOLET);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(40, 20, 90, 0.55)';
  ctx.stroke();
}

function chevron(ctx, cx, cy, half, drop) {
  ctx.beginPath();
  ctx.moveTo(cx - half, cy);
  ctx.lineTo(cx, cy + drop);
  ctx.lineTo(cx + half, cy);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = DATACENTER_VIOLET;
  ctx.stroke();
}

function draw(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx);
  return canvas.toDataURL('image/png');
}

/**
 * The two marks as billboard images, or null outside a browser.
 *
 * The anchor of both is the image's centre. The stack's sparkle sits a few
 * pixels above it and its chevrons hang below, like the mock's, so a group
 * stands over its stem at about the height a single site does.
 *
 * @returns {?{single: {image: string, scale: number}, group: {image: string, scale: number}}}
 */
export function datacenterMarkerGlyphs() {
  if (_glyphs !== undefined) return _glyphs;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    _glyphs = null;
    return _glyphs;
  }
  const single = draw(56, 56, (ctx) => {
    glow(ctx, 28, 28, 28, 0.85);
    sparkle(ctx, 28, 28, 17);
  });
  const group = draw(68, 68, (ctx) => {
    glow(ctx, 34, 34, 34, 0.9);
    // Two chevrons under the sparkle: the sites the one on top stands for.
    chevron(ctx, 34, 41, 12, 7);
    chevron(ctx, 34, 48, 12, 7);
    sparkle(ctx, 34, 29, 17);
  });
  _glyphs = single && group
    ? {
      single: { image: single, scale: 1.15 / DENSITY },
      group: { image: group, scale: 1.15 / DENSITY },
    }
    : null;
  return _glyphs;
}

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${body}</svg>`,
)}`;

/** The key's swatches: the two marks as masks, tinted by `manager.js`. */
export const DATACENTER_SITE_LEGEND_GLYPH = svg(
  "<path d='M8 1Q9.3 6.7 12.9 8 9.3 9.3 8 15 6.7 9.3 3.1 8 6.7 6.7 8 1z' fill='#000'/>",
);
export const DATACENTER_GROUP_LEGEND_GLYPH = svg(
  "<path d='M8 .5Q9 4.2 11.6 5.2 9 6.2 8 9.9 7 6.2 4.4 5.2 7 4.2 8 .5z' fill='#000'/>"
  + "<path d='M3.5 9.6 8 12.4l4.5-2.8M3.5 12.6 8 15.4l4.5-2.8' fill='none' stroke='#000' "
  + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>",
);
