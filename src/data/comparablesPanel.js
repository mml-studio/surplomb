import {
  attachPanelDrag,
  clearPanelPosition,
  restorePanelPosition,
} from '../panelDrag.js';
import {
  distanceMetres,
  dossierLines,
  dossierSummary,
  emptyDossier,
  exportDossierJson,
  frenchDate,
  importDossierJson,
  mergeComparables,
  parseNumber,
  safeListingUrl,
} from './comparablesDossier.js';

/**
 * Le dossier — the screen the competitor's whole comparables module turns out
 * to be, and the only place in this application a reader types a price.
 *
 * WHY A PANEL AND NOT A ROW OF CHIPS. Every other French layer answers a
 * question with data somebody else published; this one has to ASK. A property
 * with its surface, a listing with its price, an address to geocode — none of
 * that fits in the chip strip the data panel gives a layer, so the panel is
 * layer-owned and self-mounting, the same idiom as `veloPulseHud.js` and the
 * space mission detail panel: it exists only while the layer is on, and costs
 * `index.html` nothing for the thirty layers that do not need it.
 *
 * WHAT IT REFUSES TO DO, VISIBLY. There is no "import from a portal" button and
 * there never will be. The URL field stores a link and the application never
 * requests it — see `comparablesDossier.js` for the four decisions and the
 * three judgments behind that. The footer says so in one line, because a tool
 * that quietly did the other thing would look exactly the same from here.
 *
 * TWO WAYS IN, BOTH FREE. Type a listing, or import a file. The import accepts
 * an agency's own export — a bare array of listings — because an agent owns the
 * listings they publish and their back-office already exports them; that is a
 * consent, not an extraction. It MERGES rather than replaces, so an import can
 * never silently destroy a dossier somebody spent an afternoon building.
 *
 * NOTHING IN HERE IS BUILT WITH `innerHTML` EXCEPT THE STATIC SHELL. Every row
 * carries text a user typed, and it is written with `textContent`. A listing
 * label is the most obviously attacker-controlled string in this repository.
 *
 * @module data/comparablesPanel
 */

import { formatDecimal, formatNumber } from '../i18n/format.js';
import messages from './comparablesPanel.i18n.js';

export const COMPARABLES_PANEL_ID = 'comparables-panel';

/** A count, grouped the way the reader's language groups one. */
const _fr = { format: (value) => formatNumber(value) };
/** Surfaces keep one decimal, here and on the card — same field, same number. */
const _surface = { format: (value) => formatDecimal(value, 1) };

/** How long the destructive button stays armed after the first press, in ms. */
const CONFIRM_WINDOW_MS = 4000;

/** Dwelling types offered, in the register's own words — DVF says these two. */
// i18n-ignore-next-line — DVF's own `type_local` values, stored and exported
const TYPES = Object.freeze(['Appartement', 'Maison', 'Terrain', 'Local']);

/**
 * The static shell, built once per mount.
 *
 * A FUNCTION rather than a constant, because the words come from the catalog
 * and a catalog read while the module loads is the one thing the i18n ratchet
 * holds at zero. Everything below the shell is written with `textContent`:
 * every row carries text a user typed, and a listing label is the most
 * obviously attacker-controlled string in this repository.
 * @returns {string}
 */
