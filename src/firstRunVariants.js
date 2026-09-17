// What the first-run card DOES, variant by variant.
//
// src/firstRunExperience.js owns the card: whether it shows, the dialog, the
// keyboard, the yield to screen-claiming surfaces, and closing. This module owns
// the two card bodies and the app state each choice touches:
//
//   A · "Une adresse"     a field. Enter flies to the address; the address
//                         bundle (sales, permits, DPE) switches on where the
//                         camera LANDS.
//   B · "Trois questions" three tiles that switch layers on where the camera
//                         already is, plus "Je regarde par moi-même". No camera
//                         call at all.
//   C · "Pas de carte"    no card: a bubble on the search field. See
//                         src/firstRunHint.js.
//
// Nothing here reads or writes storage, and nothing here decides whether the
// card shows. A choice reports what it did through `emit`, never the text that
// was typed and never a coordinate.

import { canGeolocate } from './geolocate.js';

/**
 * The three address layers A switches on at arrival. All three are
 * `createAddressScanLayer()` layers: they paint 250-600 m around the point the
 * camera settles on, which is exactly the frame a searched address lands in.
 */
export const FIRST_RUN_ADDRESS_BUNDLE = Object.freeze(['dvf-sales', 'ads-fr', 'dpe-fr']);

/**
 * How long A waits for the flight to report its landing before switching the
 * bundle on anyway. A lost hook must not cost the visitor the layers they asked
 * for — the same lesson as BOOT_FLIGHT_DEADLINE_MS in src/bootFlight.js.
 */
export const FIRST_RUN_ARRIVAL_DEADLINE_MS = 10000;

export const FIRST_RUN_VARIANTS = Object.freeze({
  A: Object.freeze({ kind: 'card', bundle: FIRST_RUN_ADDRESS_BUNDLE }),
  B: Object.freeze({
    kind: 'card',
    tiles: Object.freeze({
      sales: Object.freeze({
        layerIds: Object.freeze(['dvf-sales', 'cadastre-fr']),
        // The parcel layer is badged LOURD on a phone (PHONE_HEAVY_LAYER_IDS),
        // so the tile keeps the sales and says so in its subcopy.
        phoneSkipLayerIds: Object.freeze(['cadastre-fr']),
        phoneSubcopy: 'Ventes DVF, 5 ans',
        busyText: 'Allumage : ce que les voisins ont payé…',
      }),
      permits: Object.freeze({
        layerIds: Object.freeze(['ads-fr', 'sitadel-fr']),
        busyText: 'Allumage : ce qui se construit…',
      }),
      live: Object.freeze({
        // `traffic` is already on at boot (DEFAULT_ENABLED_LAYER_IDS): asking
        // again is the manager's idempotent path and costs nothing.
        layerIds: Object.freeze(['traffic', 'transit-fr', 'flights']),
        busyText: 'Allumage : ce qui bouge maintenant…',
      }),
      explore: Object.freeze({ layerIds: Object.freeze([]) }),
    }),
  }),
  C: Object.freeze({ kind: 'hint' }),
});

/**
 * The layers one B tile switches on, for this shell.
 * @param {{layerIds?: string[], phoneSkipLayerIds?: string[]}|null|undefined} tile
 * @param {boolean} [phoneShell]
 * @returns {string[]}
 */
export function tileLayerIds(tile, phoneShell = false) {
  const ids = tile?.layerIds || [];
  if (!phoneShell) return [...ids];
  const skip = new Set(tile.phoneSkipLayerIds || []);
  return ids.filter((layerId) => !skip.has(layerId));
}

/**
 * Every layer a variant can switch on — what the voice-enum pin checks.
 * @param {string} variant
 * @param {{phoneShell?: boolean}} [options]
 * @returns {string[]}
 */
export function variantLayerIds(variant, { phoneShell = false } = {}) {
  const entry = Object.hasOwn(FIRST_RUN_VARIANTS, variant) ? FIRST_RUN_VARIANTS[variant] : null;
  if (entry?.bundle) return [...entry.bundle];
  if (entry?.tiles) {
    return [...new Set(Object.values(entry.tiles).flatMap((tile) => tileLayerIds(tile, phoneShell)))];
  }
  return [];
}

/** Switch every id on, together; report the ones that refused or threw. */
async function enableLayers(layerIds, setLayerEnabled) {
  const outcomes = await Promise.all(layerIds.map(async (layerId) => {
    try {
      return { layerId, ok: (await setLayerEnabled(layerId)) !== false };
    } catch {
      return { layerId, ok: false };
    }
  }));
  return outcomes.filter((entry) => !entry.ok).map((entry) => entry.layerId);
}

