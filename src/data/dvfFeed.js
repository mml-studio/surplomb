/**
 * DVF feed projection — France's register of what property actually sold for.
 *
 * WHAT THIS SOURCE IS. *Demandes de valeurs foncières*: every transaction the
 * tax administration recorded, published by Etalab in a geolocated form. It is
 * the file a French buyer opens by hand, one commune at a time, and it is the
 * only public answer to "what did the flat next door really go for".
 *
 * MEASURED against the live files on 2026-09-01, for Paris 13e (75113), 2024:
 *   - `GET files.data.gouv.fr/geo-dvf/latest/csv/2024/communes/75/75113.csv`
 *     → 200 after one redirect, **752,768 bytes**, 3,975 data rows, 40 columns,
 *       no quoted fields anywhere in the body
 *   - 1,736 distinct mutations behind those 3,975 rows
 *   - 8 rows carry no coordinate, 6 carry no `valeur_fonciere`
 *   - editions are published per year from 2021 onward
 *
 * THE TRAP THIS MODULE EXISTS FOR, AND IT IS A BIG ONE. **`valeur_fonciere`
 * belongs to the MUTATION, not to the row, and it is repeated on every row of
 * that mutation.** In the captured file, mutation `2024-1225294` — the sale of
 * one building — is spread over **179 rows**, each restating €32,000,000.
 * Summing the column yields €5.7 BILLION for a single Paris block. Dividing
 * that first row's €32,000,000 by its 25 m² flat yields €1.28 million per
 * square metre. Both numbers are catastrophic and both are what the obvious
 * code produces, so this projection groups by `id_mutation` FIRST and treats
 * the row as what it is: one lot inside a sale.
 *
 * WHY €/m² IS OFTEN `null` HERE. A price per square metre is only a comparable
 * when the sale bought exactly one dwelling. Across a 179-lot block sale the
 * ratio is an investor's yield metric, not the number a buyer is looking for,
 * and the register cannot tell us how the €32 M was split. So the ratio is
 * computed for single-dwelling mutations and left `null` otherwise. A null
 * that says "not comparable" is worth more than a number that is wrong.
 *
 * THE SECOND TRAP — WHICH COMMUNE CODE. These files are keyed per
 * ARRONDISSEMENT in Paris, Lyon and Marseille: the path is `75113.csv`, not
 * `75056.csv`. `geo.api.gouv.fr/communes?lat&lon` answers **75056** for any
 * Paris point, and so does the `commune.codeInsee` Géorisques echoes. The only
 * source measured to return `75113` is the BAN reverse geocoder's
 * `properties.citycode`, which is therefore the one this path is built from.
 *
 * THE THIRD TRAP — WHICH MEDIAN THE COLOURS DIVIDE BY. Until 2026-09-03 the map
 * coloured each sale against the median of the sales inside the SCAN RADIUS,
 * i.e. against whatever the camera was pointing at. Measured on the captured
 * fixture, inside one arrondissement: from avenue de France the local median is
 * **8 857 €/m²**, from rue de Tolbiac 1.5 km away it is **12 406 €/m²** — a
 * 40 % swing with not one row of data changed. Worse, at both of those points
 * the priciest and the cheapest sale of the sample each came out *exactly at
 * the median*, painted "average", because a median of one is that one. That is
 * the C1 violation in `docs/CARTOGRAPHY.md`: the classification was derived
 * from the visible sample.
 *
 * The ratio is still the right question — an absolute €/m² ramp paints all of
 * Paris one colour — so what changes is the DENOMINATOR, not the fraction.
 * {@link communeReference} computes the median over every mutation of the
 * commune-year editions in hand, which is exactly the set the proxy already
 * downloaded and parsed: no extra request, no extra parse, and a number that
 * does not move when the camera does. It is returned NAMED (`Paris 13e
 * Arrondissement`, `75113`) so the layer can print it in the legend and on
 * every card, because a ratio whose denominator is not written down is not a
 * measurement.
 *
 * Its one failure mode is provable rather than feared: `medianPrixM2` is null
 * only when NO mutation of the editions carries a €/m², and the sales served
 * are a subset of those same mutations — so whenever there is a sale to colour
 * there is a denominator to colour it against. The test asserts that implication
 * rather than trusting it.
 *
 * Side-effect-free: URL construction, CSV parsing and projection only, over
 * one equally side-effect-free import (`scanCells.js`, for its median). The
 * `/api/dvf` proxy runs the projections; the browser imports the few shared
 * rules (`saleKind`, the recency order, the section floor) so both sides of
 * the wire apply the same ones.
 */

import { medianOf } from './scanCells.js';

const FILES_ROOT = 'https://files.data.gouv.fr/geo-dvf/latest/csv';

/** Earliest yearly edition published under `latest`. Measured 2026-09-01. */
export const DVF_FIRST_YEAR = 2021;
/** Default search radius in metres. A buyer's "next door", not a district. */
export const DVF_DEFAULT_RADIUS_M = 300;
/** Ceiling on the radius; past this the comparables stop being comparable. */
export const DVF_MAX_RADIUS_M = 1000;
/** Ceiling on sales served in one answer. */
export const DVF_MAX_SALES = 400;

