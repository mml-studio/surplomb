/**
 * @module data/pebAirports
 *
 * The airports that have a noise exposure plan (PEB), named the way a reader
 * knows them, and the few decisions the « Aéroports » row makes about them: the
 * lines of its airport menu, which airport the key is about, where the camera
 * goes when one is picked, and which link opens its plan.
 *
 * ── WHY A SECOND NAME ──────────────────────────────────────────────────────
 * The arrêté register (`bruitArretes.js`) names its 224 airports the way a
 * clerk files them: « P. CH. DE-GAULLE », « T. BLAGNAC », « B. MERIGNAC »,
 * « M. PROVENCE ». A menu of those is a menu of abbreviations to decode. The
 * proxy joins each register row, on the ICAO code, to the OurAirports pack the
 * app already ships (`local_data/airports/`), which is where « Toulouse-Blagnac
 * Airport » and its IATA code « TLS » come from: 221 of the 224 join
 * (measured 2026-09-24). What this module adds is the step from that English
 * record to a French label — the generic word dropped (« Airport »,
 * « Airfield », « Air Base », « Aérodrome de »), the air-base number dropped —
 * and a short table for the handful where the result is still not the name a
 * French reader uses, or where there is no pack record at all.
 *
 * Pure: no DOM, no fetch, no Cesium, so `node --test` pins every rule.
 */

/**
 * Where the cleaned pack name is still not the name in use, and the three
 * register rows the pack does not hold (LFXI, LFSC, LSGG). Proper nouns, the
 * same in both locales.
 */
// i18n-ignore-start — proper nouns, not copy.
export const PEB_AIRPORT_NAMES = Object.freeze({
  LFPG: 'Paris-Charles-de-Gaulle',
  LFSB: 'Bâle-Mulhouse',
  LSGG: 'Genève',
  LFXI: 'Saint-Christol',
  LFSC: 'Colmar-Meyenheim',
  FMEE: 'La Réunion Roland-Garros',
  LFPI: 'Paris-Issy-les-Moulineaux',
  // Named in English, or after a person, by the pack.
  LFRH: 'Lorient Bretagne Sud',
  LFHO: 'Aubenas Ardèche méridionale',
  LFNH: 'Carpentras',
  LFDB: 'Montauban',
  LFQE: 'Étain-Rouvres',
  TFFR: 'Pointe-à-Pitre Maryse Condé',
});
// i18n-ignore-end

/**
 * The generic words OurAirports puts around a name, longest first so « Air
 * Base » goes before « Base » could ever match.
 */