/**
 * Run one B tile. Layers only: a tile never moves the camera.
 *
 * A refused layer fails the tile BY NAME, so the card can say which one and
 * stay open for a retry instead of stranding the visitor.
 *
 * @param {string} choice Key of FIRST_RUN_VARIANTS.B.tiles.
 * @param {object} deps
 * @param {(layerId: string) => Promise<boolean|undefined>} deps.setLayerEnabled
 * @param {boolean} [deps.phoneShell]
 * @returns {Promise<{ok: boolean, choice: string, layerIds?: string[], failedLayerIds?: string[]}>}
 */
export async function runFirstRunTile(choice, { setLayerEnabled, phoneShell = false }) {
  const tiles = FIRST_RUN_VARIANTS.B.tiles;
  const tile = Object.hasOwn(tiles, choice) ? tiles[choice] : null;
  if (!tile) return { ok: false, choice };
  const layerIds = tileLayerIds(tile, phoneShell);
  const failedLayerIds = await enableLayers(layerIds, setLayerEnabled);
  return { ok: failedLayerIds.length === 0, choice, layerIds, failedLayerIds };
}

/**
 * Start a flight, then switch the bundle on where it LANDS.
 *
 * Switching the layers on first and flying second is what the manager prefers
 * for territorial layers — but these three scan around the camera on their own
 * `moveEnd`, so turning them on over Paris before a flight to Marseille buys a
 * Paris scan nobody will see. So: on arrival.
 *
 * `startFlight(onArrival)` resolves when the flight STARTS, with the seam's
 * status (`flying`, `not-found`, `failed`, `refused`, `cancelled`,
 * `superseded`). Only `flying` goes on to touch a layer. The bundle is then
 * switched on exactly ONCE, at the first of: `onArrival('arrived')`,
 * `onArrival('cancelled')` — the visitor chose the layers, not the landing
 * spot, so a flight they interrupted still gets them — or the deadline.
 *
 * @param {(onArrival: (why: string) => void) => Promise<{status: string, label?: string, message?: string}>} startFlight
 * @param {object} deps
 * @param {(layerId: string) => Promise<boolean|undefined>} deps.setLayerEnabled
 * @param {string[]} [deps.layerIds]
 * @param {Function} [deps.setTimer]
 * @param {Function} [deps.clearTimer]
 * @param {number} [deps.deadlineMs]
 * @returns {Promise<{ok: boolean, status: string, label?: string, message?: string,
 *   layerIds?: string[], arrival?: Promise<{why: string, failedLayerIds: string[]}>}>}
 */
export async function runFirstRunFlight(startFlight, {
  setLayerEnabled,
  layerIds = FIRST_RUN_ADDRESS_BUNDLE,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
  deadlineMs = FIRST_RUN_ARRIVAL_DEADLINE_MS,
} = {}) {
  // A hook can in principle fire before the start resolves; keep the first
  // answer and apply it once the flight is known to be ours.
  let early = null;
  let settle = null;
  const onArrival = (why) => {
    if (settle) settle(why);
    else if (early === null) early = why;
  };

  let started;
  try {
    started = await startFlight(onArrival);
  } catch (error) {
    console.warn('[First run] Flight could not start:', error);
    return { ok: false, status: 'failed' };
  }
  const status = started?.status || 'failed';
  if (status !== 'flying') return { ok: false, status, message: started?.message };

  const bundle = [...layerIds];
  const arrival = new Promise((resolve) => {
    let done = false;
    let timer = null;
    settle = (why) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimer(timer);
      resolve(enableLayers(bundle, setLayerEnabled).then((failedLayerIds) => ({ why, failedLayerIds })));
    };
    if (early !== null) {
      settle(early);
      return;
    }
    timer = setTimer(() => settle('deadline'), deadlineMs) ?? null;
  });
  return { ok: true, status, label: started.label, layerIds: bundle, arrival };
}

const NOT_FOUND_TEXT = 'Introuvable. Essayez une commune ou une adresse plus précise.';
const FAILED_TEXT = 'La recherche a échoué. Réessayez, ou regardez autour d’ici.';

/** addEventListener that remembers how to undo itself. */
function listener(cleanups) {
  return (node, type, handler) => {
    if (!node) return;
    node.addEventListener(type, handler);
    cleanups.push(() => node.removeEventListener(type, handler));
  };
}

/**
 * Wire variant A: the address field, its three chips, the look-around link.
 * @param {object} ctx See initFirstRunExperience.
 * @returns {{focusTarget: HTMLElement|null, teardown: Function}}
 */