/**
 * Local types the register prices as a dwelling. `Dépendance` (1,948 of the
 * 3,975 captured rows — the single most common type) is a cellar or a parking
 * space carrying no surface, and counting it as a home is how a block sale
 * turns into a thousand imaginary flats.
 */
// i18n-ignore-next-line — DVF `type_local` values, matched against the register's rows.
export const DWELLING_TYPES = Object.freeze(['Appartement', 'Maison']);

/**
 * The local type that rides along with a dwelling without changing its price
 * basis. A Paris flat is almost always sold with its cellar or parking space:
 * of the 45 mutations within 300 m of the captured point, requiring a sale to
 * contain NOTHING but the dwelling left 10 comparables, while tolerating
 * `Dépendance` leaves 35. Excluding them would not have been conservative, it
 * would have thrown away three quarters of the market. A commercial local is a
 * different matter and still disqualifies the ratio: it prices on its own
 * terms and the register does not say how the total was split.
 */
// i18n-ignore-next-line — a DVF `type_local` value, matched against the register's rows.
export const ANCILLARY_TYPES = Object.freeze(['Dépendance']);

/**
 * WHAT A MUTATION BOUGHT, folded onto the three answers a reader can act on.
 *
 * The register publishes `type_local` per ROW and a mutation is several rows,
 * so "is this a flat or a house" is not a field — it is a reduction, and it
 * has to be made somewhere. Measured within 300 m of rue des Basques in
 * Bayonne over the 2021–2025 editions: 257 mutations of a flat alone, 72 of a
 * flat with its cellar or parking space, 42 of nothing but a commercial local,
 * 14 of a flat together with one, 10 of all three, 4 of a cellar alone, and 1
 * carrying no `type_local` at all.
 *
 * THE DWELLING WINS OVER WHAT RODE ALONG WITH IT. A flat sold with its cellar
 * is a flat; a flat sold with a shop is still, for the purpose of "show me the
 * flats", a flat — and it is already refused a €/m² by `prixM2`, so the map
 * draws it neutral and the card says why. Folding it into `autre` would hide
 * a dwelling transaction from a reader who asked to see dwelling
 * transactions.
 *
 * `maison` OUTRANKS `appartement` in the rare mutation that holds both,
 * because that mutation is a house sold with a flat in it and the house is the
 * building. No captured row shows the case; the rule is one comparison and it
 * stops the answer depending on set iteration order.
 *
 * @param {object} sale One mutation from {@link groupMutations}.
 * @returns {'maison'|'appartement'|'autre'}
 */
export function saleKind(sale) {
  const types = Array.isArray(sale?.types) ? sale.types : [];
  // i18n-ignore-start — DVF `type_local` values in, stable fold keys out (share links use them).
  if (types.includes('Maison')) return 'maison';
  if (types.includes('Appartement')) return 'appartement';
  return 'autre';
  // i18n-ignore-end
}

/**
 * The mutation natures whose `valeur_fonciere` is a PRICE, and so the only
 * ones a price per square metre may be computed from.
 *
 * Found by fixture, not by reading the spec: the captured file holds an
 * `Echange` of a Paris flat declared at **€2,295**, which divides to 66 €/m².
 * A swap's declared value is a balancing payment between two parties, not what
 * the flat is worth, and a single such row inside a thin radius drags a median
 * through the floor. `Adjudication` — a court-ordered auction — is excluded for
 * the neighbouring reason: it is a real price, but not one a buyer can compare
 * a normal listing against. Both are still RETURNED as sales, because they
 * happened; they simply carry `prixM2: null`.
 */
// i18n-ignore-next-line — DVF `nature_mutation` values, as the register publishes them.
export const PRICED_NATURES = Object.freeze(['Vente', "Vente en l'état futur d'achèvement"]);

/**
 * Resolve the département directory a commune file lives under.
 *
 * Overseas codes are three digits (`97213`), Corsican ones carry a letter
 * (`2A004`); both are handled by the same two rules, so this is one function
 * rather than a special case at each call site.
 * @param {string} communeCode INSEE code, arrondissement-level where one exists.
 * @returns {string}
 */
