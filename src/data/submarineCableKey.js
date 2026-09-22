/**
 * @module submarineCableKey
 *
 * What the submarine cables say in the map key, and the card of a clicked
 * landing point (lot 3 of the approved mock of the « Infrastructure numérique »
 * key, 2026-09-22). Pure, so the layer module keeps the drawing and this keeps
 * the words and the join.
 *
 * WHICH CABLES LAND HERE. The two TeleGeography files the checkout carries
 * name the landings and draw the routes, but neither lists the cables of a
 * landing. A cable is joined to a landing when one of its drawn vertices lies
 * within {@link LANDING_JOIN_KM} of it: TeleGeography draws each route to the
 * landings it serves. Measured on 2026-09-22 against TeleGeography's own
 * landing-point pages for the 27 French landings and 32 drawn at random: all
 * 82 listed cables found, 2 extra at one landing (Amanzimtoti, two planned
 * systems passing by), 58 landings of 59 exactly right. At 1 km one cable was
 * missed, at 0.5 km three.
 *
 * The join runs on a click, over the ~14 000 vertices of the file — a few
 * milliseconds — rather than for the 1 917 landings at load.
 */

import { getLocale } from '../i18n/locale.js';
import { formatNumber } from '../i18n/format.js';
import messages from './submarineCableKey.i18n.js';

/** How far a drawn vertex may lie from a landing and still land there, in km. */
export const LANDING_JOIN_KM = 2;

/** How many cable names the globe card lists before « and N more ». */
const GLOBE_CARD_CABLES = 4;

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

/**
 * Split a TeleGeography landing name into its place and its country.
 *
 * The country is the last part — `Lannion, France`, `Hermosa Beach, CA, United
 * States` — except for the two Congos, whose own name holds a comma
 * (`Muanda, Congo, Dem. Rep.`).
 * @param {string} name
 * @returns {{place: string, country: string}}
 */
export function landingPlace(name) {
  const text = String(name || '').trim();
  const parts = text.split(', ');
  if (parts.length < 2) return { place: text, country: '' };
  const take = /^(Dem\. )?Rep\.$/.test(parts.at(-1)) && parts.length > 2 ? 2 : 1;
  return { place: parts.slice(0, -take).join(', '), country: parts.slice(-take).join(', ') };
}

/** An English country name as it is compared: no accent, `&` for `and`, `St.` for `Saint`. */
function countryKey(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\band\b/g, '&')
    .replace(/\bsaint\b/g, 'st.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The names TeleGeography spells differently from the CLDR once `countryKey`
 * has folded the usual variants. With these, every one of the 1 917 landings
 * of the file resolves to a region code (measured 2026-09-22).
 */
const COUNTRY_ALIASES = Object.freeze({
  turkey: 'TR',
  myanmar: 'MM',
  'virgin islands (u.s.)': 'VI',
  'virgin islands (u.k.)': 'VG',
  'congo, dem. rep.': 'CD',
  'congo, rep.': 'CG',
  'sint eustatius & saba': 'BQ',
  'st. vincent & the grenadines': 'VC',
  'ascension & tristan da cunha': 'SH',
});

let _regionByName = null;

/**
 * The ISO region code of a TeleGeography country, or null. The table behind
 * it (English name → code) is built once from the runtime's own CLDR.
 * @param {string} country English name, as the file spells it.
 * @returns {?string}
 */
export function landingRegionCode(country) {
  if (!_regionByName) {
    _regionByName = new Map();
    let names = null;
    try {
      names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      names = null;
    }
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of names ? letters : '') {
      for (const b of letters) {
        const code = `${a}${b}`;
        let name = null;
        try {
          name = names.of(code);
        } catch {
          name = null;
        }
        if (name && name !== code && !_regionByName.has(countryKey(name))) _regionByName.set(countryKey(name), code);
      }
    }
  }
  const key = countryKey(country);
  return COUNTRY_ALIASES[key] || _regionByName.get(key) || null;
}

/**
 * A TeleGeography country, in the reader's language: `United Kingdom` reads
 * « Royaume-Uni » in French. The English name when the runtime cannot say.
 * @param {string} country English name, as the file spells it.
 * @param {string} [locale]
 * @returns {string}
 */
export function landingCountryLabel(country, locale = getLocale()) {
  const code = landingRegionCode(country);
  if (!code) return country;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || country;
  } catch {
    return country;
  }
}

