/**
 * @module fiche
 *
 * The renderer behind `fiche.html` — the address radiography as a document.
 *
 * `adresseRadiographie.js` owns everything that decides WHAT is on the sheet
 * and is unit-tested against captured payloads; this file owns only how it
 * looks and how the page is driven. Keeping the split sharp is what lets the
 * wording of a claim be tested at all: a sentence composed inside a DOM
 * builder is a sentence nobody can assert on.
 *
 * NO CESIUM, NO GLOBE, NO MAP. The page is text. That is what makes it
 * printable to PDF by the browser, embeddable in an iframe, and readable on an
 * agent's phone.
 *
 * THE URL IS THE STATE. `?lat=&lon=` scans a point, `?q=` geocodes first
 * through the app's own `/api/geocode`, and `?embed=1` strips the chrome. A
 * scan is therefore a link — which is the whole distribution mechanism this
 * sheet has, and the reason the address is pushed into the history rather than
 * held in a variable.
 *
 * AND `?lang=` IS PART OF THAT STATE. `fiche.html` carries its own copy of the
 * locale gate, so the page has decided its language before this module runs;
 * the sentences below are read from `fiche.i18n.js` at render time and the
 * static masthead is translated once, on boot, by the shared applicator.
 */

import {
  composeRadiographie,
  fetchRadiographieParts,
} from './data/adresseRadiographie.js';
import messages, { markupMessages } from './fiche.i18n.js';
import { formatDateTime } from './i18n/format.js';
import { DEFAULT_LOCALE, I18N_READY_ATTRIBUTE, getLocale } from './i18n/locale.js';

const el = (id) => document.getElementById(id);

/** Escape a string for insertion as text. */
function text(value) {
  return String(value ?? '');
}

/** Build an element with text content and optional class. */
function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined && content !== null) element.textContent = text(content);
  return element;
}

/**
 * Translate the static markup of `fiche.html`, once, before the first render.
 *
 * Imported dynamically and only when the page is not French, the way
 * `src/boot.js` does it for the globe: a French reader pays nothing for the
 * applicator, and an English one has the masthead translated before the sheet
 * writes its first row into it.
 *
 * @returns {Promise<void>}
 */
async function translateMarkup() {
  if (getLocale() === DEFAULT_LOCALE) return;
  try {
    const { applyMarkup } = await import('./i18n/markup.js');
    applyMarkup(document, { catalog: markupMessages });
  } finally {
    document.documentElement.setAttribute(I18N_READY_ATTRIBUTE, '');
  }
}

/**
 * Read the point from the URL.
 * @returns {{lat: number, lon: number}|null}
 */
function pointFromSearch(params) {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Geocode a free-text address through the app's own proxy.
 *
 * The BAN is asked directly rather than through `/api/geocode`, because this
 * sheet is France-only by construction — every one of its seventeen sources is a
 * French register — and the BAN answers a French address better than a
 * worldwide geocoder does, with the INSEE code already attached.
 *
 * @param {string} query
 * @returns {Promise<?{lat: number, lon: number, label: string}>}
 */
async function geocode(query) {
  const url = 'https://api-adresse.data.gouv.fr/search/?limit=1&q='
    + encodeURIComponent(query);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const feature = payload?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    return {
      lon: Number(coordinates[0]),
      lat: Number(coordinates[1]),
      label: feature.properties?.label || query,
    };
  } catch {
    return null;
  }
}

/** Render one theme section. */
function renderTheme(theme) {
  const m = messages();
  const section = node('section', 'theme');
  section.dataset.status = theme.status;
  const heading = node('h2');
  heading.append(node('span', null, theme.label));
  if (theme.status !== 'ok') {
    heading.append(node('span', 'flag', `— ${m.status[theme.status]}`));
  }
  section.append(heading);
  section.append(node('p', 'question', theme.question));

  if (theme.lines.length) {
    const list = node('dl', 'rows');
    for (const row of theme.lines) {
      const group = node('div');
      group.append(node('dt', null, row.label));
      group.append(node('dd', null, row.value));
      if (row.note) group.append(node('dd', 'note', row.note));
      list.append(group);
    }
    section.append(list);
  }

  const notes = [...theme.notes];
  if (theme.silent?.length) {
    // The keys are the route names of `radiographieRequests` (`atmo`,
    // `bruit`): identifiers, not words, and the same in both languages.
    notes.unshift(m.silentSources(theme.silent.join(', ')));
  }
  if (notes.length) {
    const list = node('ul', 'notes');
    for (const note of notes) list.append(node('li', null, note));
    section.append(list);
  }
  return section;
}