export function departementOf(communeCode) {
  const code = String(communeCode || '').trim().toUpperCase();
  if (!/^[0-9][0-9AB][0-9]{3}$/.test(code)) throw new Error(`dvf: invalid commune code ${communeCode}`); // i18n-ignore-line — developer error
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * The départements the register does not reach, and never will under this name.
 *
 * The Bas-Rhin, the Haut-Rhin and the Moselle keep the **livre foncier**, a
 * land register inherited from German law and held by the judiciary rather than
 * by the DGFiP; Mayotte's cadastre is not in the *fichier immobilier* either.
 * Their transfers are recorded — they are simply not in THIS file.
 *
 * MEASURED 2026-09-08 against the 2024 edition: `67482` (Strasbourg), `57463`
 * (Metz), `68224` (Mulhouse) and `97611` (Mamoudzou) each answer **404 with a
 * 233-byte body**, while `97411` (Saint-Denis de La Réunion) answers 200 with
 * 647,463 bytes — so the hole is these four départements and not "the overseas
 * territories", which is the guess that would have been wrong.
 *
 * The reason this is a named constant rather than an empty result: a 404 and an
 * empty commune are indistinguishable downstream, and "no sale was recorded
 * around this address" is a statement about a market while "the register does
 * not cover this département" is a statement about a file. Three million people
 * live under the second one.
 */
export const DVF_UNCOVERED_DEPARTEMENTS = Object.freeze(['57', '67', '68', '976']);

/**
 * Whether the register covers the département a commune sits in.
 * @param {?string} communeCode INSEE code, or null when none was resolved.
 * @returns {{basis: string, departement: ?string}} `basis` is `'dvf'`,
 *   `'livre-foncier'`, or `'unknown'` when there is no commune to test.
 */
export function dvfCoverage(communeCode) {
  const code = String(communeCode || '').trim().toUpperCase();
  if (!/^[0-9][0-9AB][0-9]{3}$/.test(code)) return { basis: 'unknown', departement: null };
  const departement = departementOf(code);
  return {
    basis: DVF_UNCOVERED_DEPARTEMENTS.includes(departement) ? 'livre-foncier' : 'dvf',
    departement,
  };
}

/**
 * Build the URL of one commune-year edition.
 * @param {{year: number|string, communeCode: string}} query
 * @returns {string}
 */
export function buildDvfUrl({ year, communeCode }) {
  const parsedYear = Number.parseInt(String(year), 10);
  if (!Number.isFinite(parsedYear) || parsedYear < DVF_FIRST_YEAR) {
    throw new Error(`dvf: year ${year} is before the first published edition`);
  }
  const code = String(communeCode).trim().toUpperCase();
  return `${FILES_ROOT}/${parsedYear}/communes/${departementOf(code)}/${code}.csv`; // i18n-ignore-line — URL path
}

/**
 * Coerce a query value to a number, treating ABSENT as absent.
 *
 * `URLSearchParams.get()` returns `null` for a missing parameter, `Number(null)`
 * is `0`, and `Number.isFinite(0)` is true — so a plain `Number()` turns "the
 * caller said nothing" into "the caller said zero", and every clamp below then
 * returns its MINIMUM instead of its default. Measured live: `GET /api/dpe`
 * with no `radius` scanned 50 m rather than the documented 200 m, and returned
 * `total: 0` for an address with 2,805 diagnostics around it. Same root cause
 * as the `addressPoint` guard in `vite.config.js`.
 *
 * @param {unknown} value
 * @returns {number|null} A finite number, or null when nothing usable was given.
 */
function requestedNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Clamp a requested radius into the range this layer will serve.
 * @param {unknown} value
 * @returns {number}
 */
export function clampDvfRadius(value) {
  const requested = requestedNumber(value);
  if (requested === null) return DVF_DEFAULT_RADIUS_M;
  return Math.min(DVF_MAX_RADIUS_M, Math.max(50, Math.round(requested)));
}

/**
 * Parse a DVF CSV body into row objects.
 *
 * The captured file holds no quoted field at all, so a `split(',')` would work
 * today. Quotes are honoured anyway because a street name containing a comma
 * would not fail loudly — it would shift every later column by one and publish
 * a longitude as a surface, which is the kind of wrong that survives review.
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function parseDvfCsv(text) {
  const body = String(text ?? '');
  if (!body.trim()) return [];
  const rows = [];
  let header = null;
  let field = '';
  let record = [];
  let quoted = false;
  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => {
    endField();
    if (record.length > 1 || record[0] !== '') {
      if (!header) header = record;
      else rows.push(Object.fromEntries(header.map((key, i) => [key, record[i] ?? ''])));
    }
    record = [];
  };
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { endField(); continue; }
    if (char === '\n') { endRecord(); continue; }
    if (char === '\r') continue;
    field += char;
  }
  if (field !== '' || record.length) endRecord();
  return rows;
}

/** Parse a numeric CSV cell, treating an empty cell as absent rather than 0. */
function num(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Group rows into mutations — the unit a price actually belongs to.
 *
 * Each mutation keeps its lot composition (how many dwellings, how much
 * surface, which types) because that composition is what decides whether a
 * price per square metre means anything. The position is taken from the first
 * row that carries one; 8 of 3,975 captured rows carry none, and a mutation
 * where no row does is returned with `lon`/`lat` null rather than dropped, so
 * a caller can still count it.
 *
 * @param {Array<Record<string, string>>} rows
 * @returns {Array<object>} One entry per `id_mutation`.
 */
export function groupMutations(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id_mutation || '').trim();
    if (!id) continue;
    let mutation = byId.get(id);
    if (!mutation) {
      mutation = {
        id,
        date: row.date_mutation || null,
        nature: row.nature_mutation || null,
        // Restated identically on every row of the sale; read once.
        valeur: num(row.valeur_fonciere),
        commune: row.nom_commune || null,
        communeCode: row.code_commune || null,
        address: [row.adresse_numero, row.adresse_suffixe, row.adresse_nom_voie]
          .filter((part) => part && String(part).trim()).join(' ') || null,
        parcelle: row.id_parcelle || null,
        lon: null,
        lat: null,
        rowCount: 0,
        dwellingCount: 0,
        dwellingSurface: 0,
        ancillaryCount: 0,
        otherCount: 0,
        types: new Set(),
        rooms: null,
        terrain: 0,
      };
      byId.set(id, mutation);
    }
    mutation.rowCount += 1;
    const type = (row.type_local || '').trim();
    if (type) mutation.types.add(type);
    if (mutation.lon === null) {
      const lon = num(row.longitude);
      const lat = num(row.latitude);
      if (lon !== null && lat !== null) { mutation.lon = lon; mutation.lat = lat; }
    }
    const surface = num(row.surface_reelle_bati);
    if (DWELLING_TYPES.includes(type)) {
      mutation.dwellingCount += 1;
      if (surface !== null) mutation.dwellingSurface += surface;
      const rooms = num(row.nombre_pieces_principales);
      if (mutation.rooms === null && rooms !== null) mutation.rooms = rooms;
    } else if (ANCILLARY_TYPES.includes(type)) {
      mutation.ancillaryCount += 1;
    } else if (type) {
      mutation.otherCount += 1;
    }
    const terrain = num(row.surface_terrain);
    if (terrain !== null) mutation.terrain += terrain;
  }
  return [...byId.values()].map((mutation) => ({
    ...mutation,
    types: [...mutation.types].sort(),
    // The ratio is a comparable ONLY for a sale that bought exactly one
    // dwelling, with or without its cellar. A 179-lot building or a flat sold
    // together with a shop gets null — see ANCILLARY_TYPES for why the cellar
    // is the one companion that does not disqualify the ratio.
    prixM2: mutation.dwellingCount === 1 && mutation.dwellingSurface > 0
      && mutation.valeur !== null && mutation.otherCount === 0
      && PRICED_NATURES.includes(mutation.nature)
      ? Math.round(mutation.valeur / mutation.dwellingSurface)
      : null,
  }));
}

