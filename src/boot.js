/**
 * The page's entry: a switch, not the cockpit.
 *
 * `index.html` serves two surfaces (src/vitrine/gate.js says which): the
 * showcase a first visitor reads, and the cockpit everyone else lands in. This
 * module is the only script the page loads by itself, and it is small on
 * purpose — the showcase must reach its first paint, and a phone must be able
 * to read the whole page, without a byte of Cesium.
 *
 *   - cockpit arrival → `src/main.js` is imported and started at once;
 *   - showcase arrival → `src/vitrine/vitrine.js` wires the page, and the
 *     cockpit is imported only when « Ouvrir le globe » is pressed (on a wide
 *     screen it is also fetched at idle, so the press is quick).
 *
 * `src/main.js` no longer starts itself on import: evaluating its graph and
 * building a Viewer are two separate decisions now.
 *
 * @module boot
 */

import {
  applyVitrineDecision,
  arrivalMarksSeen,
  decideVitrine,
  markVitrineSeen,
  readVitrineSignals,
} from './vitrine/gate.js';

const decision = decideVitrine(readVitrineSignals());
applyVitrineDecision(decision);

let cockpitModule = null;

/**
 * Fetch and evaluate the cockpit's module graph, once. Builds nothing.
 * @returns {Promise<typeof import('./main.js')>}
 */
function loadCockpit() {
  cockpitModule ??= import('./main.js').catch((error) => {
    cockpitModule = null;
    throw error;
  });
  return cockpitModule;
}

let widgetsReady = null;

/**
 * Turn Cesium's widget stylesheet back on (vite.config.js made it inert on
 * this page) and resolve when it has arrived — or after three seconds, since a
 * late stylesheet costs a reflow, not the globe.
 * @returns {Promise<void>}
 */
function enableCesiumWidgets() {
  if (widgetsReady) return widgetsReady;
  const link = document.querySelector('link[data-cesium-widgets]');
  const href = link?.getAttribute('data-href');
  if (!link || !href) {
    widgetsReady = Promise.resolve();
    return widgetsReady;
  }
  widgetsReady = new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 3000);
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
  });
  return widgetsReady;
}

/**
 * Start the cockpit.
 * @param {object} [options] Forwarded to `startCockpit` (src/main.js).
 * @returns {Promise<void>}
 */
async function openCockpit(options = {}) {
  const [{ startCockpit }] = await Promise.all([loadCockpit(), enableCesiumWidgets()]);
  return startCockpit(options);
}

/** The loading veil is the only surface left to say that the page broke. */
function reportBootFailure(error) {
  console.error('[boot] the cockpit could not load:', error);
  const status = document.querySelector('#loading-screen .loader-status');
  if (status) {
    status.textContent = 'Le globe n’a pas pu se charger. Rechargez la page.';
    status.style.color = '#ff4444';
  }
}

if (decision.vitrine) {
  import('./vitrine/vitrine.js')
    .then(({ initVitrine }) => initVitrine({ loadCockpit, openCockpit, onCockpitError: reportBootFailure }))
    .catch((error) => {
      // The showcase still works without its script: the form is a native GET
      // to `/?q=`, and every example is a plain link.
      console.error('[boot] the showcase script could not load:', error);
    });
} else {
  if (arrivalMarksSeen(decision)) markVitrineSeen();
  openCockpit().catch(reportBootFailure);
}
