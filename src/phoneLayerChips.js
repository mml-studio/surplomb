/**
 * The row of layer chips under the phone's search bar.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * Owner field report, 2026-09-19: on a phone, switching a layer on or off
 * meant opening Couches, scrolling past eight basemap buttons, and finding the
 * row. Readers switch layers far more often than basemaps, and the one strip
 * that existed to make that fast was below the fold of the tab it lived in.
 *
 * Google Maps answers the same question with a row of chips under its search
 * bar: one tap, no sheet. This is that row, for layers:
 *
 *   - the eight « À LA UNE » layers, in a FIXED order, lit in place when on —
 *     a chip that jumped to the front under the thumb that pressed it would be
 *     a chip the reader has to look for again;
 *   - any other lit row IN FRONT of them, in the order it was switched on, so
 *     a layer lit from the full list can be switched off from here too;
 *   - one last chip that opens the full list.
 *
 * ── ONE PATH TO A LAYER ─────────────────────────────────────────────────────
 *
 * A chip calls `dataManager.toggleRow()`, which is what the row's own button
 * does. State is read back from `getPanelRowStates()` on every visibility
 * notification — the chip is a view, never a second copy, so a layer switched
 * off by voice, by a share link or by « Tout éteindre » goes dark here too.
 *
 * @module phoneLayerChips
 */

import { PHONE_FEATURED_LAYER_IDS, PHONE_LAYER_CHIP_LABELS } from './phoneSheetLayout.js';

/** Class of every chip in the row, the « all layers » one included. */
export const PHONE_LAYER_CHIP_CLASS = 'phone-layer-chip';

/**
 * Which chips, in which order, and how each one reads. Pure.
 *
 * @param {Array<{id: string, label?: string, icon?: ?string, iconGlyph?: ?string,
 *   enabled?: boolean, transitioning?: boolean}>} rows - `getPanelRowStates()`.
 * @param {object} [options]
 * @param {string[]} [options.featured] - The fixed chips, in order.
 * @param {string[]} [options.litOrder] - Ids in the order they were switched
 *   on; decides the order of the lit, non-featured chips in front.
 * @param {Record<string, string>} [options.labels] - Short labels.
 * @returns {Array<{id: string, label: string, title: string, icon: ?string,
 *   iconGlyph: ?string, active: boolean, busy: boolean, featured: boolean}>}
 */
export function phoneLayerChipModels(rows, {
  featured = PHONE_FEATURED_LAYER_IDS,
  litOrder = [],
  labels = PHONE_LAYER_CHIP_LABELS,
} = {}) {
  const byId = new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id)
    .map((row) => [row.id, row]));
  const featuredSet = new Set(featured);
  const model = (row, isFeatured) => {
    const full = String(row.label || row.id);
    const label = labels[row.id] || full;
    return {
      id: row.id,
      label,
      title: `${row.enabled ? 'Éteindre' : 'Allumer'} — ${full}`,
      icon: row.icon ?? null,
      iconGlyph: row.iconGlyph ?? null,
      active: row.enabled === true,
      busy: row.transitioning === true,
      featured: isFeatured,
    };
  };

  const rank = new Map(litOrder.map((id, index) => [id, index]));
  const litOthers = [...byId.values()]
    .filter((row) => row.enabled === true && !featuredSet.has(row.id))
    // Unknown order sorts last, and stably: a row lit before this module
    // started (a share link, a restored session) has no position yet.
    .map((row, index) => ({ row, index, at: rank.has(row.id) ? rank.get(row.id) : Infinity }))
    .sort((a, b) => (a.at - b.at) || (a.index - b.index))
    .map(({ row }) => model(row, false));

  const fixed = featured
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row) => model(row, true));

  return [...litOthers, ...fixed];
}

/**
 * Keep the switch-on order of the lit rows: append what just lit, drop what
 * went dark. Pure; returns a new array.
 * @param {string[]} previous
 * @param {Array<{id: string, enabled?: boolean}>} rows
 * @returns {string[]}
 */
export function nextLitOrder(previous, rows) {
  const lit = new Set((Array.isArray(rows) ? rows : [])
    .filter((row) => row?.enabled === true)
    .map((row) => row.id));
  const kept = (previous || []).filter((id) => lit.has(id));
  const known = new Set(kept);
  for (const id of lit) if (!known.has(id)) kept.push(id);
  return kept;
}