/**
 * Great-circle distance in metres.
 *
 * Exported so that `avisValeurFeed.js` measures a comparable's distance with
 * the very function that decided which sales the map drew. Two haversines that
 * agree to the metre today are two haversines that can disagree tomorrow, and
 * an estimate whose 300 m circle is not the map's 300 m circle would be
 * unarguable in exactly the way this repository refuses.
 */
export function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Percentile of a sorted numeric array, linearly interpolated.
 * @param {number[]} sorted @param {number} fraction
 * @returns {number|null}
 */
export function percentile(sorted, fraction) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (position - low));
}

/**
 * Pick the value that appears most often, ties broken by first appearance.
 * A commune-year file carries one `nom_commune`; this exists so that a merged
 * multi-year set with one malformed row still names the commune it is mostly
 * about rather than whichever row happened to come first.
 * @param {Array<?string>} values
 * @returns {?string}
 */
function dominant(values) {
  const tally = new Map();
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    tally.set(value, (tally.get(value) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) { best = value; bestCount = count; }
  }
  return best;
}

/**
 * The NAMED denominator the map divides every price by.
 *
 * This is the C1 fix, and it is deliberately computed from the WHOLE argument
 * rather than from the selection: `mutations` is every sale of the commune-year
 * editions the proxy fetched, so the answer is a property of a territory and a
 * set of editions, not of a camera. Pan across the arrondissement, widen the
 * radius from 50 m to 1 km, share the link — the number is the same, and the
 * doctrine's C1 test ("widen the framing; did the first zone change colour?")
 * answers no.
 *
 * It is NOT a national scale, and that is the point: against a national ramp
 * every Paris sale is the same red and the layer stops answering the question a
 * buyer asks, which is "is this one dear FOR HERE". The commune — the
 * arrondissement, where one exists, because that is how the register itself is
 * published — is the smallest territory that has a name, a boundary the reader
 * already holds, and enough sales to have a median.
 *
 * `basis` is `'commune'` or `'none'`, never a silent fallback: a caller that
 * gets `'none'` is expected to say so on screen rather than quietly divide by
 * something else. `'none'` means the editions in hand hold no comparable at
 * all, which — since the served sales are a subset of these same mutations —
 * also means there is nothing on screen to colour.
 *
 * @param {Array<object>} mutations Output of {@link groupMutations}, whole editions.
 * @returns {{basis: string, code: ?string, name: ?string, count: number,
 *   comparableCount: number, unplacedCount: number, medianPrixM2: ?number,
 *   p25PrixM2: ?number, p75PrixM2: ?number, codeCount: number}}
 */
export function communeReference(mutations) {
  const list = Array.isArray(mutations) ? mutations : [];
  const ratios = [];
  const codes = [];
  const names = [];
  let unplacedCount = 0;
  for (const mutation of list) {
    if (typeof mutation?.prixM2 === 'number' && Number.isFinite(mutation.prixM2)) {
      ratios.push(mutation.prixM2);
    }
    // Counted here because this is the only place that sees the WHOLE edition:
    // `selectNearbySales` drops a mutation with no coordinate before it can be
    // measured against a radius, and 8 of the 3,975 captured rows carry none.
    // A sale nobody can draw is still a sale that happened (A5).
    if (mutation?.lon === null || mutation?.lat === null
      || mutation?.lon === undefined || mutation?.lat === undefined) unplacedCount += 1;
    codes.push(mutation?.communeCode ?? null);
    names.push(mutation?.commune ?? null);
  }
  ratios.sort((a, b) => a - b);
  const median = percentile(ratios, 0.5);
  return {
    basis: median === null ? 'none' : 'commune', // i18n-ignore-line — stable basis key
    code: dominant(codes),
    name: dominant(names),
    // A set that spans two commune codes is not supposed to happen — the proxy
    // fetches one commune's editions — so it is REPORTED rather than averaged
    // away: a denominator built from two territories names neither of them.
    codeCount: new Set(codes.filter(Boolean)).size,
    count: list.length,
    comparableCount: ratios.length,
    unplacedCount,
    medianPrixM2: median,
    p25PrixM2: percentile(ratios, 0.25),
    p75PrixM2: percentile(ratios, 0.75),
  };
}