/**
 * The cables' routes, flattened once for the join.
 *
 * One entry per cable id: TeleGeography splits some systems over several
 * features, and a cable is one line of the card however many it has.
 * @param {ReadonlyArray<object>} features `cable-geo.json` features.
 * @returns {Array<{id: string, name: string, coords: number[]}>} `coords` is
 *   `[lon, lat, lon, lat, …]`.
 */
export function createCableRouteIndex(features) {
  const byId = new Map();
  for (const feature of Array.isArray(features) ? features : []) {
    const props = feature?.properties || {};
    const id = String(props.id || feature?.id || '').trim();
    const name = String(props.name || id).trim();
    if (!id || !name) continue;
    if (!byId.has(id)) byId.set(id, { id, name, coords: [] });
    collectCoords(feature?.geometry?.coordinates, byId.get(id).coords);
  }
  return [...byId.values()].filter((route) => route.coords.length);
}

function collectCoords(value, out) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    if (Number.isFinite(value[0]) && Number.isFinite(value[1])) out.push(value[0], value[1]);
    return;
  }
  for (const child of value) collectCoords(child, out);
}

/**
 * The cables whose drawn route reaches a landing — see the module header for
 * the rule and how well it holds.
 * @param {ReadonlyArray<{id: string, name: string, coords: number[]}>} index
 * @param {number} lon
 * @param {number} lat
 * @param {number} [radiusKm]
 * @returns {Array<{id: string, name: string}>} Sorted by name.
 */
export function cablesAtLanding(index, lon, lat, radiusKm = LANDING_JOIN_KM) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  // A box first, in degrees, so the haversine runs on a handful of vertices.
  const latPad = radiusKm / 111;
  const lonPad = radiusKm / (111 * Math.max(0.01, Math.cos(lat * DEG)));
  const found = [];
  for (const route of Array.isArray(index) ? index : []) {
    const { coords } = route;
    for (let i = 0; i < coords.length; i += 2) {
      const vLon = coords[i];
      const vLat = coords[i + 1];
      if (Math.abs(vLat - lat) > latPad || Math.abs(vLon - lon) > lonPad) continue;
      if (haversineKm(lon, lat, vLon, vLat) <= radiusKm) {
        found.push({ id: route.id, name: route.name });
        break;
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The cables' classes in the key: the route and the landing, in the colours
 * the map draws them.
 * @param {{route: string, landing: string}} colors
 * @returns {Array<object>}
 */
export function cableKeyEntries({ route, landing }) {
  const m = messages().key;
  return [
    { label: m.route, color: route, swatch: 'line' },
    { label: m.landing, color: landing },
  ];
}

/** The sentence under the cables' classes. */
export function cableKeyNote() {
  return messages().key.note;
}

/**
 * A clicked landing as the map key prints it (`legendSelection`): the place
 * as the name, what it is and where, and its cables folded under one button.
 * @param {{id: string, name: string, tbd?: boolean}} landing
 * @param {ReadonlyArray<{id: string, name: string}>} cables From {@link cablesAtLanding}.
 * @returns {?object}
 */
export function landingSelectionPanel(landing, cables) {
  if (!landing?.id || !landing.name) return null;
  const m = messages().card;
  const { place, country } = landingPlace(landing.name);
  const lines = [];
  if (landing.tbd) lines.push(m.tbd);
  if (!cables.length) lines.push(m.none);
  return {
    key: `landing:${landing.id}`,
    title: place || landing.name,
    meta: [m.kind(landingCountryLabel(country))],
    lines,
    footnote: m.footnote,
    list: cables.length
      ? {
        summary: m.cables(formatNumber(cables.length), cables.length),
        items: cables.map((cable) => ({ text: cable.name })),
      }
      : null,
  };
}

/**
 * The same card as lines for the globe, where the key cannot carry it (a
 * phone, a folded key): the place, then what it is, then the first cables.
 * @param {{id: string, name: string, tbd?: boolean}} landing
 * @param {ReadonlyArray<{id: string, name: string}>} cables
 * @returns {{title: string, details: string[]}}
 */
export function landingCardLines(landing, cables) {
  const panel = landingSelectionPanel(landing, cables);
  if (!panel) return { title: String(landing?.name || ''), details: [] };
  const m = messages().card;
  const details = [...panel.meta];
  if (cables.length) details.push(m.count(formatNumber(cables.length), cables.length));
  const names = cables.slice(0, GLOBE_CARD_CABLES).map((cable) => cable.name).join(', ');
  const rest = cables.length - GLOBE_CARD_CABLES;
  if (names) details.push(rest > 0 ? `${names} ${m.more(formatNumber(rest))}` : names);
  details.push(...panel.lines);
  return { title: panel.title, details };
}