/**
 * Mount the row and keep it in step with the manager.
 *
 * CHIPS ARE KEPT, NOT REBUILT — the same rule as the panel's active strip:
 * rebuilding on every notification would destroy the button under the thumb
 * that is pressing it. A chip is created once per id and only re-ordered,
 * relabelled and re-lit afterwards.
 *
 * @param {object} options
 * @param {HTMLElement|null} options.host - `#phone-layer-chips`.
 * @param {object|null} options.dataManager - Needs `getPanelRowStates`,
 *   `toggleRow` and `subscribe`.
 * @param {() => void} [options.onOpenAll] - The last chip: open the full list.
 * @returns {{sync: () => void, destroy: () => void}|null}
 */
export function mountPhoneLayerChips({ host, dataManager, onOpenAll = () => {} } = {}) {
  if (!host || typeof dataManager?.getPanelRowStates !== 'function') return null;
  const doc = host.ownerDocument;
  const chips = new Map();
  let litOrder = [];

  const allChip = doc.createElement('button');
  allChip.type = 'button';
  allChip.className = `${PHONE_LAYER_CHIP_CLASS} is-all`;
  allChip.dataset.phoneLayerChip = 'all';
  allChip.textContent = 'Toutes les couches';
  allChip.title = 'Ouvrir la liste des couches';
  allChip.addEventListener('click', () => onOpenAll());

  const buildChip = (id) => {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = PHONE_LAYER_CHIP_CLASS;
    chip.dataset.phoneLayerChip = id;
    const icon = doc.createElement('span');
    icon.className = 'phone-layer-chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    const name = doc.createElement('span');
    name.className = 'phone-layer-chip-name';
    chip.append(icon, name);
    chip.addEventListener('click', () => {
      // The chip is its own busy light until the manager settles, like the
      // row button it stands in for; `sync` re-reads the truth afterwards.
      chip.dataset.pending = '1';
      chip.disabled = true;
      Promise.resolve(dataManager.toggleRow(id))
        .catch((error) => console.warn(`[phone chips] ${id} toggle error:`, error))
        .finally(() => {
          delete chip.dataset.pending;
          sync();
        });
    });
    return chip;
  };

  const paint = (chip, model) => {
    const name = chip.querySelector('.phone-layer-chip-name');
    if (name && name.textContent !== model.label) name.textContent = model.label;
    const icon = chip.querySelector('.phone-layer-chip-icon');
    if (icon) {
      // A taxonomy glyph is a data URI the CSS masks with `currentColor`, like
      // the panel row's; otherwise the module's own character.
      icon.classList.toggle('has-glyph', Boolean(model.iconGlyph));
      if (model.iconGlyph) {
        icon.style.setProperty('--phone-chip-glyph', `url("${model.iconGlyph}")`);
        icon.textContent = '';
      } else {
        icon.style.removeProperty('--phone-chip-glyph');
        icon.textContent = model.icon || '';
      }
    }
    chip.classList.toggle('active', model.active);
    chip.classList.toggle('busy', model.busy);
    chip.setAttribute('aria-pressed', String(model.active));
    chip.title = model.title;
    chip.disabled = model.busy || chip.dataset.pending === '1';
  };

  function sync() {
    const rows = dataManager.getPanelRowStates();
    litOrder = nextLitOrder(litOrder, rows);
    const models = phoneLayerChipModels(rows, { litOrder });
    const wanted = new Set(models.map((model) => model.id));
    for (const [id, chip] of chips) {
      if (!wanted.has(id)) {
        chip.remove();
        chips.delete(id);
      }
    }
    // Moved only when out of place: re-inserting a node that is already where
    // it belongs would still blur it and cancel a press in progress.
    let cursor = host.firstChild;
    for (const model of [...models, null]) {
      let chip = allChip;
      if (model) {
        chip = chips.get(model.id);
        if (!chip) {
          chip = buildChip(model.id);
          chips.set(model.id, chip);
        }
        paint(chip, model);
      }
      if (chip === cursor) cursor = cursor.nextSibling;
      else host.insertBefore(chip, cursor);
    }
  }

  const unsubscribe = typeof dataManager.subscribe === 'function'
    ? dataManager.subscribe((change) => {
      if (String(change?.type || '').startsWith('visibility')) sync();
    })
    : () => {};

  sync();

  return {
    sync,
    destroy() {
      unsubscribe();
      host.replaceChildren();
      chips.clear();
    },
  };
}