/**
 * Select the mutations within `radiusM` of a point and summarise them.
 *
 * The summary reports `comparableCount` beside `count` on purpose: a reader
 * must be able to see that 40 sales were found but only 12 of them yielded a
 * defensible price per square metre. Collapsing that gap would present a
 * median computed from a quarter of the data as if it came from all of it.
 *
 * TWO MEDIANS COME OUT OF HERE AND THEY DO NOT DO THE SAME JOB.
 * `summary.medianPrixM2` describes THIS RADIUS — a statistic about the block,
 * legitimate to print, worthless as a denominator because it moves with the
 * camera. `summary.reference` is the commune median ({@link communeReference}),
 * computed over the whole argument, and it is the only thing a colour may be
 * divided by. They are separate fields rather than one renamed field precisely
 * so that a future caller has to choose, out loud, which one it means.
 *
 * @param {Array<object>} mutations Output of {@link groupMutations}.
 * @param {{lon: number, lat: number}} origin
 * @param {number} radiusM
 * @returns {{sales: Array<object>, summary: object}}
 */
export function selectNearbySales(mutations, origin, radiusM) {
  const radius = clampDvfRadius(radiusM);
  const near = [];
  for (const mutation of Array.isArray(mutations) ? mutations : []) {
    if (mutation.lon === null || mutation.lat === null) continue;
    const distanceM = haversineM(origin.lat, origin.lon, mutation.lat, mutation.lon);
    if (distanceM > radius) continue;
    near.push({ ...mutation, distanceM: Math.round(distanceM) });
  }
  near.sort((a, b) => a.distanceM - b.distanceM);
  const served = near.slice(0, DVF_MAX_SALES);
  const ratios = near.map((sale) => sale.prixM2).filter((value) => value !== null).sort((a, b) => a - b);
  const perYear = {};
  for (const sale of near) {
    const year = String(sale.date || '').slice(0, 4);
    if (!year) continue;
    (perYear[year] ||= []).push(sale.prixM2);
  }
  return {
    sales: served,
    summary: {
      count: near.length,
      served: served.length,
      truncated: near.length > served.length,
      comparableCount: ratios.length,
      // The block statistic. Printed, never divided by — see the doc comment.
      medianPrixM2: percentile(ratios, 0.5),
      // The denominator, named. Built from every mutation handed in, not from
      // the ones the radius kept.
      reference: communeReference(mutations),
      p25PrixM2: percentile(ratios, 0.25),
      p75PrixM2: percentile(ratios, 0.75),
      radiusM: radius,
      perYear: Object.fromEntries(Object.entries(perYear).map(([year, values]) => {
        const usable = values.filter((value) => value !== null).sort((a, b) => a - b);
        return [year, { count: values.length, comparableCount: usable.length, medianPrixM2: percentile(usable, 0.5) }];
      })),
    },
  };
}

/* ── the area regimes ───────────────────────────────────────────────────── */

/**
 * Compare two mutations by how recent they are: date first, then the larger
 * dwelling surface, then the id, so the answer never depends on the order the
 * editions were concatenated in.
 *
 * It lives HERE, beside the register, because two callers on either side of
 * the wire must agree on it. `dvfSales.js` reduces the sales of one plot to
 * the one its wash is painted from; the `/api/dvf` proxy does the same
 * reduction for a whole box of plots before any of them reaches the browser.
 * Two copies that agree today are two copies that can disagree tomorrow, and
 * a plot would then change colour on the way through 600 m with no row of
 * data changed.
 *
 * @returns {number} > 0 when `a` is the more recent.
 */
export function compareMutationRecency(a, b) {
  const dateA = String(a?.date || '');
  const dateB = String(b?.date || '');
  // ISO `YYYY-MM-DD`, so a string compare IS a date compare. An empty date
  // sorts below every real one rather than throwing the sale away.
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  const surfaceA = Number.isFinite(a?.dwellingSurface) ? a.dwellingSurface : 0;
  const surfaceB = Number.isFinite(b?.dwellingSurface) ? b.dwellingSurface : 0;
  if (surfaceA !== surfaceB) return surfaceA - surfaceB;
  const idA = String(a?.id || '');
  const idB = String(b?.id || '');
  return idA === idB ? 0 : (idA < idB ? -1 : 1);
}

/**
 * N mutations on one plot → the one it speaks for. See
 * {@link compareMutationRecency}, and `dvfSales.js` for why recency and not a
 * median.
 * @param {Array<object>} mutations
 * @returns {?object}
 */
export function mostRecentMutation(mutations) {
  let best = null;
  for (const mutation of Array.isArray(mutations) ? mutations : []) {
    if (!mutation) continue;
    if (!best || compareMutationRecency(mutation, best) > 0) best = mutation;
  }
  return best;
}