function panelMarkup() {
  const m = messages().shell;
  return `
  <div class="cmp-head" data-cmp-grip title="${m.gripTitle}">
    <span class="cmp-grip" aria-hidden="true"></span>
    <span class="cmp-title">${m.title}</span>
    <span class="cmp-count" data-cmp-count></span>
  </div>

  <section class="cmp-block cmp-subject">
    <div class="cmp-block-head">${m.subjectHead}</div>
    <p class="cmp-subject-label" data-cmp-subject-label>${messages().summary.noSubject}</p>
    <div class="cmp-row">
      <input type="text" class="cmp-input cmp-grow" data-cmp-address
             placeholder="${m.addressPlaceholder}" autocomplete="off" spellcheck="false" />
      <button type="button" class="cmp-btn" data-cmp-geocode title="${m.geocodeTitle}">↵</button>
      <button type="button" class="cmp-btn" data-cmp-here title="${m.hereTitle}">${m.here}</button>
    </div>
    <div class="cmp-row">
      <input type="text" class="cmp-input cmp-narrow" data-cmp-surface placeholder="m²" inputmode="decimal" />
      <input type="text" class="cmp-input cmp-narrow" data-cmp-rooms placeholder="${m.roomsPlaceholder}" inputmode="numeric" />
      <select class="cmp-input cmp-grow" data-cmp-type></select>
    </div>
  </section>

  <section class="cmp-block">
    <div class="cmp-block-head">${m.linesHead}</div>
    <ul class="cmp-lines" data-cmp-lines></ul>
  </section>

  <section class="cmp-block">
    <div class="cmp-block-head">${m.retainedHead} <span class="cmp-sub" data-cmp-retained-count></span></div>
    <ul class="cmp-list" data-cmp-retained></ul>
  </section>

  <section class="cmp-block">
    <div class="cmp-block-head">${m.poolHead} <span class="cmp-sub" data-cmp-pool-count></span></div>
    <ul class="cmp-list cmp-pool" data-cmp-pool></ul>
  </section>

  <section class="cmp-block">
    <div class="cmp-block-head">${m.addHead}</div>
    <div class="cmp-row">
      <input type="text" class="cmp-input cmp-grow" data-cmp-new-address
             placeholder="${m.newAddressPlaceholder}" autocomplete="off" spellcheck="false" />
    </div>
    <div class="cmp-row">
      <input type="text" class="cmp-input cmp-narrow" data-cmp-new-price placeholder="${m.pricePlaceholder}" inputmode="decimal" />
      <input type="text" class="cmp-input cmp-narrow" data-cmp-new-surface placeholder="m²" inputmode="decimal" />
      <input type="text" class="cmp-input cmp-narrow" data-cmp-new-rooms placeholder="${m.roomsPlaceholder}" inputmode="numeric" />
      <select class="cmp-input cmp-narrow" data-cmp-new-type></select>
    </div>
    <div class="cmp-row">
      <input type="text" class="cmp-input cmp-grow" data-cmp-new-url
             placeholder="${m.urlPlaceholder}" autocomplete="off" spellcheck="false" />
      <button type="button" class="cmp-btn cmp-btn-primary" data-cmp-add>${m.add}</button>
    </div>
    <p class="cmp-status" data-cmp-status role="status" aria-live="polite"></p>
  </section>

  <div class="cmp-foot">
    <button type="button" class="cmp-btn" data-cmp-export>${m.export}</button>
    <button type="button" class="cmp-btn" data-cmp-import>${m.import}</button>
    <button type="button" class="cmp-btn cmp-btn-danger" data-cmp-clear>${m.clear}</button>
    <input type="file" data-cmp-file accept="application/json,.json" hidden />
  </div>
  <p class="cmp-provenance">
    ${m.provenance}
    <br />${m.provenanceOutbound}
  </p>
`;
}

/** Whether there is a document to mount into. */
function canMount() {
  return typeof document !== 'undefined' && Boolean(document.body);
}

/** A `<option>` list, same two registers everywhere. */
function fillTypes(select, withEmpty = true) {
  if (!select) return;
  const options = withEmpty ? ['', ...TYPES] : TYPES;
  select.replaceChildren(...options.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value || messages().shell.typePlaceholder;
    return option;
  }));
}

/**
 * Geocode a typed address through the app's own proxy.
 *
 * The proxy, and not the BAN directly, because it is already rate-limited,
 * cached and keyless — and because a geocode is the ONLY outbound request this
 * panel ever makes. The address the reader typed is the only thing that leaves
 * the machine, and it leaves it to be turned into a coordinate.
 *
 * @param {string} query
 * @param {typeof fetch} [impl]
 * @returns {Promise<?{lat: number, lon: number, label: ?string}>}
 */
