// MAP STACK source chips — the always-visible replacement for the `<select>`
// that used to sit in the Map Stack panel. One button per stack, rendered from
// `MapStackController.getStacks()`. The eight accepted sources below are
// the whole shipped set; keeping the allowlist explicit means a stack added to
// `MAP_STACKS` for internal use cannot reach the tray until someone names it
// here.
//
// Order groups by what a source COSTS the operator, not by age: the five that
// need a credential first (Google 3D, the two Google 2D stacks, the two
// Bing/ion stacks), then the three keyless ones (OSM worldwide, then the two
// IGN France stacks). With eight sources on the tray's three-column desktop
// grid the groups no longer line up with the rows — OSM shares row 2 with the
// Bing pair — so the order is the grouping, not the layout.
//
// The two Google 2D chips sit next to Google 3D on purpose: they run on the
// SAME key, and on an EEA billing address they are the ones that actually
// work — so an operator staring at a greyed-out "Google 3D" finds the live
// Google alternative in the same glance rather than concluding Google is out.
//
// The chips are a control SURFACE only: selecting one calls back into the same
// `_setMapStack()` path the dropdown's `change` handler used, and the active
// state is re-synced from controller state (never optimistically), so a failed
// or superseded switch still leaves the truly-active stack lit.
//
// LOCKED is not UNAVAILABLE. A data layer can hold the globe on one stack
// while it is lit (`basemapLock.js`, « Infrastructure numérique » → Satellite),
// and the other chips grey out for as long as it does. Availability is fixed
// for the session and rendered once; the lock comes and goes with the layer,
// so it is painted by `syncMapStackChips` and read at CLICK time, never baked
// into the handler.

import messages from './mapStackChips.i18n.js';

export const MAP_STACK_CHIP_CLASS = 'map-stack-chip';
export const PRESENTED_MAP_STACK_IDS = Object.freeze([
  'photoreal',
  'google-roadmap',
  'google-terrain',
  'bing-aerial',
  'bing-labels',
  'osm',
  'ign-ortho',
  'ign-plan',
]);

/**
 * Presentation model for one map-stack chip.
 *
 * Unavailable is NOT the same as needs-an-ion-token: `photoreal` is unavailable
 * whenever the Google tileset failed to load (the startup fallback-to-OSM
 * case), and a future stack may have its own reason. The ION badge is therefore
 * gated on the stack's own `requiresIon` flag, and the tooltip quotes the
 * controller's `unavailableReason` rather than assuming one.
 * An AVAILABLE stack can still be partial: the IGN sources cover metropolitan
 * France and nothing else, and picking one over Texas changes the globe not at
 * all. Their `coverageNote` rides into the tooltip so the tray says that
 * BEFORE the click rather than leaving the operator to conclude the chip is
 * broken. It is not a disabled state — the stack really is selectable.
 * @param {{id: string, label: string, available?: boolean, requiresIon?: boolean, unavailableReason?: string|null, coverageNote?: string|null}} stack - Stack descriptor from `getStacks()`.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {{id: string, label: string, available: boolean, active: boolean, requiresIon: boolean, requirement: string, unavailableHint: string, coverageNote: string, title: string}}
 */
export function mapStackChipModel(stack, activeId) {
  const available = stack?.available !== false;
  const label = String(stack?.label ?? stack?.id ?? '');
  const coverageNote = String(stack?.coverageNote || '');
  const m = messages();
  const requiresIon = stack?.requiresIon === true;
  const fallbackReason = requiresIon
    ? m.ionRequired
    : m.stackUnavailable(label || m.thisStack);
  const unavailableHint = available ? '' : String(stack?.unavailableReason || fallbackReason);
  return {
    id: String(stack?.id ?? ''),
    label,
    available,
    active: !!stack?.id && stack.id === activeId,
    requiresIon,
    // Dropdown parity: unavailable options read "<label> · ion key". A chip has
    // no room for that, so an ion-backed stack gets a compact badge; every
    // unavailable chip carries the real reason in its tooltip.
    requirement: !available && requiresIon ? 'ION' : '',
    unavailableHint,
    coverageNote,
    title: available
      ? (coverageNote ? `${label} — ${coverageNote}` : label)
      : unavailableHint,
  };
}

/** The model each rendered chip was built from, so a re-sync can undo a lock. */
const chipModels = new WeakMap();

/** The layer a lock names, in the page's language (`setLock` resolved it). */
const lockLayerName = (lock) => String(lock?.rowLabel || lock?.rowId || '');

/**
 * The accessible name a chip carries when nothing holds it — see the render
 * loop below for why only two kinds of chip need one.
 * @param {object} model - {@link mapStackChipModel} output.
 * @returns {string} Empty when the button text is already the name.
 */
function chipAriaLabel(model) {
  if (!model.available) return messages().unavailableAriaLabel(model.label, model.unavailableHint);
  if (model.coverageNote) return messages().coverageAriaLabel(model.label, model.coverageNote);
  return '';
}

/**
 * Grey a chip out while a lock holds another stack, or give it back its own
 * state once the lock is released.
 *
 * An UNAVAILABLE chip keeps its own reason in its tooltip: it will still be
 * unavailable once the layer is off, and the lock is not why.
 * @param {object} chip - Rendered chip button.
 * @param {object} model - The model it was rendered from.
 * @param {?{stackId: string, rowId?: string, rowLabel?: string}} lock
 * @returns {void}
 */