const GENERIC_SUFFIX = /\s+(?:international\s+airport|airport|airfield|aerodrome|air\s*base|altiport|heliport|airstrip)$/i;
const GENERIC_PREFIX = /^a[ée]rodrome\s+(?:de\s+|d['’]\s*|du\s+|des\s+)?/i;
/** « (BA 101) » — the air-base number, which names the unit and not the field. */
const AIR_BASE_NUMBER = /\s*\(BA\s*\d+\)\s*/gi;

/**
 * The French label of one OurAirports name, or null.
 * @param {*} name e.g. « Toulouse-Blagnac Airport ».
 * @returns {?string} e.g. « Toulouse-Blagnac ».
 */
export function cleanAirportName(name) {
  if (typeof name !== 'string') return null;
  let label = name.replace(AIR_BASE_NUMBER, ' ').replace(/\s+/g, ' ').trim();
  label = label.replace(GENERIC_SUFFIX, '').replace(GENERIC_PREFIX, '').trim();
  // « Niort - Marais Poitevin » and « Marmande – Virazeil »: one hyphen, as
  // the rest of the list writes a double name.
  label = label.replace(/\s+[-–]\s+/g, ' – ');
  return label || null;
}

/**
 * A register name, for the rows the pack does not hold and no table names:
 * « LA ROCHELLE » → « La Rochelle ». Abbreviations keep their full stop.
 * @param {*} name
 * @returns {?string}
 */
export function titleCaseRegisterName(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  return name.trim().toLowerCase()
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (match, lead, letter) => `${lead}${letter.toUpperCase()}`);
}

/**
 * The name a reader knows one register airport by.
 * @param {{oaci?: string, name?: ?string, airportName?: ?string}} entry
 *   A row of `/api/bruit-fr/index`: `name` is the register's, `airportName`
 *   the pack's.
 * @returns {string}
 */
export function pebAirportLabel(entry) {
  const oaci = typeof entry?.oaci === 'string' ? entry.oaci.trim().toUpperCase() : '';
  return PEB_AIRPORT_NAMES[oaci]
    || cleanAirportName(entry?.airportName)
    || titleCaseRegisterName(entry?.name)
    || oaci;
}

/**
 * The short code printed beside the name: the IATA code a passenger reads on
 * a ticket, the ICAO code when the field has none.
 * @param {{oaci?: string, iata?: ?string}} entry
 * @returns {?string}
 */
export function pebAirportCode(entry) {
  const iata = typeof entry?.iata === 'string' ? entry.iata.trim().toUpperCase() : '';
  if (/^[A-Z]{3}$/.test(iata)) return iata;
  const oaci = typeof entry?.oaci === 'string' ? entry.oaci.trim().toUpperCase() : '';
  return oaci || null;
}

/**
 * Read the pack's names for a set of ICAO codes, out of its JSON Lines text.
 *
 * A line is parsed only when it carries an ICAO code (and one of `codes`, when
 * given), so the 3.3 MB pack costs one pass of string search and a parse per
 * coded field — once per server, since the proxy keeps the answer.
 * @param {string} text `airports.geojsonl`.
 * @param {?Iterable<string>} [codes] ICAO codes wanted; every coded field
 *   when absent, which is what the proxy keeps, since the register can gain
 *   an airport between two restarts.
 * @returns {Map<string, {airportName: string, iata: ?string}>}
 */
export function readAirportPackNames(text, codes = null) {
  const wanted = codes ? new Set([...codes].map((code) => String(code).toUpperCase())) : null;
  const found = new Map();
  if (typeof text !== 'string' || wanted?.size === 0) return found;
  for (const line of text.split('\n')) {
    const match = /"icao"\s*:\s*"([A-Z0-9]{4})"/.exec(line);
    if (!match || (wanted && !wanted.has(match[1])) || found.has(match[1])) continue;
    try {
      const properties = JSON.parse(line)?.properties || {};
      if (typeof properties.name !== 'string' || !properties.name.trim()) continue;
      found.set(match[1], {
        airportName: properties.name.trim(),
        iata: typeof properties.iata === 'string' && properties.iata.trim() ? properties.iata.trim() : null,
      });
    } catch { /* a malformed line names nothing */ }
  }
  return found;
}

/**
 * The register rows as menu lines, in alphabetical order of their labels.
 * @param {ReadonlyArray<object>} airports Rows of `/api/bruit-fr/index`.
 * @param {string} [locale]
 * @returns {Array<{value: string, label: string, code: ?string}>}
 */
export function pebAirportOptions(airports, locale = 'fr') {
  const seen = new Set();
  const options = [];
  for (const entry of Array.isArray(airports) ? airports : []) {
    const oaci = typeof entry?.oaci === 'string' ? entry.oaci.trim().toUpperCase() : '';
    if (!oaci || seen.has(oaci) || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) continue;
    seen.add(oaci);
    options.push({ value: oaci, label: pebAirportLabel(entry), code: pebAirportCode(entry) });
  }
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  return options.sort((a, b) => collator.compare(a.label, b.label));
}

/** Great-circle kilometres, enough for "which airport is nearer". */
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The airport a view is ABOUT: the one the reader picked while its plan is
 * drawn, otherwise the drawn airport nearest the centre of the view.
 *
 * Only airports whose plan is on screen are candidates, so the key never
 * names an airport it draws nothing for. The pick holds while its plan is
 * drawn: a reader who picked Orly and pans towards Roissy is still reading
 * Orly until Orly leaves the draw.
 * @param {ReadonlyArray<{oaci?: string, lat?: number, lon?: number}>} drawn
 * @param {?{lat: number, lon: number}} centre
 * @param {?string} [picked] ICAO code the reader picked.
 * @returns {?string} ICAO code.
 */
export function focusedPebAirport(drawn, centre, picked = null) {
  const candidates = (Array.isArray(drawn) ? drawn : [])
    .filter((entry) => typeof entry?.oaci === 'string' && entry.oaci);
  if (!candidates.length) return null;
  const wanted = typeof picked === 'string' ? picked.toUpperCase() : null;
  if (wanted && candidates.some((entry) => entry.oaci.toUpperCase() === wanted)) return wanted;
  const placed = candidates.filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon));
  if (!placed.length || !centre || !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) {
    return candidates[0].oaci.toUpperCase();
  }
  let best = placed[0];
  let bestKm = distanceKm(centre, best);
  for (const entry of placed.slice(1)) {
    const km = distanceKm(centre, entry);
    if (km < bestKm) { best = entry; bestKm = km; }
  }
  return best.oaci.toUpperCase();
}

/**
 * Where the camera goes when an airport is picked: south of it, looking north
 * at 50° down, as the approved mock frames Roissy.
 *
 * HIGH ENOUGH FOR THE OVERVIEW. Under 12 km the noise layer answers about the
 * one point under the camera (`ADDRESS_SCAN_CEILING_M` in bruitFrance.js), and
 * a reader who picks an airport asked for its whole plan. So the camera never
 * goes under 14 km: an airport with scheduled flights — the ones whose plans
 * run to tens of kilometres, Roissy's zone C is 41.5 km across — is framed
 * from 22 km, any other field from 14 km, still inside the fast overview tempo
 * (30 km) where the plan is sharp on its first paint.
 * @param {{lat: number, lon: number, iata?: ?string}} airport
 * @returns {?{lon: number, lat: number, height: number, headingDeg: number, pitchDeg: number}}
 */
export function pebAirportCamera(airport) {
  if (!Number.isFinite(airport?.lat) || !Number.isFinite(airport?.lon)) return null;
  const scheduled = typeof airport.iata === 'string' && /^[A-Z]{3}$/.test(airport.iata.trim().toUpperCase());
  const height = scheduled ? 22_000 : 14_000;
  const pitchDeg = -50;
  // Stand back so the airport sits in the middle of the frame: the ground
  // distance to the look-at point is height / tan(|pitch|).
  const backKm = (height / Math.tan((Math.abs(pitchDeg) * Math.PI) / 180)) / 1000;
  return {
    lon: airport.lon,
    lat: airport.lat - backKm / 111.2,
    height,
    headingDeg: 0,
    pitchDeg,
  };
}

/**
 * The plan's official document as a link the key may print, or null.
 *
 * The register publishes the arrêté PDFs over `http:`; the same host answers
 * over `https:` (HTTP 200, `application/pdf`, checked 2026-09-24), and the key
 * prints https links only (`legendSelectionOf`). Any other host is kept only
 * when it is already https.
 * @param {*} url
 * @returns {?string}
 */
export function pebPlanUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  const upgraded = trimmed.replace(/^http:\/\/(piece-jointe-carto\.developpement-durable\.gouv\.fr\/)/i, 'https://$1');
  return /^https:\/\//i.test(upgraded) ? upgraded : null;
}