export async function geocodeAddress(query, impl = fetch) {
  const text = String(query ?? '').trim();
  if (text.length < 3) return null;
  try {
    const response = await impl(`/api/geocode?q=${encodeURIComponent(text)}&lang=fr`);
    if (!response?.ok) return null;
    const payload = await response.json();
    const result = payload?.result;
    if (!result || !Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return null;
    return { lat: result.lat, lon: result.lon, label: result.label ?? text };
  } catch {
    return null;
  }
}

/**
 * The address of a coordinate, for the property posed from the camera.
 *
 * The same reverse call the fiche makes, and it is allowed to fail: a property
 * posed with no label is still a property, and the panel prints its coordinate
 * rather than pretending to an address it does not have.
 *
 * @param {{lat: number, lon: number}} point
 * @param {typeof fetch} [impl]
 * @returns {Promise<?{label: ?string, commune: ?string}>}
 */
export async function reverseAddress(point, impl = fetch) {
  try {
    const response = await impl(
      `https://api-adresse.data.gouv.fr/reverse/?lon=${point.lon}&lat=${point.lat}&limit=1`,
    );
    if (!response?.ok) return null;
    const payload = await response.json();
    const properties = payload?.features?.[0]?.properties;
    if (!properties) return null;
    return { label: properties.label ?? null, commune: properties.city ?? null };
  } catch {
    return null;
  }
}

/** A coordinate as a label, when no address answered. */
export function coordinateLabel(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
    ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`
    : messages().summary.incompletePosition;
}

/**
 * Build the panel and wire it to the layer's actions.
 *
 * @param {object} actions See `comparablesLayer.js`.
 * @returns {?object} Controller, or null where there is no document.
 */
export function mountComparablesPanel(actions = {}) {
  if (!canMount()) return null;
  document.getElementById(COMPARABLES_PANEL_ID)?.remove();

  const panel = document.createElement('aside');
  panel.id = COMPARABLES_PANEL_ID;
  panel.className = 'cmp-panel';
  panel.setAttribute('aria-label', messages().shell.ariaLabel);
  panel.innerHTML = panelMarkup();
  (document.getElementById('cesiumContainer') || document.body).appendChild(panel);

  const node = (selector) => panel.querySelector(selector);
  const subjectLabel = node('[data-cmp-subject-label]');
  const addressInput = node('[data-cmp-address]');
  const surfaceInput = node('[data-cmp-surface]');
  const roomsInput = node('[data-cmp-rooms]');
  const typeSelect = node('[data-cmp-type]');
  const linesList = node('[data-cmp-lines]');
  const retainedList = node('[data-cmp-retained]');
  const retainedCount = node('[data-cmp-retained-count]');
  const poolList = node('[data-cmp-pool]');
  const poolCount = node('[data-cmp-pool-count]');
  const countBadge = node('[data-cmp-count]');
  const statusLine = node('[data-cmp-status]');
  const fileInput = node('[data-cmp-file]');
  const newType = node('[data-cmp-new-type]');
  const clearButton = node('[data-cmp-clear]');

  fillTypes(typeSelect);
  fillTypes(newType);

  let dossier = emptyDossier();
  let pool = { list: [], total: 0, missing: false, radiusM: 0 };
  let clearArmedAt = 0;
  let destroyed = false;
  let adding = false;

  const say = (message) => { if (statusLine) statusLine.textContent = message; };

  /**
   * Keystrokes stay in the panel.
   *
   * The application binds single keys globally — Escape dismisses a card, and
   * the cockpit reads letters — so a reader typing "12 rue de la Paix" into a
   * field would otherwise be flying the camera at the same time.
   */
  panel.addEventListener('keydown', (event) => {
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') event.stopPropagation();
  });

  // ── the property ─────────────────────────────────────────────────────────
  async function poseFromAddress() {
    const query = addressInput?.value ?? '';
    const status = messages().status;
    if (String(query).trim().length < 3) { say(status.typeAddress); return; }
    say(status.searching);
    const hit = await geocodeAddress(query);
    if (destroyed) return;
    if (!hit) { say(status.notFound); return; }
    actions.setSubject?.({ lat: hit.lat, lon: hit.lon, label: hit.label });
    say(status.placed(hit.label));
  }

  async function poseFromCamera() {
    const status = messages().status;
    const point = actions.cameraPoint?.();
    if (!point) { say(status.noGround); return; }
    say(status.readingCentre);
    const address = await reverseAddress(point);
    if (destroyed) return;
    actions.setSubject?.({
      lat: point.lat,
      lon: point.lon,
      label: address?.label ?? coordinateLabel(point),
      commune: address?.commune ?? null,
    });
    say(address?.label ? status.placed(address.label) : status.placedNoAddress);
  }

  node('[data-cmp-geocode]')?.addEventListener('click', () => { void poseFromAddress(); });
  node('[data-cmp-here]')?.addEventListener('click', () => { void poseFromCamera(); });
  addressInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void poseFromAddress(); }
  });

  const pushSubjectField = (field, value) => {
    if (!dossier.subject) { say(messages().status.placeFirst); return; }
    actions.updateSubject?.({ [field]: value });
  };
  surfaceInput?.addEventListener('change', () => pushSubjectField('surface', parseNumber(surfaceInput.value)));
  roomsInput?.addEventListener('change', () => pushSubjectField('rooms', parseNumber(roomsInput.value)));
  typeSelect?.addEventListener('change', () => pushSubjectField('type', typeSelect.value || null));

  // ── a listing, typed ─────────────────────────────────────────────────────
  async function addListing() {
    // ONE ADD PER CLICK. Geocoding takes a round trip, and a second click
    // during it used to run the whole function again — same fields, same
    // listing, two rows, and a sample size the reader did not create.
    if (adding) return;
    const address = node('[data-cmp-new-address]')?.value ?? '';
    const price = parseNumber(node('[data-cmp-new-price]')?.value);
    const surface = parseNumber(node('[data-cmp-new-surface]')?.value);
    const rooms = parseNumber(node('[data-cmp-new-rooms]')?.value);
    const url = node('[data-cmp-new-url]')?.value ?? '';
    // A price of 0 or less is not a price. It used to pass the finite check,
    // land in the dossier with a refused ratio, and be announced as retained.
    const status = messages().status;
    if (!Number.isFinite(price) || price <= 0) {
      say(status.noPrice);
      return;
    }
    if (url.trim() && !safeListingUrl(url)) say(status.badLink);
    let position = null;
    adding = true;
    const addButton = node('[data-cmp-add]');
    if (addButton) addButton.disabled = true;
    try {
      if (String(address).trim().length >= 3) {
        say(status.searchingListing);
        position = await geocodeAddress(address);
        if (destroyed) return;
      }
    } finally {
      adding = false;
      if (addButton) addButton.disabled = false;
    }
    const added = actions.add?.({
      kind: 'annonce', // i18n-ignore-line — a stored kind key, not a word
      label: position?.label ?? address,
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
      price,
      surface,
      rooms,
      type: newType?.value || null,
      url,
      // The date a listing was READ, which is the only date the reader can
      // vouch for. A portal's own publication date is not on this screen.
      date: new Date().toISOString().slice(0, 10),
    });
    if (!added) { say(status.refused); return; }
    for (const selector of ['[data-cmp-new-address]', '[data-cmp-new-price]',
      '[data-cmp-new-surface]', '[data-cmp-new-rooms]', '[data-cmp-new-url]']) {
      const field = node(selector);
      if (field) field.value = '';
    }
    say(position ? status.listingPlaced : status.listingUnplaced);
  }
  node('[data-cmp-add]')?.addEventListener('click', () => { void addListing(); });

  // ── export, import, empty ────────────────────────────────────────────────
  node('[data-cmp-export]')?.addEventListener('click', () => {
    try {
      const blob = new Blob([exportDossierJson(dossier)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `comparables-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(messages().status.exported);
    } catch {
      say(messages().status.exportFailed);
    }
  });

  node('[data-cmp-import]')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = importDossierJson(await file.text());
    fileInput.value = '';
    if (destroyed) return;
    const status = messages().status;
    if (!result.dossier) { say(status.unreadable); return; }
    // MERGE, never replace. An import that emptied a dossier would be the one
    // irreversible action in this panel, and it would look like a success.
    const merged = mergeComparables(dossier, result.dossier.comparables);
    actions.replace?.({
      ...merged.dossier,
      subject: dossier.subject ?? result.dossier.subject ?? null,
    });
    say(status.imported(
      merged.added,
      result.rejected ? status.importedRejected(result.rejected) : '',
      merged.added < result.kept ? status.importedAlready(result.kept - merged.added) : '',
    ));
  });

  clearButton?.addEventListener('click', () => {
    const m = messages();
    const now = Date.now();
    if (now - clearArmedAt > CONFIRM_WINDOW_MS) {
      // Two presses, no modal. The globe is behind this panel and a blocking
      // dialog over it is a worse interruption than a button that waits.
      clearArmedAt = now;
      clearButton.textContent = m.shell.confirm;
      clearButton.classList.add('is-armed');
      setTimeout(() => {
        if (destroyed || Date.now() - clearArmedAt < CONFIRM_WINDOW_MS) return;
        clearButton.textContent = m.shell.clear;
        clearButton.classList.remove('is-armed');
      }, CONFIRM_WINDOW_MS + 50);
      say(m.status.clearArmed);
      return;
    }
    clearArmedAt = 0;
    clearButton.textContent = m.shell.clear;
    clearButton.classList.remove('is-armed');
    actions.replace?.(emptyDossier());
    say(m.status.cleared);
  });

  // ── rows ─────────────────────────────────────────────────────────────────
  /**
   * The second line of a row: the four facts that decide whether a comparable
   * is one.
   *
   * The €/m² is formatted the way the summary above formats it — a thousands
   * separator on one line and none on the next reads as two different numbers.
   * A missing ratio says WHY, because « pas de €/m² » on a 32 M€ mutation looks
   * like a gap in the data rather than a fact about the sale.
   *
   * @param {object} entry
   * @param {?number} distanceM
   * @returns {string}
   */
  function rowMeta(entry, distanceM) {
    const m = messages().row;
    return [
      Number.isFinite(entry.prixM2)
        ? m.prixM2(_fr.format(entry.prixM2))
        // i18n-ignore-next-line — `lots` is a stored refusal key, not a word
        : m.noRatio(entry.ratioRefused === 'lots' ? m.multiLot : ''),
      Number.isFinite(entry.surface) ? `${_surface.format(entry.surface)} m²` : null,
      Number.isFinite(entry.rooms) ? m.rooms(entry.rooms, entry.rooms) : null,
      Number.isFinite(distanceM) ? `${_fr.format(distanceM)} m` : null,
      frenchDate(entry.date),
    ].filter(Boolean).join(' — ');
  }

  /**
   * One retained comparable, as a row.
   *
   * The badge is the same word the marker's silhouette says — VENTE for the
   * euro sign, ANNONCE for the price tag — because a reader who learns the
   * pair here has to be able to read the map without coming back.
   */
  function retainedRow(entry) {
    const m = messages().row;
    const item = document.createElement('li');
    item.className = `cmp-item cmp-item-${entry.kind}`
      + (entry.retained === false ? ' is-out' : '');

    const badge = document.createElement('span');
    badge.className = 'cmp-badge';
    // i18n-ignore-next-line — `vente` is a stored kind key, not a word
    badge.textContent = entry.kind === 'vente' ? m.badgeSale : m.badgeListing;
    item.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'cmp-item-body';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'cmp-item-title';
    title.textContent = entry.label;
    title.title = m.flyTo;
    title.addEventListener('click', () => actions.lookAt?.(entry));
    body.appendChild(title);

    const meta = document.createElement('span');
    meta.className = 'cmp-item-meta';
    meta.textContent = rowMeta(entry, distanceMetres(dossier.subject, entry));
    body.appendChild(meta);

    if (entry.url) {
      const link = document.createElement('a');
      link.className = 'cmp-item-link';
      link.href = entry.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = entry.portal ? m.seeOn(entry.portal) : m.seeListing;
      body.appendChild(link);
    }
    item.appendChild(body);

    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'cmp-icon-btn';
    keep.textContent = entry.retained === false ? '○' : '◉';
    keep.title = entry.retained === false ? m.putBack : m.takeOut;
    keep.addEventListener('click', () => actions.toggle?.(entry.id));
    item.appendChild(keep);

    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'cmp-icon-btn cmp-icon-danger';
    drop.textContent = '✕';
    drop.title = m.remove;
    drop.addEventListener('click', () => actions.remove?.(entry.id));
    item.appendChild(drop);

    return item;
  }

  /** One DVF sale on offer, as a row with a single verb. */
  function poolRow(entry) {
    const m = messages().row;
    const item = document.createElement('li');
    item.className = 'cmp-item cmp-item-pool';

    const body = document.createElement('div');
    body.className = 'cmp-item-body';
    const title = document.createElement('span');
    title.className = 'cmp-item-title';
    title.textContent = entry.label;
    body.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'cmp-item-meta';
    meta.textContent = rowMeta(entry, entry.distanceM);
    body.appendChild(meta);
    item.appendChild(body);

    const take = document.createElement('button');
    take.type = 'button';
    take.className = 'cmp-icon-btn';
    take.textContent = entry.already ? '✓' : '+';
    take.disabled = Boolean(entry.already);
    take.title = entry.already ? m.already : m.take;
    take.addEventListener('click', () => actions.add?.(entry));
    item.appendChild(take);
    return item;
  }

  /** One sentence of the summary. */
  function line(text) {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }

  function renderDossier() {
    const m = messages().summary;
    const summary = dossierSummary(dossier);
    if (subjectLabel) {
      subjectLabel.textContent = summary.subject
        ? (summary.subject.label || coordinateLabel(summary.subject))
        : m.noSubject;
      subjectLabel.classList.toggle('is-empty', !summary.subject);
    }
    // Fields are only overwritten when the reader is not typing in them.
    const fill = (field, value) => {
      if (!field || document.activeElement === field) return;
      field.value = value === null || value === undefined ? '' : String(value);
    };
    fill(surfaceInput, summary.subject?.surface ?? null);
    fill(roomsInput, summary.subject?.rooms ?? null);
    if (typeSelect && document.activeElement !== typeSelect) {
      typeSelect.value = dossier.subject?.type ?? '';
    }

    linesList?.replaceChildren(...dossierLines(dossier).map(line));
    const rows = [...(dossier.comparables ?? [])];
    retainedList?.replaceChildren(...rows.map(retainedRow));
    if (retainedCount) {
      retainedCount.textContent = rows.length
        ? m.inCalculation(summary.retained, summary.total)
        : m.none;
    }
    if (countBadge) {
      countBadge.textContent = summary.estimate
        ? m.medianK(Math.round(summary.estimate.mid / 1000))
        : m.retained(summary.retained);
    }
  }

  function renderPool() {
    if (!poolList) return;
    const m = messages().summary;
    poolList.replaceChildren(...pool.list.map(poolRow));
    if (!poolCount) return;
    if (pool.missing) {
      poolCount.textContent = m.dvfSilent;
    } else if (!pool.list.length) {
      poolCount.textContent = m.noneWithin(pool.radiusM);
    } else {
      // A5: the count shown, the count found, and the criterion that chose.
      poolCount.textContent = pool.total > pool.list.length
        ? m.nearest(pool.list.length, pool.total, pool.radiusM)
        : m.within(pool.list.length, pool.radiusM);
    }
  }

  restorePanelPosition(panel, COMPARABLES_PANEL_ID);
  panel.classList.add('panel-draggable');
  // A panel dragged somewhere unfortunate has to have a way home that does not
  // involve clearing site data — the same two gestures the other panels offer:
  // double-click with a cursor, half a second of hold with a finger.
  const resetPosition = () => {
    clearPanelPosition(COMPARABLES_PANEL_ID);
    for (const property of ['left', 'top', 'right', 'bottom', 'transform']) {
      panel.style.removeProperty(property);
    }
  };
  const detachDrag = attachPanelDrag(panel, {
    panelId: COMPARABLES_PANEL_ID,
    handle: node('[data-cmp-grip]'),
    onLongPress: resetPosition,
  });
  node('[data-cmp-grip]')?.addEventListener('dblclick', resetPosition);

  renderDossier();
  renderPool();

  return {
    /** @param {object} next The dossier the layer just committed. */
    setDossier(next, { saved = true } = {}) {
      dossier = next ?? emptyDossier();
      renderDossier();
      if (!saved) say(messages().status.notSaved);
    },
    /** @param {{list: Array<object>, total: number, missing: boolean, radiusM: number}} next */
    setCandidates(next) {
      pool = next ?? { list: [], total: 0, missing: false, radiusM: 0 };
      renderPool();
    },
    /** @returns {HTMLElement} The mounted node. Test and QA seam. */
    element() {
      return panel;
    },
    destroy() {
      destroyed = true;
      detachDrag?.();
      panel.remove();
    },
  };
}
