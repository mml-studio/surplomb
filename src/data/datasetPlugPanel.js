/*
 * « BRANCHER UN JEU DE DONNÉES » — the panel under the layer list.
 *
 * ONE FIELD, TWO INTENTS. The reader types an address or a subject, and the
 * button says which one it read — ANALYSER for an address, CHERCHER for words.
 * Nobody has to learn a mode.
 *
 * A subject opens the shortlist. Five hits are read at once and only the ones
 * PROVEN drawable are offered, each under four facts in the reader's own
 * words: how many objects, who publishes, how fresh, under what licence. That
 * is deliberate: measured on six subjects (#113), the
 * platform's first hit is right about half the time, and its failures look
 * like successes — one town's nineteen points where a national base of 186 118
 * was meant. No machine can tell those apart; the count, side by side, can.
 * So the panel proposes and the reader chooses. Nothing is starred, nothing is
 * pre-selected, and what was set aside is listed with the reason in one phrase.
 *
 * Choosing a candidate costs no second read — its draft is already in hand —
 * and lands in the same draft card a pasted address produces. The reader still
 * sees the name, the publisher, the licence, the columns that locate a row and
 * the notes owed, and still presses BRANCHER. The shortlist stays on screen
 * afterwards, because "ce n'est pas ça, essaie l'autre" is the normal case.
 *
 * What it never does: draw before the reader has seen the draft; hide a
 * guessed geometry behind a working map; rank the candidates by size (biggest
 * is not most relevant — the Paris pharmacies are the right answer for someone
 * looking at Paris); or promise persistence the storage refused.
 *
 * THREE SIZES, AND WHO DECIDES THEM. This box is a guest under the layer list,
 * and the list is what the panel is for: on a 13" laptop the whole panel gets
 * about 310 px of body, which is six layer rows. So the box costs one slim
 * line at rest, grows to a line plus a field when the reader opens it, and
 * only takes room from the list at the third size — once a shortlist is on
 * screen or a draft is in hand, which is the point where the reader has proved
 * they are branching something rather than glancing at a button. Even then the
 * list keeps a floor of two rows and the box scrolls inside its share; closing
 * the box gives every pixel straight back, and the shortlist and draft survive
 * the round trip, so the way back to the layers costs nothing to take.
 *
 * @module data/datasetPlugPanel
 */

import { datasetManifestFaults } from './datasetManifest.js';
import { detectGeometry } from './datasetGeometry.js';
import { looksLikeDatasetAddress, shortlistDatasets } from './datasetSearch.js';
import { LICENCE_DISPLAY } from './datasetInference.i18n.js';
import { labelFor } from '../i18n/messages.js';
import { formatNumber } from '../i18n/format.js';
import messages from './datasetPlugPanel.i18n.js';

export const DATASET_PLUG_PANEL_ID = 'dataset-plug-panel';

/**
 * The panel's markup, in the page's language.
 *
 * A function and not a constant, because a catalog read at module load is
 * what ratchet R5 forbids — and because the box is mounted once, after the
 * locale gate has written `<html lang>`.
 */
