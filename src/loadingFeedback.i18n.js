/**
 * Strings of src/loadingFeedback.js — the banner that says a layer is loading,
 * and the flash that says how it ended.
 *
 * INHERITED ENGLISH, AND STILL ENGLISH IN FRENCH, like the HUD next door:
 * `LOADING LIVE DATA`, `LOAD COMPLETE`, `LOAD FAILED` are the upstream
 * console's own voice and they have always been what the French page shows.
 * Every leaf says the same thing in both languages ON PURPOSE — the French
 * bytes do not move — and the French wording is one product decision away,
 * in one file, the day it is taken.
 *
 * The DETAIL under the banner is not here: it is the list of layer names, and
 * those come from the registry, which is bilingual (`layerTaxonomy.i18n.js`).
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  /** While work is in flight. */
  loading: { fr: 'LOADING LIVE DATA', en: 'LOADING LIVE DATA' },
  refreshing: { fr: 'REFRESHING LIVE DATA', en: 'REFRESHING LIVE DATA' },
  turningOff: { fr: 'TURNING OFF LIVE DATA', en: 'TURNING OFF LIVE DATA' },

  /** The flash that follows, one per outcome. */
  complete: { fr: 'LOAD COMPLETE', en: 'LOAD COMPLETE' },
  cancelled: { fr: 'LOAD CANCELLED', en: 'LOAD CANCELLED' },
  error: { fr: 'LOAD FAILED', en: 'LOAD FAILED' },
  turnedOff: { fr: 'LIVE DATA OFF', en: 'LIVE DATA OFF' },

  /**
   * The road-traffic sync chip, when the layer supplies no label of its own.
   * Deliberately neutral: the layer always publishes its own LIVE / SIMULATED
   * wording, and a fallback must never claim a live feed on a keyless build.
   */
  syncingRoadNetwork: { fr: 'syncing road network', en: 'syncing road network' },

  /** A layer with no name of its own, in the loading detail line. */
  layer: { fr: 'Layer', en: 'Layer' },
});
