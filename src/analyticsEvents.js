/**
 * Named actions (a search, a fiche looked up, a waitlist sign-up) for the
 * detailed measurement — without importing PostHog.
 *
 * Any module may call `track()`: it costs one function call and no bytes of
 * SDK. src/audienceMeasure.js plugs the sink in once PostHog has started, and
 * its `before_send` drops every one of these unless the visitor accepted the
 * banner — a visitor counted without a cookie sends page views only. Calls
 * made before the SDK arrives wait in a short queue.
 *
 * @module analyticsEvents
 */

const QUEUE_LIMIT = 50;
let sink = null;
const queue = [];

/**
 * Record a named action.
 * @param {string} event snake_case, English (`search`, `fiche_lookup`, …)
 * @param {Record<string, unknown>} [properties]
 */
export function track(event, properties = {}) {
  if (!event) return;
  if (sink) {
    try {
      sink(event, properties);
    } catch {
      // Measurement must never affect the page.
    }
  } else if (queue.length < QUEUE_LIMIT) {
    queue.push([event, properties]);
  }
}

/**
 * Where actions go from now on; the queued ones are sent first.
 * @param {((event: string, properties: object) => void)|null} fn
 */
export function setTrackSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
  if (!sink) return;
  for (const [event, properties] of queue.splice(0)) track(event, properties);
}