function markup() {
  const m = messages();
  const lang = document.documentElement.getAttribute('lang') || 'fr';
  // `datasetPlugPanelLayout.test.mjs` reads the literal below straight out of
  // this source to check what ships hidden and what sits inside the scroller,
  // so the `const MARKUP = \`` opening stays on its own line.
  const MARKUP = `
  <button type="button" class="dsp-open" data-dsp-open aria-expanded="false">
    <span class="dsp-open-plus" aria-hidden="true">＋</span>
    <span class="dsp-open-label" lang="${lang}">${m.open}</span>
    <span class="dsp-open-count" data-dsp-count hidden></span>
  </button>
  <form class="dsp-form" data-dsp-form hidden autocomplete="off">
    <div class="dsp-row">
      <input type="text" class="dsp-input dsp-grow" data-dsp-url spellcheck="false"
             placeholder="${m.placeholder}" />
      <button type="submit" class="dsp-btn dsp-btn-primary" data-dsp-analyse>${m.search}</button>
    </div>
    <div class="dsp-body" data-dsp-body>
      <section class="dsp-results" data-dsp-results hidden>
        <ul class="dsp-cands" data-dsp-candidates></ul>
        <p class="dsp-aside" data-dsp-blocked hidden></p>
      </section>
      <section class="dsp-draft" data-dsp-draft hidden>
        <div class="dsp-row">
          <label class="dsp-label">${m.draft.name}</label>
          <input type="text" class="dsp-input dsp-grow" data-dsp-label maxlength="64" />
          <input type="color" class="dsp-color" data-dsp-color title="${m.draft.colorTitle}" />
        </div>
        <div class="dsp-row" data-dsp-resources-row hidden>
          <label class="dsp-label">${m.draft.resource}</label>
          <select class="dsp-input dsp-grow" data-dsp-resource></select>
        </div>
        <div class="dsp-row" data-dsp-geometry-row hidden>
          <label class="dsp-label">${m.draft.position}</label>
          <select class="dsp-input dsp-narrow" data-dsp-lon><option value="">${m.draft.longitude}</option></select>
          <select class="dsp-input dsp-narrow" data-dsp-lat><option value="">${m.draft.latitude}</option></select>
        </div>
        <dl class="dsp-facts" data-dsp-facts></dl>
        <ul class="dsp-notes" data-dsp-notes></ul>
      </section>
      <ul class="dsp-list" data-dsp-list></ul>
    </div>
    <!-- Outside the scroller on purpose: the draft is taller than the box's
         share of a 13" panel, and a PLUG IN the reader has to go looking for
         is a PLUG IN they can miss. -->
    <div class="dsp-row dsp-actions" data-dsp-actions hidden>
      <button type="button" class="dsp-btn dsp-btn-primary" data-dsp-plug>${m.plug}</button>
      <button type="button" class="dsp-btn" data-dsp-cancel>${m.cancel}</button>
    </div>
    <p class="dsp-status" data-dsp-status role="status" aria-live="polite"></p>
  </form>
`;
  return MARKUP;
}

function canMount() {
  return typeof document !== 'undefined' && Boolean(document.body);
}

function formatCount(value) {
  return formatNumber(Math.round(Number(value) || 0), { plainSpaces: true });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const m = messages().bytes;
  if (bytes >= 1048576) return m.megabytes((bytes / 1048576).toFixed(0));
  if (bytes >= 1024) return m.kilobytes((bytes / 1024).toFixed(0));
  return m.bytes(bytes);
}

/**
 * Mount the panel into the data-layers panel, below the list.
 * @param {object} box The dataset box API (`initDatasetBox`).
 * @param {{host?: HTMLElement|null}} [options]
 * @returns {HTMLElement|null}
 */
