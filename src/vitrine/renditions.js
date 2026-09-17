/**
 * Which file of the recorded loop this screen should play.
 *
 * The loop is cut in several renditions — a definition (2880 or 1920 px wide
 * on a desktop, 1170 on a phone) crossed with a codec (AV1, HEVC, H.264). The
 * first cut was 1600 px at 1.4 Mbit/s and read as pixelated on a 2560 px
 * Retina panel, where it was blown up almost 2× (Memel, 2026-09-17). So the
 * choice starts from the DEVICE pixels the picture has to cover, then asks the
 * browser what it can decode smoothly, and only then prefers the codec that
 * spends the fewest bytes for the same picture.
 *
 * Everything here is pure (the browser's answers are injected), so the rules
 * are pinned in `renditions.test.mjs` rather than re-discovered on a device.
 *
 * @module vitrine/renditions
 */

/** Same picture, fewer bytes: AV1 before HEVC before H.264. */
export const CODEC_RANK = Object.freeze({ av1: 0, hevc: 1, h264: 2 });

/**
 * A rendition this much narrower than the need still looks right: the
 * browser's own scaler is good at 10 %, and the next tier up doubles the
 * bytes.
 */
export const WIDTH_SLACK = 0.9;

/**
 * Device pixels of width the loop must have to cover the box without being
 * blown up. The picture is `object-fit: cover`, so a box taller than the
 * video's own shape is covered by HEIGHT, and needs more width than it shows.
 *
 * @param {{boxWidth: number, boxHeight: number, dpr?: number, videoAspect: number}} box
 * @returns {number}
 */
export function neededVideoWidth({ boxWidth, boxHeight, dpr = 1, videoAspect }) {
  const css = Math.max(Number(boxWidth) || 0, (Number(boxHeight) || 0) * videoAspect);
  return Math.ceil(css * Math.max(1, Number(dpr) || 1));
}

/**
 * Ask the browser about each rendition.
 *
 * `canPlayType` weeds out what cannot play at all. `mediaCapabilities`, where
 * it exists, says whether decoding at that definition will be `smooth` and
 * `powerEfficient` (hardware): software AV1 at 2880 px on an older laptop is
 * « supported » and still a slideshow. Without it, only H.264 is assumed to
 * be hardware-decoded — the one safe guess.
 *
 * @param {Array<{src: string, mime: string, codec: string, width: number, height: number, bitrateKbps?: number}>} renditions
 * @param {{canPlayType: (mime: string) => string, mediaCapabilities?: {decodingInfo: Function}|null, fps?: number}} browser
 * @returns {Promise<Array<object>>} the playable ones, each with `smooth` and `powerEfficient`.
 */
export async function probeRenditions(renditions, { canPlayType, mediaCapabilities = null, fps = 30 }) {
  const playable = (renditions || []).filter((r) => r?.src && r.mime && canPlayType(r.mime));
  return Promise.all(playable.map(async (r) => {
    if (typeof mediaCapabilities?.decodingInfo !== 'function') {
      return { ...r, smooth: true, powerEfficient: r.codec === 'h264' };
    }
    try {
      const info = await mediaCapabilities.decodingInfo({
        type: 'file',
        video: {
          contentType: r.mime,
          width: r.width,
          height: r.height,
          bitrate: Math.round((r.bitrateKbps || 8000) * 1000),
          framerate: fps,
        },
      });
      if (!info?.supported) return null;
      return { ...r, smooth: Boolean(info.smooth), powerEfficient: Boolean(info.powerEfficient) };
    } catch {
      // An unparsable query is not a verdict; `canPlayType` already said yes.
      return { ...r, smooth: true, powerEfficient: r.codec === 'h264' };
    }
  })).then((list) => list.filter(Boolean));
}

/**
 * Pick one.
 *
 * 1. The smallest definition that covers the need (with {@link WIDTH_SLACK}),
 *    or the largest there is.
 * 2. At that definition, something that decodes smoothly; if nothing does,
 *    step DOWN a definition rather than play a stutter.
 * 3. Among the smooth ones: hardware first, then the thriftiest codec.
 *
 * @param {Array<object>} probed From {@link probeRenditions}.
 * @param {number} neededWidth From {@link neededVideoWidth}.
 * @returns {?object}
 */
export function chooseRendition(probed, neededWidth) {
  if (!probed?.length) return null;
  const widths = [...new Set(probed.map((r) => r.width))].sort((a, b) => a - b);
  const covering = widths.find((w) => w >= neededWidth * WIDTH_SLACK) ?? widths.at(-1);
  const order = (a, b) => (Number(b.powerEfficient) - Number(a.powerEfficient))
    || ((CODEC_RANK[a.codec] ?? 9) - (CODEC_RANK[b.codec] ?? 9))
    || ((a.bytes || 0) - (b.bytes || 0));
  for (const width of widths.filter((w) => w <= covering).reverse()) {
    const smooth = probed.filter((r) => r.width === width && r.smooth).sort(order);
    if (smooth.length) return smooth[0];
  }
  return probed.filter((r) => r.width === widths[0]).sort(order)[0];
}