function paintChipLock(chip, model, lock) {
  const locked = Boolean(lock?.stackId) && model.id !== lock.stackId;
  chip.classList?.toggle('locked', locked);
  chip.setAttribute?.('aria-disabled', String(locked || !model.available));
  if (locked && model.available) {
    const layer = lockLayerName(lock);
    chip.title = messages().lockedHint(layer);
    chip.setAttribute?.('aria-label', messages().lockedAriaLabel(model.label, layer));
    return;
  }
  chip.title = model.title;
  const ariaLabel = chipAriaLabel(model);
  if (ariaLabel) chip.setAttribute?.('aria-label', ariaLabel);
  else chip.removeAttribute?.('aria-label');
}

/**
 * The sentence under the tray while a layer holds the globe on one stack.
 * @param {?{stackId: string, rowId?: string, rowLabel?: string}} lock
 * @param {Array<object>} [stacks] - `getStacks()` output, for the stack's name.
 * @returns {string} Empty when nothing holds the globe.
 */
export function mapStackLockNote(lock, stacks = []) {
  if (!lock?.stackId) return '';
  const stack = (Array.isArray(stacks) ? stacks : []).find((entry) => entry?.id === lock.stackId);
  return messages().lockNote(String(stack?.label ?? lock.stackId), lockLayerName(lock));
}

/**
 * @param {Array<object>} stacks - `MapStackController.getStacks()` output.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {Array<object>} One chip model per approved presentation id, in
 *   `PRESENTED_MAP_STACK_IDS` order; internal and future stacks stay hidden.
 */
export function mapStackChipModels(stacks, activeId) {
  const stacksById = new Map((Array.isArray(stacks) ? stacks : [])
    .map((stack) => [stack?.id, stack]));
  return PRESENTED_MAP_STACK_IDS
    .map((id) => stacksById.get(id))
    .filter(Boolean)
    .map((stack) => mapStackChipModel(stack, activeId));
}

/**
 * Renders the chip row into `container`, replacing any previous chips.
 * @param {HTMLElement} container - Row element.
 * @param {Array<object>} stacks - `MapStackController.getStacks()` output.
 * @param {object} [options]
 * @param {string|null} [options.activeId] - Currently active stack id.
 * @param {(stackId: string) => void} [options.onSelect] - Selection callback.
 * @param {?object} [options.lock] - The controller's lock, if one holds.
 * @param {Document} [options.doc] - Document override (tests).
 * @returns {Array<object>} The rendered chip models.
 */
export function renderMapStackChips(container, stacks, {
  activeId = null,
  onSelect = null,
  lock = null,
  doc,
} = {}) {
  if (!container) return [];
  const ownerDoc = doc || container.ownerDocument || globalThis.document;
  if (!ownerDoc?.createElement) return [];

  container.innerHTML = '';
  const models = mapStackChipModels(stacks, activeId);

  for (const model of models) {
    const chip = ownerDoc.createElement('button');
    chip.type = 'button';
    chip.className = [
      MAP_STACK_CHIP_CLASS,
      model.active ? 'active' : '',
      model.available ? '' : 'unavailable',
    ].filter(Boolean).join(' ');
    chip.dataset.stackId = model.id;
    chip.setAttribute('aria-pressed', String(model.active));
    // Title, `aria-disabled` and the accessible name. An unavailable chip reads
    // its reason; a partial-coverage one says where it works, because a
    // `title` alone is mouse-only and it is not "unavailable"; a locked one
    // names the layer holding the globe.
    chipModels.set(chip, model);
    paintChipLock(chip, model, lock);

    const label = ownerDoc.createElement('span');
    label.className = 'map-stack-chip-label';
    label.textContent = model.label;
    chip.appendChild(label);

    if (model.requirement) {
      const requirement = ownerDoc.createElement('span');
      requirement.className = 'map-stack-chip-req';
      requirement.textContent = model.requirement;
      chip.appendChild(requirement);
    }

    chip.addEventListener('click', () => {
      if (!model.available || chip.classList?.contains?.('locked')) return;
      onSelect?.(model.id);
    });
    container.appendChild(chip);
  }

  return models;
}

/**
 * Re-points the active chip at controller state, and greys out or restores the
 * chips a lock holds. Availability never changes at runtime (it tracks the ion
 * token), so it is left as rendered.
 * @param {HTMLElement} container - Row element.
 * @param {string|null} activeId - Currently active stack id.
 * @param {?object} [lock] - The controller's lock, or null once released.
 * @returns {void}
 */
export function syncMapStackChips(container, activeId, lock = null) {
  const chips = container?.children;
  if (!chips) return;
  for (const chip of Array.from(chips)) {
    const stackId = chip?.dataset?.stackId;
    if (!stackId) continue;
    const active = stackId === activeId;
    chip.classList?.toggle('active', active);
    chip.setAttribute?.('aria-pressed', String(active));
    const model = chipModels.get(chip);
    if (model) paintChipLock(chip, model, lock);
  }
}