export function mountVariantA(ctx) {
  const { root, styleManager, setBusy, setStatus, dismiss, emit, phoneShell, setLayerEnabled } = ctx;
  const form = root.querySelector('[data-first-run-form]');
  const field = root.querySelector('[data-first-run-address]');
  const locate = root.querySelector('[data-first-run-chip="locate"]');
  const places = [...root.querySelectorAll('[data-first-run-chip]')].filter((chip) => chip !== locate);
  const lookAround = root.querySelector('[data-first-run-look-around]');
  const cleanups = [];
  const listen = listener(cleanups);

  // Offered only where it can work: over plain HTTP every browser refuses.
  if (locate && canGeolocate()) locate.hidden = false;

  const launch = async (kind, busyText, startFlight, queryLength = null) => {
    if (ctx.isBusy()) return;
    setBusy(true, busyText);
    const outcome = await runFirstRunFlight(startFlight, { setLayerEnabled });
    const length = queryLength === null ? {} : { queryLength };
    if (outcome.ok) {
      emit({ type: 'action', kind, outcome: 'found', ...length, layerIds: outcome.layerIds });
      // The flight has just STARTED: the visitor watches it, not the card.
      dismiss({ reason: 'choice' });
      return;
    }
    const answered = outcome.status === 'not-found' || outcome.status === 'failed';
    emit({ type: 'action', kind, outcome: answered ? 'not-found' : 'cancelled', ...length });
    if (ctx.isClosed()) return;
    if (outcome.status === 'not-found') setStatus(NOT_FOUND_TEXT);
    // A refused geolocation brings its own French sentence (geolocate.js).
    else if (outcome.status === 'failed') setStatus(outcome.message || FAILED_TEXT);
    setBusy(false);
    if (answered && field) {
      field.focus({ preventScroll: true });
      field.select?.();
    }
  };

  const go = (query, kind) => {
    const text = String(query || '').trim();
    if (!text) {
      field?.focus({ preventScroll: true });
      return;
    }
    void launch(
      kind,
      `Recherche de « ${text} »…`,
      (onArrival) => styleManager.flyToAddress(text, { onArrival }),
      text.length,
    );
  };

  listen(form, 'submit', (event) => {
    event.preventDefault();
    go(field?.value, 'address');
  });
  // The app binds bare letters globally (styles, detection). Typing an address
  // must never reach them; Échap and Tab still go to the card's own handler.
  listen(field, 'keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  });
  for (const chip of places) {
    listen(chip, 'click', () => {
      if (ctx.isBusy()) return;
      const query = chip.dataset.firstRunChip;
      if (field) field.value = query;
      go(query, 'chip');
    });
  }
  listen(locate, 'click', () => {
    void launch(
      'geoloc',
      'Position en cours…',
      (onArrival) => styleManager.locateMe({ onArrival, notify: false }),
    );
  });
  listen(lookAround, 'click', () => {
    if (ctx.isBusy()) return;
    emit({ type: 'action', kind: 'explore', outcome: 'found' });
    dismiss({ reason: 'choice' });
  });

  return {
    // No autofocus on a phone: the soft keyboard would cover the sheet.
    focusTarget: phoneShell ? null : field,
    teardown: () => { for (const undo of cleanups.splice(0)) undo(); },
  };
}

/**
 * Wire variant B: four tiles, layers only.
 * @param {object} ctx See initFirstRunExperience.
 * @returns {{focusTarget: HTMLElement|null, teardown: Function}}
 */
export function mountVariantB(ctx) {
  const { root, setBusy, setStatus, dismiss, emit, phoneShell, setLayerEnabled } = ctx;
  const tiles = FIRST_RUN_VARIANTS.B.tiles;
  const buttons = [...root.querySelectorAll('[data-first-run-choice]')];
  const cleanups = [];
  const listen = listener(cleanups);

  if (phoneShell) {
    for (const button of buttons) {
      const choice = button.dataset.firstRunChoice;
      const tile = Object.hasOwn(tiles, choice) ? tiles[choice] : null;
      const small = button.querySelector('small');
      if (tile?.phoneSubcopy && small) small.textContent = tile.phoneSubcopy;
    }
  }

  const onChoice = async (event) => {
    if (ctx.isBusy()) return;
    const choice = event.currentTarget?.dataset?.firstRunChoice;
    if (!Object.hasOwn(tiles, choice)) return;
    setBusy(true, tiles[choice].busyText);
    let outcome = null;
    try {
      outcome = await runFirstRunTile(choice, { setLayerEnabled, phoneShell });
    } catch (error) {
      console.warn('[First run] Tile failed:', error);
    }
    const kind = `tile:${choice}`;
    const layerIds = outcome?.layerIds || [];
    if (outcome?.ok) {
      emit({ type: 'action', kind, outcome: 'found', layerIds });
      dismiss({ reason: 'choice' });
      return;
    }
    emit({ type: 'action', kind, outcome: 'cancelled', layerIds });
    if (ctx.isClosed()) return;
    const failed = outcome?.failedLayerIds?.length ? outcome.failedLayerIds.join(', ') : 'ces couches';
    setStatus(`Impossible d’allumer ${failed}. Réessayez, ou regardez par vous-même.`);
    setBusy(false);
  };
  for (const button of buttons) listen(button, 'click', onChoice);

  return {
    focusTarget: buttons[0] || null,
    teardown: () => { for (const undo of cleanups.splice(0)) undo(); },
  };
}