/**
 * The cadastral section a parcel belongs to: the first ten characters of its
 * identifier — commune (5), prefix (3), section (2).
 *
 * MEASURED, not assumed: over the 12 039 parcels Etalab publishes for Paris 16e
 * and Boulogne-Billancourt, every one of them carries the id of a section of
 * the same edition's section file as its prefix — zero misses. `id_parcelle`
 * in DVF is the same 14-character key (see `vite.config.js`, 400 of 400
 * joined), so a sale reaches its section with no lookup at all.
 *
 * @param {?string} parcelId
 * @returns {?string}
 */
export function sectionIdOf(parcelId) {
  const id = String(parcelId || '').trim();
  return id.length === 14 ? id.slice(0, 10) : null;
}

/**
 * Fewest priced sales a SECTION needs before it is painted in a price class.
 *
 * The discs this regime replaced needed no floor: their AREA was the count,
 * so a one-sale disc was a speck. A section's area is the cadastre's, and a
 * rural section can be two square kilometres — painted from one sale it would
 * be a statement about a whole hillside made by one house. Three is the
 * smallest sample whose median is not simply one of its members' prices
 * standing alone. A section under it is still drawn, in the neutral, and its
 * card gives the count: the sales happened, the median would be a guess.
 */
export const DVF_SECTION_MIN_PRICED = 3;

/** A point inside the box, west and south inclusive, east and north not. */
function insideBox(mutation, box) {
  return mutation.lon >= box.west && mutation.lon < box.east
    && mutation.lat >= box.south && mutation.lat < box.north;
}

/**
 * What both area regimes start from: one reference per commune, and every
 * geocoded mutation divided by the median of ITS OWN commune.
 *
 * ONE REFERENCE PER COMMUNE, NEVER ONE FOR THE BOX. This is the rule
 * {@link communeReference} already enforces by REPORTING `codeCount` instead
 * of averaging across codes, and a box is the caller that can actually
 * straddle two: 0.02° at Lyon spans four arrondissements and a slice of
 * Villeurbanne. A single blended denominator would paint Villeurbanne against
 * Lyon 6e's prices and call the difference a market.
 *
 * @param {Array<{commune: ?object, mutations: Array<object>}>} editions
 * @returns {{references: Array<object>, rows: Array<object>}}
 */
function areaInputs(editions) {
  const rows = [];
  const references = [];
  for (const edition of Array.isArray(editions) ? editions : []) {
    const mutations = Array.isArray(edition?.mutations) ? edition.mutations : [];
    if (!mutations.length) continue;
    const reference = communeReference(mutations);
    references.push({
      code: edition?.commune?.code ?? reference.code,
      // The REGISTER's name first, as the disc regime does (`dvfReference`):
      // the BAN answers « Paris » for every arrondissement, and a key listing
      // « Paris 9 615 €/m² · Paris 10 972 €/m² » names neither.
      name: reference.name ?? edition?.commune?.name ?? null,
      medianPrixM2: reference.medianPrixM2,
      // The denominator's OWN sample size — the whole commune over the whole
      // window — because that is what the median was computed on. It is not the
      // number of sales on screen, and conflating the two would let a reader
      // read a commune median as a statistic about their viewport.
      count: reference.count,
      comparableCount: reference.comparableCount,
    });
    const median = reference.medianPrixM2;
    for (const mutation of mutations) {
      if (!Number.isFinite(mutation?.lon) || !Number.isFinite(mutation?.lat)) continue;
      const priced = typeof mutation.prixM2 === 'number' && Number.isFinite(mutation.prixM2)
        && mutation.prixM2 > 0;
      rows.push({
        mutation,
        prixM2: priced ? mutation.prixM2 : null,
        // Null rather than 1 when there is no denominator: a sale in a commune
        // whose edition prices nothing is not a sale at the median.
        ratio: priced && median ? mutation.prixM2 / median : null,
        // The EDITION's code first: it is the one the references are keyed by
        // and the one the proxy fetches the commune's cadastre under.
        communeCode: edition?.commune?.code ?? mutation.communeCode ?? null,
      });
    }
  }
  references.sort((a, b) => (b.count || 0) - (a.count || 0));
  return { references, rows };
}

/** A ratio rounded for the wire: four decimals is 0.01 % of a class width. */
function wireRatio(ratio) {
  return typeof ratio === 'number' && Number.isFinite(ratio) ? Number(ratio.toFixed(4)) : null;
}

/** The median of a list of numbers, rounded to the euro, or null. */
function roundedMedian(values) {
  const median = medianOf(values);
  return median === null ? null : Math.round(median);
}

/**
 * The one mutation a plot is painted from, cut down to what its card prints.
 *
 * Not the whole mutation: a dense box holds 1 700 plots, and the fields the
 * card never reads — the commune name the reference already carries, the row
 * count, the ancillary tallies — would be a third of the payload.
 * @param {object} mutation
 * @returns {object}
 */
function plotSale(mutation) {
  return {
    date: mutation.date ?? null,
    nature: mutation.nature ?? null,
    valeur: mutation.valeur ?? null,
    types: Array.isArray(mutation.types) ? mutation.types : [],
    prixM2: Number.isFinite(mutation.prixM2) ? mutation.prixM2 : null,
    dwellingSurface: Number.isFinite(mutation.dwellingSurface) ? mutation.dwellingSurface : 0,
    dwellingCount: Number.isFinite(mutation.dwellingCount) ? mutation.dwellingCount : 0,
    address: mutation.address ?? null,
  };
}