/** Render the whole sheet. */
function render(fiche) {
  const m = messages();
  const address = fiche.address;
  el('title').textContent = address?.label
    || address?.commune
    || `${fiche.point.lat.toFixed(5)}, ${fiche.point.lon.toFixed(5)}`;

  const subline = el('subline');
  subline.textContent = '';
  const parts = [];
  if (address?.commune && address?.code) parts.push(`${address.commune} (${address.code})`);
  // The BAN's own distance to the nearest known address, printed whenever it
  // is not the door: a sheet titled with a street name for a point 180 m away
  // is describing a different place than the reader thinks.
  if (Number.isFinite(address?.distanceM) && address.distanceM > 10) {
    parts.push(m.addressDistance(address.distanceM));
  }
  subline.append(node('span', null, parts.join(' · ')));
  subline.append(document.createTextNode(' '));
  subline.append(node('span', 'coords',
    `${fiche.point.lat.toFixed(5)}, ${fiche.point.lon.toFixed(5)}`));

  // French keeps the shape `toLocaleString('fr-FR')` printed before this page
  // was bilingual — `20/09/2026 10:23:08`. English follows docs/GLOSSARY.md: a
  // named month, which is what an English reader of a printed sheet expects,
  // and the 24-hour clock the glossary fixes for every timestamp.
  el('status').textContent = m.statusLine(
    fiche.answered,
    fiche.partial,
    fiche.absent.length,
    getLocale() === DEFAULT_LOCALE
      ? formatDateTime(fiche.generatedAt)
      : formatDateTime(fiche.generatedAt, { dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23' }),
  );

  const host = el('themes');
  host.textContent = '';

  const caveat = node('p', 'caveat', fiche.gradingNote);
  host.append(caveat);

  for (const theme of fiche.themes) host.append(renderTheme(theme));

  el('colophon').textContent = m.colophon;
}

/** Scan a point and render it. */
async function scan(point) {
  el('status').textContent = messages().scanning;
  const parts = await fetchRadiographieParts(point);
  render(composeRadiographie({ point, parts }));
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('embed') === '1') document.body.classList.add('embed');
  await translateMarkup();

  el('lookup').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = el('query').value.trim();
    if (!query) return;
    el('status').textContent = messages().geocoding;
    const found = await geocode(query);
    if (!found) {
      el('status').textContent = messages().notFound;
      return;
    }
    // The scan is a LINK. Pushed rather than replaced so a reader comparing two
    // addresses can go back to the first one.
    const next = new URLSearchParams(window.location.search);
    next.set('lat', found.lat.toFixed(6));
    next.set('lon', found.lon.toFixed(6));
    next.delete('q');
    window.history.pushState({}, '', `?${next.toString()}`);
    await scan({ lat: found.lat, lon: found.lon });
  });

  el('print').addEventListener('click', () => window.print());

  window.addEventListener('popstate', () => {
    const point = pointFromSearch(new URLSearchParams(window.location.search));
    if (point) void scan(point);
  });

  const point = pointFromSearch(params);
  if (point) {
    await scan(point);
    return;
  }
  const query = params.get('q');
  if (query) {
    el('query').value = query;
    el('lookup').requestSubmit();
  }
}

// Only in a browser. `src/fiche.i18n.js` makes this module a catalogued one,
// and `src/i18n/importSafety.test.mjs` imports every catalogued module with
// `document` and `navigator` poisoned to prove nothing reads the environment
// while loading. `window` is the one global that says "there is a page here".
if (typeof window !== 'undefined') void boot();
