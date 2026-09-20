/**
 * The page's entry: a switch, not the cockpit.
 *
 * `index.html` serves two surfaces at two addresses (src/vitrine/gate.js says
 * which): the showcase at `/`, the cockpit at `/globe` and on any errand. This
 * module is the only script the page loads by itself, and it is small on
 * purpose — the showcase must reach its first paint, and a phone must be able
 * to read the whole page, without a byte of Cesium.
 *
 *   - cockpit arrival (`/globe`, a share hash, `?q=`…) → `src/main.js` is
 *     imported and started at once;
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
  decideVitrine,
  forgetVitrineSeen,
  readVitrineSignals,
} from './vitrine/gate.js';
import { DEFAULT_LOCALE, I18N_READY_ATTRIBUTE, getLocale } from './i18n/locale.js';
import bootMessages from './boot.i18n.js';

const decision = decideVitrine(readVitrineSignals());
applyVitrineDecision(decision);
// A browser that met #257 or #258 carries the retired « already seen » key.
// Nothing reads it since the globe got its own address; drop it rather than
// leave a dead entry behind.
forgetVitrineSeen();

/**
 * Translate the static markup when the page is not French.
 *
 * The inline locale gate in `index.html` has already written `<html lang>`.
 * In French there is nothing to do and nothing is fetched: the HTML is the
 * French. Otherwise the applicator arrives as its own small chunk, rewrites
 * every `data-i18n*` element (template contents included) and sets
 * `data-i18n-ready`, which lifts the rule in `style.css` that keeps the
 * loading line hidden until then. The attribute is set even when the chunk
 * fails, so a network error costs the translation, never the loading line.
 *
 * @returns {Promise<void>} resolved once the markup is final.
 */
function translateStaticMarkup() {
  if (getLocale() === DEFAULT_LOCALE) return Promise.resolve();
  return import('./i18n/markup.js')
    .then(({ applyMarkup }) => {
      const { missing } = applyMarkup();
      if (missing.length) console.warn('[boot] markup keys without a translation:', missing.join(', '));
    })
    .catch((error) => console.warn('[boot] the markup could not be translated:', error))
    .finally(() => document.documentElement.setAttribute(I18N_READY_ATTRIBUTE, ''));
}

// Started before the cockpit is even requested, and awaited before it starts:
// the cockpit clones templates and reads labels out of the DOM, and it must
// meet them already translated.
const markupReady = translateStaticMarkup();

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

let loaderSun = null;

/**
 * The loading veil's sun (src/loaderSun.js). Fetched on its own, beside the
 * cockpit rather than inside this module: the showcase never shows the veil
 * and must not carry it. Until it lands the veil shows the mark, still; once
 * the veil lifts it lets go of everything.
 */
function startLoaderSun() {
  loaderSun ??= import('./loaderSun.js')
    .then((module) => {
      module.initLoaderSun();
      return module;
    })
    .catch((error) => console.warn('[boot] the loading sun could not start:', error));
}

/**
 * Start the cockpit.
 * @param {object} [options] Forwarded to `startCockpit` (src/main.js).
 * @returns {Promise<void>}
 */
async function openCockpit(options = {}) {
  startLoaderSun();
  const [{ startCockpit }] = await Promise.all([loadCockpit(), enableCesiumWidgets(), markupReady]);
  return startCockpit(options);
}

/** The loading veil is the only surface left to say that the page broke. */
function reportBootFailure(error) {
  console.error('[boot] the cockpit could not load:', error);
  const status = document.querySelector('#loading-screen .loader-status');
  if (status) {
    void loaderSun?.then((module) => module?.stopLoaderSun());
    status.textContent = bootMessages().failure;
    // Light coral: 6:1 on the veil's green, where #ff4444 read at 3:1.
    status.style.color = '#ffb4a8';
  }
}

if (decision.vitrine) {
  import('./vitrine/vitrine.js')
    .then(({ initVitrine }) => initVitrine({ loadCockpit, openCockpit, onCockpitError: reportBootFailure }))
    .catch((error) => {
      // The showcase still works without its script: the form is a native GET
      // to `/globe?q=`, and every example is a plain link.
      console.error('[boot] the showcase script could not load:', error);
    });
} else {
  openCockpit().catch(reportBootFailure);
}