/**
 * The unit a ring is sent in: 1e-5 degree — 1.1 m of latitude, 0.7 m of
 * longitude in France, under two pixels from 600 m, where the area regimes
 * start.
 */
export const DVF_RING_SCALE = 1e5;

/**
 * One ring as a flat list of integers: the first vertex in 1e-5 degree, then
 * each vertex as its offset from the previous one.
 *
 * WHY NOT `[[lon, lat], …]` LIKE THE DISC REGIME. The area answers are the
 * biggest this route serves and the address cache keeps 300 answers whole in
 * the server's memory. Measured on the densest Paris 16e box (1 207 plots,
 * 18 984 vertices): 660 KB of JSON and **2.05 MB of heap** as nested pairs —
 * every vertex its own array of two boxed doubles. Flat small integers are
 * what V8 packs tightest, and the offsets are two- and three-digit numbers
 * on the wire. A vertex that rounds onto the one before it is dropped: at
 * this unit it adds nothing but bytes.
 *
 * @param {Array<number[]>} ring `[[lon, lat], …]`, open or closed.
 * @returns {number[]}
 */
export function encodeRing(ring) {
  const out = [];
  let lastX = null;
  let lastY = null;
  for (const point of Array.isArray(ring) ? ring : []) {
    const x = Math.round(Number(point?.[0]) * DVF_RING_SCALE);
    const y = Math.round(Number(point?.[1]) * DVF_RING_SCALE);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (lastX === null) out.push(x, y);
    else if (x !== lastX || y !== lastY) out.push(x - lastX, y - lastY);
    else continue;
    lastX = x;
    lastY = y;
  }
  return out;
}

/**
 * The inverse of {@link encodeRing}: `[[lon, lat], …]` in degrees.
 * @param {number[]} flat
 * @returns {Array<number[]>}
 */
export function decodeRing(flat) {
  const ring = [];
  if (!Array.isArray(flat) || flat.length < 2) return ring;
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    ring.push([x / DVF_RING_SCALE, y / DVF_RING_SCALE]);
  }
  return ring;
}

/**
 * Every ring of a shape's parts through {@link encodeRing}. A part whose outer
 * ring collapses under three vertices is dropped whole — its holes would
 * otherwise be promoted to an outline — and a collapsed hole just goes.
 */
export function encodeParts(parts) {
  const out = [];
  for (const rings of Array.isArray(parts) ? parts : []) {
    const encoded = (Array.isArray(rings) ? rings : []).map(encodeRing);
    if (!encoded.length || encoded[0].length < 6) continue;
    out.push([encoded[0], ...encoded.slice(1).filter((ring) => ring.length >= 6)]);
  }
  return out;
}

/** Every ring of a shape's parts through {@link decodeRing}. */
export function decodeParts(parts) {
  return (Array.isArray(parts) ? parts : []).map((rings) => (Array.isArray(rings) ? rings : [])
    .map(decodeRing));
}

/**
 * The fine area regime: every PLOT a sale in the box names, painted from its
 * most recent mutation — the same reduction, and the same colour, the plot
 * already takes below 600 m under its markers.
 *
 * WHY PLOTS AND NOT CELLS. The 150 m discs this replaced were a median over a
 * patch of ground that matched nothing on it: a disc straddled two blocks and a
 * boulevard, and the reader asked for « les parcelles en question » instead of
 * « ces cercles d'affichage par zone » (2026-09-21). The register names the
 * plot of every sale, so the plot is the honest unit — and at the altitudes of
 * this band (600 m to 1 800 m) a Paris plot of 20 to 50 m is 20 to 60 pixels.
 *
 * MEASURED BEFORE IT WAS BUILT, over 0.02° boxes and editions 2023–2025:
 * Paris 16e La Muette 3 964 mutations → 1 207 plots, 18 984 vertices, 94 KB
 * gzipped as five-decimal pairs (70 KB served, see {@link encodeRing});
 * Paris 15e Beaugrenelle 5 516 → 1 493 plots;
 * Paris 17e Ternes 5 213 → 1 698 plots, 149 KB; Issy-les-Moulineaux 1 758 →
 * 509 plots, 50 KB. The cadastre layer already draws up to 5 000 parcels in
 * one view, so the densest box is a third of a load the globe carries.
 *
 * A PLOT IS SELECTED BY ITS SALE'S POSITION, and every sale of it counts.
 * DVF geolocates a mutation at its plot, so "a sale in the box" and "a plot in
 * the box" are the same test; a plot straddling the box edge is drawn whole.
 * `count` is how many mutations the plot holds over the editions in hand — the
 * card says it, so « le dernier de 7 » is readable next to the price.
 *
 * @param {Array<{commune: ?object, mutations: Array<object>}>} editions
 * @param {{south: number, west: number, north: number, east: number}} box
 * @returns {{plots: Array<object>, summary: object}}
 */
