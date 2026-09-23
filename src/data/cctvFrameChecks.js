/**
 * @module cctvFrameChecks
 * @description Two ways an upstream CCTV frame can answer HTTP 200 and still
 * not be a frame: the provider's "camera unavailable" graphic, and a JPEG
 * published incomplete. Server-only (node:crypto). Used by the `/api/cctv/frame`
 * fallback chain in `vite.config.js` and by the timelapse recorder
 * (`cctvTimelapse.js`), which must never store either one.
 */
import { createHash } from 'node:crypto';

/**
 * How far back from the end to look for the JPEG EOI marker.
 *
 * Bounded at both ends on purpose. Too small and a camera that appends
 * trailing metadata after EOI is condemned as truncated — a false positive
 * sends a healthy camera to Street View forever, which is the expensive
 * mistake. Too large (scanning the whole file) and an EXIF thumbnail's OWN
 * end-of-image marker, which sits near the start of the file, would be
 * mistaken for the real one and a genuinely truncated frame would pass. These
 * frames run 64 KB to 600 KB, so 4 KB clears any realistic trailer while
 * staying far from the thumbnail.
 */
export const JPEG_EOI_SCAN_BYTES = 4096;

/**
 * SHA-256 of the "Image indisponible" graphic the Métropole serves in place of
 * a frame when a Criter camera is down (a 300x200, 22,966-byte drawing of
 * traffic cones). Verified byte-identical across repeated fetches on
 * 2026-08-26, on CWL7033.
 *
 * It has to be caught by CONTENT, because none of the usual signals work: the
 * catalog has no in-service flag, the row's `last_update` keeps advancing every
 * minute while the placeholder is being served, and the response is a perfectly
 * valid HTTP 200 image. Without this the panel would report SNAPSHOT · OK over
 * a picture of road cones.
 *
 * Fails OPEN: if the Métropole ever redraws the graphic this stops matching and
 * the frame is served unchanged — never the reverse.
 */
export const CCTV_PLACEHOLDER_FRAME_SHA256 = Object.freeze([
  '8be14bdafb0b8b688651206d02fad0656c0be2095c0e18c36945f74a8f598bdd',
]);

/**
 * Hex SHA-256 of a frame body.
 *
 * @param {Buffer|Uint8Array} body
 * @returns {string}
 */
export function cctvFrameSha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Is this JPEG body cut off before the end of its scan data?
 *
 * Nothing in the response says so: a valid HTTP 200, no Content-Length to fall
 * short of (the host answers chunked), no error status, and the SOF header
 * still declares the full frame size. The browser decodes the rows it received
 * and leaves the rest transparent — which is how a 1920x1440 camera renders as
 * a thin strip of sky.
 *
 * Measured on CWL5801, the largest frame in the Grand Lyon pack: 12 fetches
 * 7 s apart, 0 complete. The byte count was STABLE within each publication
 * minute (141,620 B five times, then 306,600 B seven times) and changed only
 * when a new frame was published, so this is not a read-while-write race that a
 * retry would win — the file the Métropole publishes for that camera is itself
 * incomplete, every cycle. libjpeg rejects it outright: "premature end of JPEG
 * image". Hence: no retry, straight to the fallback chain.
 *
 * The test is the JPEG end-of-image marker, scanned across the tail of the file
 * (see JPEG_EOI_SCAN_BYTES) so a camera that appends trailing metadata is not
 * called truncated. Anything that is not a JPEG is left alone — this fails OPEN
 * in every direction.
 *
 * @param {Buffer|Uint8Array|null} body
 * @returns {boolean}
 */
export function isTruncatedJpegFrame(body) {
  if (!body || body.length < 4) return false;
  if (body[0] !== 0xFF || body[1] !== 0xD8) return false; // not a JPEG: not our call
  const from = Math.max(2, body.length - JPEG_EOI_SCAN_BYTES);
  for (let i = body.length - 2; i >= from; i -= 1) {
    if (body[i] === 0xFF && body[i + 1] === 0xD9) return false;
  }
  return true;
}

/**
 * Is this frame body a known provider "camera unavailable" placeholder rather
 * than a real capture?
 *
 * @param {Buffer|Uint8Array|null} body
 * @returns {boolean}
 */
export function isPlaceholderCctvFrame(body) {
  if (!body || !body.length) return false;
  return CCTV_PLACEHOLDER_FRAME_SHA256.includes(cctvFrameSha256(body));
}