export function mountDatasetPlugPanel(box, { host = null } = {}) {
  if (!canMount()) return null;
  const parent = host
    || document.querySelector('#data-panel .data-panel-inner')
    || document.getElementById('data-toggles')?.parentElement
    || null;
  if (!parent) return null;
  document.getElementById(DATASET_PLUG_PANEL_ID)?.remove();

  const panel = document.createElement('div');
  panel.id = DATASET_PLUG_PANEL_ID;
  panel.className = 'dsp';
  panel.innerHTML = markup();
  parent.appendChild(panel);

  const node = (selector) => panel.querySelector(selector);
  const openButton = node('[data-dsp-open]');
  const openGlyph = node('.dsp-open-plus');
  const openCount = node('[data-dsp-count]');
  const form = node('[data-dsp-form]');
  const urlInput = node('[data-dsp-url]');
  const analyseButton = node('[data-dsp-analyse]');
  const resultsSection = node('[data-dsp-results]');
  const candidateList = node('[data-dsp-candidates]');
  const blockedLine = node('[data-dsp-blocked]');
  const draftSection = node('[data-dsp-draft]');
  const labelInput = node('[data-dsp-label]');
  const colorInput = node('[data-dsp-color]');
  const resourcesRow = node('[data-dsp-resources-row]');
  const resourceSelect = node('[data-dsp-resource]');
  const geometryRow = node('[data-dsp-geometry-row]');
  const lonSelect = node('[data-dsp-lon]');
  const latSelect = node('[data-dsp-lat]');
  const facts = node('[data-dsp-facts]');
  const notes = node('[data-dsp-notes]');
  const actionsRow = node('[data-dsp-actions]');
  const plugButton = node('[data-dsp-plug]');
  const cancelButton = node('[data-dsp-cancel]');
  const status = node('[data-dsp-status]');
  const scroller = node('[data-dsp-body]');
  const list = node('[data-dsp-list]');

  const m = messages();
  let draft = null;
  let busy = false;
  let chosenSlug = null;
  // Every action that writes the status line takes a ticket. A load settling
  // twenty seconds after the reader moved on must not overwrite what they are
  // reading now.
  let statusTicket = 0;

  const say = (message) => { statusTicket += 1; if (status) status.textContent = message || ''; return statusTicket; };
  const sayIfCurrent = (ticket, message) => { if (ticket === statusTicket && status) status.textContent = message || ''; };

  /**
   * Wait for a freshly plugged layer to settle, then say what it drew.
   *
   * The shortlist proposes; only the marks prove. This is the sentence that
   * closes the loop — including the two a proposal cannot promise: a source
   * that fails on the way in, and a dataset that is real, loaded, and simply
   * has nothing where the reader happens to be looking.
   */
  async function reportDrawn(id, label, pending) {
    const ticket = statusTicket;
    // The load runs INSIDE `box.plug()`, so this has to watch from beside the
    // promise rather than after it — the layer is registered synchronously, a
    // microtask before the first fetch, which is why `report()` already answers.
    let persisted = true;
    void pending.then((result) => { persisted = result?.persisted !== false; }, () => {});
    const deadline = Date.now() + 120000;
    let settled = null;
    while (Date.now() < deadline) {
      settled = box.report?.(id) || null;
      if (!settled) break;
      if (settled.error || (!settled.loading && settled.count > 0)) break;
      // While it runs, the only honest thing to show is the fraction the
      // loader can prove — and the time left once it has earned the right to
      // say one. `sayIfCurrent` keeps this silent if the reader moved on.
      if (settled.progressLine && ticket === statusTicket && status) {
        status.textContent = m.status.progress(label, settled.progressLine);
      }
      await new Promise((resolve) => { setTimeout(resolve, 200); });
    }
    await pending.catch(() => {});
    const caveat = persisted ? '' : m.status.notPersisted;
    if (!settled) { sayIfCurrent(ticket, m.status.plugged(label, caveat)); return; }
    if (settled.error) {
      sayIfCurrent(ticket, m.status.sourceFailed(label, settled.error));
      return;
    }
    if (settled.count > 0) {
      sayIfCurrent(ticket,
        m.status.drawn(label, settled.coverage || m.status.drawnCount(formatCount(settled.count)), caveat));
      return;
    }
    sayIfCurrent(ticket, m.status.nothingHere(label, caveat));
  }

  // Keystrokes stay in the panel: the app binds single keys globally.
  panel.addEventListener('keydown', (event) => {
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') event.stopPropagation();
  });

  function setOpen(open) {
    // Closing hides, it does not clear: the shortlist and the draft are still
    // in the DOM when the reader comes back, so going to look at the layer
    // list is not a decision to start over.
    form.hidden = !open;
    openButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.classList.toggle('dsp-expanded', open);
    openGlyph.textContent = open ? '－' : '＋';
    openButton.title = open ? m.closeTitle : m.openTitle;
    if (open) urlInput?.focus();
    syncDepth();
  }

  /**
   * The third size, and the only one that costs the layer list anything.
   *
   * A click on the opener is not proof of anything — it is how you read the
   * field. A shortlist on screen or a draft in hand is proof, so that is what
   * the class is keyed to, and it goes away the moment either does.
   */
  function syncDepth() {
    const working = !form.hidden && (!resultsSection.hidden || !draftSection.hidden);
    panel.classList.toggle('dsp-deep', working);
  }

  function fillSelect(select, columns, chosen, placeholder) {
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    for (const column of columns) {
      const option = document.createElement('option');
      option.value = column;
      option.textContent = column;
      if (column === chosen) option.selected = true;
      select.appendChild(option);
    }
  }

  function addFact(term, value) {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    facts.appendChild(dt);
    facts.appendChild(dd);
  }

  function currentManifest() {
    if (!draft) return null;
    const manifest = JSON.parse(JSON.stringify(draft.manifest));
    manifest.label = labelInput.value.trim() || manifest.label;
    if (/^#[0-9a-f]{6}$/i.test(colorInput.value)) manifest.color = colorInput.value.toLowerCase();
    const lon = lonSelect.value;
    const lat = latSelect.value;
    if (!geometryRow.hidden && lon && lat) {
      manifest.geometry = { lon, lat };
      if (manifest.source?.kind === 'datagouv') manifest.source.scope = 'viewport';
    }
    return manifest;
  }

  function renderDraft() {
    facts.replaceChildren();
    notes.replaceChildren();
    if (!draft) { draftSection.hidden = true; actionsRow.hidden = true; syncDepth(); return; }
    const { manifest, columns, sample, resources, total } = draft;
    labelInput.value = manifest.label || '';
    colorInput.value = manifest.color || '#ffb14e';

    if (Array.isArray(resources) && resources.length > 1) {
      resourceSelect.replaceChildren();
      for (const resource of resources) {
        const option = document.createElement('option');
        option.value = resource.id;
        option.textContent = `${resource.title || resource.id} · ${resource.format || '?'}${resource.filesize ? ` · ${formatBytes(resource.filesize)}` : ''}`;
        if (resource.id === manifest.source?.resourceId) option.selected = true;
        resourceSelect.appendChild(option);
      }
      resourcesRow.hidden = false;
    } else {
      resourcesRow.hidden = true;
    }

    const tabular = Array.isArray(columns) && columns.length && ['csv', 'datagouv'].includes(manifest.source?.kind);
    if (tabular) {
      const guess = manifest.geometry || detectGeometry(columns, sample || [])?.geometry || null;
      fillSelect(lonSelect, columns, guess?.lon || '', m.draft.longitude);
      fillSelect(latSelect, columns, guess?.lat || '', m.draft.latitude);
      geometryRow.hidden = false;
      if (manifest.geometry && !manifest.geometry.lon) {
        // A point / WKT / projected geometry was guessed: keep it, hide the pickers.
        geometryRow.hidden = true;
      }
    } else {
      geometryRow.hidden = true;
    }

    addFact(m.facts.source, `${manifest.source?.kind}${manifest.source?.scope === 'viewport' ? m.facts.loadedForView : ''}`);
    addFact(m.facts.publisher, manifest.attribution?.publisher);
    // The licence stored in the manifest is French data; only its display moves.
    addFact(m.facts.licence, labelFor(LICENCE_DISPLAY, manifest.attribution?.licence));
    if (Number.isFinite(total)) addFact(m.facts.rows, formatCount(total));
    if (Array.isArray(columns) && columns.length) {
      addFact(m.facts.columns,
        m.facts.columnsValue(columns.length, columns.slice(0, 6).join(', '), columns.length > 6 ? '…' : ''));
    }
    if (manifest.geometry) {
      const g = manifest.geometry;
      addFact(m.facts.position, g.lon ? `${g.lon} / ${g.lat}` : (g.point || g.wkt || g.geojson || `${g.x} / ${g.y} (${g.crs})`));
    }
    for (const note of draft.notes || []) {
      const li = document.createElement('li');
      li.textContent = note;
      notes.appendChild(li);
    }
    draftSection.hidden = false;
    actionsRow.hidden = false;
    syncDepth();
    syncFaults();
  }

  function syncFaults() {
    const manifest = currentManifest();
    const faults = manifest ? datasetManifestFaults(manifest) : [m.noDraft];
    plugButton.disabled = faults.length > 0 || busy;
    plugButton.title = faults.length ? faults.join('\n') : m.plugTitle;
    if (faults.length && manifest) say(m.status.toComplete(faults[0]));
  }

  /** The button says what the field will do, so no one has to guess a mode. */
  function syncIntent() {
    const text = urlInput.value.trim();
    analyseButton.textContent = looksLikeDatasetAddress(text) ? m.analyse : m.search;
  }

  function clearCandidates() {
    chosenSlug = null;
    candidateList.replaceChildren();
    blockedLine.textContent = '';
    blockedLine.hidden = true;
    resultsSection.hidden = true;
    syncDepth();
  }

  /**
   * The shortlist, as rows a reader can weigh against each other.
   * A row is a button: its whole surface chooses, so there is no target to aim
   * at, and the facts under the title are the only argument it makes.
   */
  function renderCandidates(shortlist) {
    candidateList.replaceChildren();
    if (scroller) scroller.scrollTop = 0;
    for (const entry of shortlist.ready) {
      const li = document.createElement('li');
      li.className = 'dsp-cand';
      li.dataset.slug = entry.slug;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dsp-cand-btn';
      const title = document.createElement('span');
      title.className = 'dsp-cand-title';
      title.textContent = entry.title;
      const factLine = document.createElement('span');
      factLine.className = 'dsp-cand-facts';
      factLine.textContent = entry.facts.join(' · ');
      button.append(title, factLine);
      button.addEventListener('click', () => chooseCandidate(entry));
      li.appendChild(button);
      candidateList.appendChild(li);
    }
    // What was found and set aside, with the reason — a reader who asked is
    // owed the whole answer, not the flattering half of it.
    if (shortlist.blocked.length) {
      blockedLine.textContent = m.shortlist.setAside(shortlist.blocked
        .map((entry) => m.shortlist.setAsideEntry(entry.title, entry.reason))
        .join(' · '));
      blockedLine.title = shortlist.blocked.map((entry) => `${entry.title} — ${entry.rawFault}`).join('\n');
      blockedLine.hidden = false;
    } else {
      blockedLine.hidden = true;
    }
    resultsSection.hidden = shortlist.ready.length === 0 && shortlist.blocked.length === 0;
    syncDepth();
  }

  function markChosen() {
    for (const li of candidateList.querySelectorAll('.dsp-cand')) {
      li.classList.toggle('dsp-cand-chosen', li.dataset.slug === chosenSlug);
    }
  }

  /** No second read: the draft that proved this candidate is the draft shown. */
  function chooseCandidate(entry) {
    draft = entry.draft;
    chosenSlug = entry.slug;
    markChosen();
    renderDraft();
    // The draft opens BELOW the shortlist, and at the third size the shortlist
    // alone can fill the box. Without this, choosing a candidate looks like
    // pressing a button that does nothing.
    draftSection.scrollIntoView({ block: 'nearest' });
    say(draft.faults.length
      ? m.status.toComplete(draft.faults[0])
      : m.status.chosen(entry.title));
  }

  async function search() {
    const query = urlInput.value.trim();
    if (!query || busy) return;
    busy = true;
    analyseButton.disabled = true;
    draft = null;
    renderDraft();
    clearCandidates();
    say(m.status.searching);
    try {
      const shortlist = await shortlistDatasets(query, (url) => box.infer(url));
      renderCandidates(shortlist);
      if (!shortlist.total) say(m.status.nothingPublished(query));
      else if (!shortlist.ready.length) say(m.status.noneUsable(shortlist.total, shortlist.blocked.length));
      else say(m.status.chooseOne(shortlist.total));
    } catch (error) {
      clearCandidates();
      say(m.status.searchFailed(error?.message || error));
    } finally {
      busy = false;
      analyseButton.disabled = false;
      syncFaults();
    }
  }

  async function analyse(resourceId = null) {
    const url = urlInput.value.trim();
    if (!url) { say(m.status.pasteAddress); return; }
    if (busy) return;
    busy = true;
    analyseButton.disabled = true;
    say(m.status.reading);
    try {
      draft = await box.infer(url, resourceId ? { resourceId } : {});
      if (!resourceId) clearCandidates();
      renderDraft();
      say(draft.faults.length ? m.status.toComplete(draft.faults[0]) : m.status.draftReady);
    } catch (error) {
      draft = null;
      renderDraft();
      say(m.status.readFailed(error?.message || error));
    } finally {
      busy = false;
      analyseButton.disabled = false;
      syncFaults();
    }
  }

  async function plug() {
    const manifest = currentManifest();
    if (!manifest || busy) return;
    const faults = datasetManifestFaults(manifest);
    if (faults.length) { say(m.status.toComplete(faults[0])); return; }
    busy = true;
    plugButton.disabled = true;
    say(m.status.plugging);
    try {
      const label = manifest.label || manifest.id;
      // Not awaited yet on purpose: the source is fetched inside `plug()`, and
      // a reader watching a blank « Branchement… » for eleven seconds is
      // exactly the silence this panel is supposed to break.
      const pending = box.plug(manifest);
      say(m.status.loading(label));
      void reportDrawn(manifest.id, label, pending);
      await pending;
      draft = null;
      renderDraft();
      // The field and the shortlist stay: « ce n'est pas ça, essaie l'autre »
      // is the ordinary next move, and retyping the subject to get back to a
      // list already on screen would be a punishment for looking.
      if (!chosenSlug) urlInput.value = '';
      markChosen();
      renderList();
    } catch (error) {
      say(m.status.plugFailed(error?.message || error));
    } finally {
      busy = false;
      syncFaults();
    }
  }

  function renderList() {
    list.replaceChildren();
    const entries = box.list().filter((entry) => entry.origin === 'plugged');
    list.hidden = entries.length === 0;
    // The branched datasets already have their own rows in the layer list, up
    // in JEUX BRANCHÉS. What only lives here is the manifest and the ✕, so the
    // resting line carries the count and the rows wait inside.
    openCount.textContent = entries.length ? `· ${entries.length}` : '';
    openCount.hidden = entries.length === 0;
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'dsp-item';
      li.dataset.datasetId = entry.id;
      const name = document.createElement('span');
      name.className = 'dsp-item-name';
      name.textContent = entry.label;
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'dsp-icon-btn';
      exportButton.title = m.exportTitle;
      exportButton.textContent = '⧉';
      exportButton.addEventListener('click', async () => {
        const text = box.exportManifest(entry.id);
        try {
          await navigator.clipboard.writeText(text);
          say(m.status.manifestCopied(entry.id));
        } catch {
          say(m.status.clipboardRefused);
          console.info(text);
        }
      });
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'dsp-icon-btn dsp-icon-danger';
      removeButton.title = m.unplugTitle;
      removeButton.textContent = '✕';
      removeButton.dataset.dspRemove = entry.id;
      removeButton.addEventListener('click', async () => {
        removeButton.disabled = true;
        const removed = await box.unplug(entry.id);
        say(removed ? m.status.unplugged(entry.label) : m.status.unplugRefused);
        renderList();
      });
      li.append(name, exportButton, removeButton);
      list.appendChild(li);
    }
  }

  openButton.addEventListener('click', () => setOpen(form.hidden));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (looksLikeDatasetAddress(urlInput.value)) void analyse();
    else void search();
  });
  urlInput.addEventListener('input', syncIntent);
  cancelButton.addEventListener('click', () => { draft = null; renderDraft(); clearCandidates(); say(''); setOpen(false); });
  plugButton.addEventListener('click', () => { void plug(); });
  resourceSelect.addEventListener('change', () => { void analyse(resourceSelect.value); });
  for (const control of [labelInput, colorInput, lonSelect, latSelect]) {
    control.addEventListener('input', syncFaults);
    control.addEventListener('change', syncFaults);
  }
  box.subscribe?.(renderList);
  syncIntent();
  renderList();
  return panel;
}