export function aggregateSalesIntoPlots(editions, box) {
  const { references, rows } = areaInputs(editions);
  const inBox = rows.filter((row) => insideBox(row.mutation, box));
  const byPlot = new Map();
  let unplotted = 0;
  for (const row of inBox) {
    const id = String(row.mutation.parcelle || '').trim();
    // A mutation the register files under no plot is a sale nobody can draw
    // on the ground. Counted, never moved to a neighbour's plot.
    if (!id) { unplotted += 1; continue; }
    const held = byPlot.get(id);
    if (held) held.push(row); else byPlot.set(id, [row]);
  }
  const plots = [];
  for (const [id, list] of byPlot) {
    const latest = mostRecentMutation(list.map((row) => row.mutation));
    const row = list.find((entry) => entry.mutation === latest);
    plots.push({
      id,
      communeCode: row.communeCode,
      count: list.length,
      // The latest sale's own ratio, NOT a median of the plot's: see
      // `dvfSales.js` — a median of five years publishes a price nobody paid.
      ratio: wireRatio(row.ratio),
      sale: plotSale(latest),
    });
  }
  // Stable order, so two identical answers serialise identically.
  plots.sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
  const prices = inBox.map((row) => row.prixM2).filter((value) => value !== null);
  return {
    plots,
    summary: {
      basis: 'plots',
      count: inBox.length,
      pricedCount: prices.length,
      plots: plots.length,
      pricedPlots: plots.filter((plot) => plot.ratio !== null).length,
      unplotted,
      // The box statistic: printed, never divided by. Same rule as
      // `selectNearbySales`'s `medianPrixM2`, for the same reason.
      medianPrixM2: roundedMedian(prices),
      references,
    },
  };
}

/**
 * The coarse area regime: every cadastral SECTION a sale in the box falls in,
 * painted by the median of its sales' ratios.
 *
 * WHY SECTIONS AND NOT PLOTS UP HERE. Measured over the 0.08° box west of
 * Paris (1 800 m to 12 km of altitude): 38 087 mutations name 11 547 plots,
 * 170 297 vertices, 875 KB gzipped — and at five kilometres a Paris plot is
 * five pixels. The same box holds 413 sections and 11 063 vertices. A section
 * is the cadastre's own subdivision of a commune, a few blocks in a city and a
 * hamlet's fields in the country, so the shapes still follow the streets where
 * the 850 m discs this replaced fell across them.
 *
 * THE WHOLE SECTION, NOT ITS SLICE OF THE BOX. A section is selected when any
 * of its sales lands in the box, and then EVERY sale of it in the editions is
 * counted: the shape is drawn whole, so its colour has to describe the whole
 * shape. The commune's editions are already in memory — this costs no request.
 *
 * A MEDIAN OF RATIOS, NOT A RATIO OF MEDIANS — although a section, unlike the
 * cells before it, never straddles a commune, so the two agree here up to
 * rounding. It is kept for the reason it was chosen: the colour language is
 * the one the sales speak below 600 m, one frozen ramp around one named
 * reference, and only the unit moves.
 *
 * `medianRatio` is published even under {@link DVF_SECTION_MIN_PRICED}; the
 * floor is applied where the colour is chosen, so the card can still print a
 * median it is refusing to paint.
 *
 * @param {Array<{commune: ?object, mutations: Array<object>}>} editions
 * @param {{south: number, west: number, north: number, east: number}} box
 * @returns {{sections: Array<object>, summary: object}}
 */
export function aggregateSalesIntoSections(editions, box) {
  const { references, rows } = areaInputs(editions);
  const touched = new Set();
  let inBox = 0;
  let unplotted = 0;
  for (const row of rows) {
    if (!insideBox(row.mutation, box)) continue;
    inBox += 1;
    const section = sectionIdOf(row.mutation.parcelle);
    if (section) touched.add(section); else unplotted += 1;
  }
  const bySection = new Map();
  for (const row of rows) {
    const section = sectionIdOf(row.mutation.parcelle);
    if (!section || !touched.has(section)) continue;
    const held = bySection.get(section);
    if (held) held.push(row); else bySection.set(section, [row]);
  }
  const sections = [];
  for (const [id, list] of bySection) {
    const prices = list.map((row) => row.prixM2).filter((value) => value !== null);
    const ratios = list.map((row) => row.ratio).filter((value) => value !== null);
    sections.push({
      id,
      communeCode: list[0].communeCode,
      count: list.length,
      pricedCount: prices.length,
      medianPrixM2: roundedMedian(prices),
      medianRatio: wireRatio(medianOf(ratios)),
      years: [...new Set(list.map((row) => Number(String(row.mutation.date || '').slice(0, 4)))
        .filter(Boolean))].sort(),
    });
  }
  sections.sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
  // COUNTED OFF THE SECTIONS DRAWN, NOT OFF `rows`, which holds every
  // geocoded mutation of every commune the box touched — whole
  // arrondissements — while the drawing covers a fraction of them.
  const drawnRows = sections.length ? [...bySection.values()].flat() : [];
  const prices = drawnRows.map((row) => row.prixM2).filter((value) => value !== null);
  return {
    sections,
    summary: {
      basis: 'sections',
      count: drawnRows.length,
      pricedCount: prices.length,
      inBox,
      sections: sections.length,
      paintedSections: sections
        .filter((section) => section.pricedCount >= DVF_SECTION_MIN_PRICED
          && section.medianRatio !== null).length,
      minPriced: DVF_SECTION_MIN_PRICED,
      unplotted,
      medianPrixM2: roundedMedian(prices),
      references,
    },
  };
}
