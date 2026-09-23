/**
 * @module ignNoData
 *
 * The white the Géoplateforme paints where its orthophoto has no picture, and
 * how it is taken off the globe.
 *
 * WHAT THE SERVER DOES. `ORTHOIMAGERY.ORTHOPHOTOS` is served in JPEG only
 * (`FORMAT=image/png` answers 400), so a tile cannot say "nothing here" with
 * transparency. Past the edge of the survey — the sea a few kilometres out,
 * Spain behind Hendaye — it answers HTTP 200 with WHITE instead: a 1 651-byte
 * tile whose 65 536 pixels are all exactly (255, 255, 255) from level 13 down,
 * and, on the tiles the edge crosses, a photograph with a white block cut into
 * it (47 % to 87 % pure white over the Socoa headland at level 13). Levels 11
 * and 12 answer the same sea with a real picture or a flat navy fill. Measured
 * 2026-09-23 on the Basque coast.
 *
 * WHY IT FLASHED. The detail governor (`globeDetailGovernor.js`) raises the
 * globe's error tolerance while the camera moves and restores it at rest, so a
 * moving camera drew the level-12 sea and a resting one fetched levels 13-14
 * and painted it white — a flash on every stop, in a staircase that follows
 * the tile edges. The Satellite basemap is where « Infrastructure numérique »
 * sends every reader, so the row showed it on every coastline.
 *
 * WHAT IS DONE ABOUT IT. A tile that carries at least {@link NO_DATA_MIN_PIXELS}
 * pure-white pixels is a tile the survey's edge crosses; in it, every pixel at
 * or above {@link NO_DATA_FLOOR} on all three channels is made transparent, so
 * the world satellite base underneath shows through, as it already does past
 * the France clamp. The floor sits under 255 because JPEG rings a fringe of
 * near-white around the block: ~1 250 pixels at 235 and above within two
 * pixels of it, on each edge tile measured — and the lighter pixels of the two
 * rows around the block go with it ({@link NO_DATA_RING_FLOOR}), because a
 * first pass at 240 alone still left a pale outline on screen. A photograph
 * without a hole is
 * never touched — the land tiles measured over Ciboure hold no pure-white
 * pixel at all and at most three at 250 and above — and inside the boxes where
 * the orthophoto is verified opaque (`IGN_OPAQUE_BOXES`) a tile is not even
 * read.
 *
 * DOM-free except for {@link keyNoDataImage}, which needs a 2D canvas; the
 * pixel rule is a pure function tested under `node --test`.
 */

/** Pure-white pixels a tile must hold before it counts as crossed by the edge. */
export const NO_DATA_MIN_PIXELS = 256;

/** Lowest channel value keyed out in such a tile — the JPEG fringe included. */
export const NO_DATA_FLOOR = 240;

/**
 * How far past the block the fringe is chased, in pixels, and how light a
 * pixel there must be to go with it. Measured on four edge tiles: one pixel
 * out, a tenth of the ring still reads 233 on its darkest channel, two out
 * 185-213, while the photograph away from the block tops out at 185-202 (p99).
 */
export const NO_DATA_RING_PX = 2;
export const NO_DATA_RING_FLOOR = 160;

const lowest = (rgba, i) => Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);

/**
 * Makes the no-data white of one RGBA buffer transparent, in place.
 *
 * A keyed pixel is not left white: it takes the mean colour of the pixels
 * kept. Cesium filters imagery with colour and alpha interpolated apart, so a
 * transparent WHITE texel still lends half its white to the texel beside it —
 * measured in the browser, the keyed block kept a pale outline where it met
 * the photograph. A texel the colour of the photograph lends nothing visible.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba Pixels, four bytes each.
 * @param {number} width Pixels per row.
 * @returns {number} Pixels keyed out; 0 means the buffer was not touched.
 */
export function keyNoDataPixels(rgba, width) {
  const count = rgba.length / 4;
  let white = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] === 255 && rgba[i + 1] === 255 && rgba[i + 2] === 255) {
      white += 1;
      if (white >= NO_DATA_MIN_PIXELS) break;
    }
  }
  if (white < NO_DATA_MIN_PIXELS) return 0;

  // 1 = the block and its brightest fringe, 2 = the lighter ring around it.
  const keyed = new Uint8Array(count);
  for (let p = 0; p < count; p += 1) {
    if (lowest(rgba, p * 4) >= NO_DATA_FLOOR) keyed[p] = 1;
  }
  const height = count / width;
  for (let p = 0; p < count; p += 1) {
    if (keyed[p] || lowest(rgba, p * 4) < NO_DATA_RING_FLOOR) continue;
    const x = p % width;
    const y = (p - x) / width;
    search: for (let dy = -NO_DATA_RING_PX; dy <= NO_DATA_RING_PX; dy += 1) {
      const row = y + dy;
      if (row < 0 || row >= height) continue;
      for (let dx = -NO_DATA_RING_PX; dx <= NO_DATA_RING_PX; dx += 1) {
        const col = x + dx;
        if (col >= 0 && col < width && keyed[row * width + col] === 1) {
          keyed[p] = 2;
          break search;
        }
      }
    }
  }

  let kept = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let p = 0; p < count; p += 1) {
    if (keyed[p]) continue;
    const i = p * 4;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    kept += 1;
  }
  if (kept) {
    r = Math.round(r / kept);
    g = Math.round(g / kept);
    b = Math.round(b / kept);
  }
  let total = 0;
  for (let p = 0; p < count; p += 1) {
    if (!keyed[p]) continue;
    const i = p * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 0;
    total += 1;
  }
  return total;
}

/**
 * One 2D context to read tiles through, reused: tiles are keyed one at a time
 * and every result leaves as a copy, so nothing holds on to its pixels.
 * @type {?CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}
 */
let scratch = null;

function scratchContext(width, height) {
  if (!scratch) {
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  const { canvas } = scratch;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  } else {
    scratch.clearRect(0, 0, width, height);
  }
  return scratch;
}

/**
 * The same tile with its no-data white keyed out, or the tile itself when it
 * has none.
 *
 * The result keeps the KIND of its input, because Cesium uploads the two kinds
 * the opposite way up: it decodes imagery into an `ImageBitmap` already
 * flipped (`imageOrientation: 'flipY'`, where WebGL ignores
 * `UNPACK_FLIP_Y_WEBGL`), and flips an image or canvas at upload. A bitmap
 * redrawn and rebuilt from the canvas keeps its orientation, and a canvas
 * handed back for an `<img>` is flipped at upload like the image would have
 * been.
 *
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} image
 * @returns {Promise<ImageBitmap|HTMLImageElement|HTMLCanvasElement>}
 */
export async function keyNoDataImage(image) {
  const width = image?.width;
  const height = image?.height;
  if (!width || !height) return image;
  const ctx = scratchContext(width, height);
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  if (keyNoDataPixels(pixels.data, width) === 0) return image;
  if (typeof ImageBitmap === 'function' && image instanceof ImageBitmap) {
    const keyed = await createImageBitmap(pixels, { premultiplyAlpha: 'none' });
    // Nothing else holds the decoded original: Cesium only ever sees the copy.
    image.close();
    return keyed;
  }
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d').putImageData(pixels, 0, 0);
  return out;
}
