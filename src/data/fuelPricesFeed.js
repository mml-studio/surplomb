/**
 * Fuel prices (FR) — the pure half of the `fuel-prices-fr` layer.
 *
 * Shared by the server route (`src/data/fuelPricesServer.js`, mounted by
 * `vite.config.js`) and the layer module (`src/data/fuelPricesFrance.js`), so
 * nothing in here touches the network, the disk or Cesium.
 *
 * WHAT THE LAYER ANSWERS. One question, per filling station: has the price of
 * diesel (*gazole*) come down since the State began selling its strategic
 * stocks on 1 November 2026? The answer is a difference between two published
 * numbers, and both are the State's own:
 *
 *   now     the station's latest declared price, from the instant feed
 *           (`prix-des-carburants-en-france-flux-instantane-v2`, Licence
 *           Ouverte, refreshed every ten minutes upstream);
 *   before  the station's mean daily price over 24 → 30 October 2026, frozen
 *           at build time from the yearly history file
 *           (`scripts/build-fuel-fr-reference.mjs`, `local_data/fuel_fr/`).
 *
 * The window and its rules are the ones a pre-registered analysis of the same
 * measure uses, so a reader comparing this map to that analysis compares like
 * with like. The difference includes whatever the wholesale market did over
 * the same weeks: the card says so, because a drop on this map is not, by
 * itself, the share of the drop the measure caused.
 *
 * THE FEED'S CLOCK IS PARIS WALL TIME WEARING A UTC SUFFIX. Measured
 * 2026-11-23 at 08:20 UTC: the newest `gazole_maj` read `2026-11-23T09:10:01
 * +00:00`, fifty minutes in the future. The yearly file declares the same
 * instants as local time, and the export appends `+00:00` to them. The offset
 * is therefore dropped and the wall time read in Europe/Paris.
 */

/** The layer id, shared by the route, the layer and the registries. */
export const FUEL_FR_LAYER_ID = 'fuel-prices-fr';

/** Upstream dataset on data.economie.gouv.fr (Opendatasoft, Licence Ouverte). */
export const FUEL_FR_DATASET = 'prix-des-carburants-en-france-flux-instantane-v2';

/**
 * The six fuels the feed prices, in the order the key offers them.
 *
 * `key` is the feed's column prefix (`<key>_prix`, `<key>_maj`) and the
 * layer's param value; `name` is how `carburants_rupture_temporaire` spells
 * it. The bounds are €/L after the thousandths fix. Diesel and the three
 * petrols keep the pre-registered 1.00-4.00; E85 and LPG cannot, because they
 * are taxed far lower and sell UNDER a euro: measured 2026-11-23 over the
 * prices declared in the last 30 days, E85 median 0.869 (3 381 of 3 596 under
 * 1.00, low 0.659) and LPG median 1.079 (208 of 1 134 under 1.00, low 0.866).
 * A 1.00 floor there would have called nine E85 stations in ten "no price".
 */
export const FUEL_FR_FUELS = Object.freeze([
  Object.freeze({ key: 'gazole', name: 'Gazole', minEurL: 1.0, maxEurL: 4.0 }),
  Object.freeze({ key: 'sp95', name: 'SP95', minEurL: 1.0, maxEurL: 4.0 }),
  Object.freeze({ key: 'sp98', name: 'SP98', minEurL: 1.0, maxEurL: 4.0 }),
  Object.freeze({ key: 'e10', name: 'E10', minEurL: 1.0, maxEurL: 4.0 }),
  Object.freeze({ key: 'e85', name: 'E85', minEurL: 0.5, maxEurL: 2.5 }),
  Object.freeze({ key: 'gplc', name: 'GPLc', minEurL: 0.5, maxEurL: 2.5 }),
]);

/** Every fuel key, in key order. */
export const FUEL_FR_FUEL_KEYS = Object.freeze(FUEL_FR_FUELS.map((fuel) => fuel.key));

/**
 * The export the route reads: every station, its six prices and the fuels it
 * is temporarily out of. Measured 2026-11-23: 9 826 rows, no key, CORS `*`.
 */
export const FUEL_FR_EXPORT_URL =
  `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${FUEL_FR_DATASET}/exports/json`
  + '?select=id,latitude,longitude,cp,ville,adresse,pop,' // i18n-ignore-line — column names
  + FUEL_FR_FUELS.map((fuel) => `${fuel.key}_prix,${fuel.key}_maj`).join(',') // i18n-ignore-line — column names
  + ',carburants_rupture_temporaire'; // i18n-ignore-line — column name

/** A declared price older than this is not a current price (pre-registered rule). */
export const FUEL_FR_MAX_AGE_DAYS = 30;

/** Plausible bounds, €/L, after the thousandths fix (pre-registered rule, diesel and petrols). */
export const FUEL_FR_MIN_EUR_L = 1.0;
export const FUEL_FR_MAX_EUR_L = 4.0;

/**
 * The bands a station's diesel drop falls into, in cents per litre, highest
 * first. 12 and 18 are the bounds of the drop the government announced; 1 is
 * the pre-registered "no drop" threshold. `aucune` therefore also holds the
 * stations whose price ROSE — the card prints the signed number.
 */
export const FUEL_FR_BANDS = Object.freeze([
  Object.freeze({ key: 'forte', minCents: 18 }),
  Object.freeze({ key: 'annoncee', minCents: 12 }),
  Object.freeze({ key: 'partielle', minCents: 1 }),
  Object.freeze({ key: 'aucune', minCents: Number.NEGATIVE_INFINITY }), // i18n-ignore-line — a band key
]);

/** The band of a station with no usable before or now price. */
export const FUEL_FR_UNKNOWN_BAND = 'inconnue';

/** Every band key, in legend order. */
export const FUEL_FR_BAND_KEYS = Object.freeze([
  ...FUEL_FR_BANDS.map((band) => band.key),
  FUEL_FR_UNKNOWN_BAND,
]);

/**
 * Column order of one station row in the route's payload. A row is an array
 * rather than an object because ten thousand of them travel on every load:
 * the keys alone would be a third of the payload.
 */
export const FUEL_FR_ROW = Object.freeze({
  id: 0,
  lat: 1,
  lon: 2,
  brand: 3,
  gazole: 4,
  gazoleAt: 5,
  gazoleBefore: 6,
  e10: 7,
  e10At: 8,
  e10Before: 9,
  city: 10,
  address: 11,
  motorway: 12,
  access: 13,
  // Appended, never interleaved, so a row of the first payload still reads.
  sp95: 14,
  sp95At: 15,
  sp98: 16,
  sp98At: 17,
  e85: 18,
  e85At: 19,
  gplc: 20,
  gplcAt: 21,
  /** Bit `i` set: fuel `FUEL_FR_FUELS[i]` is temporarily out of stock. */
  shortage: 22,
});

/**
 * The fuels a station is temporarily out of, as a bitmask over
 * {@link FUEL_FR_FUELS}. The feed writes them `SP95;E10`, or as an array.
 *
 * A station in shortage has NO price for that fuel in the feed — measured
 * 2026-11-23, 4 of 3 289 temporary shortages still carried one — so without
 * this it would read as a station that does not sell it.
 * @param {unknown} value
 * @returns {number}
 */
export function fuelShortageMask(value) {
  const names = Array.isArray(value) ? value : String(value ?? '').split(/[;,]/);
  let mask = 0;
  for (const raw of names) {
    const name = String(raw ?? '').trim().toLowerCase();
    if (!name) continue;
    const index = FUEL_FR_FUELS.findIndex((fuel) => fuel.name.toLowerCase() === name);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

/**
 * @param {number} mask From {@link fuelShortageMask}.
 * @param {string} fuelKey
 * @returns {boolean}
 */
export function fuelInShortage(mask, fuelKey) {
  const index = FUEL_FR_FUEL_KEYS.indexOf(fuelKey);
  return index >= 0 && Number.isInteger(mask) && (mask & (1 << index)) !== 0;
}

const PARIS_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Europe/Paris offset from UTC at `epochMs`, in milliseconds. */
function parisOffsetMs(epochMs) {
  const parts = Object.fromEntries(
    PARIS_PARTS.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/**
 * Read a feed timestamp as Paris wall time, whatever offset it claims.
 * @param {unknown} value e.g. `2026-11-23T09:10:01+00:00` or `2026-11-23 09:10:01`.
 * @returns {number|null} epoch milliseconds, or null when unreadable.
 */
export function parseParisWallClock(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '0'] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!Number.isFinite(wall)) return null;
  // Two passes: the offset at the guessed instant can differ from the offset at
  // the true one only across a DST change, and the second pass settles it.
  let epoch = wall - parisOffsetMs(wall);
  epoch = wall - parisOffsetMs(epoch);
  return epoch;
}

/**
 * A declared price in €/L, or null. Values above 100 are thousandths of a
 * euro (the yearly file's convention, which the instant feed sometimes keeps).
 * @param {unknown} value
 * @param {{minEurL?: number, maxEurL?: number}} [bounds] A fuel's own bounds
 *   (see {@link FUEL_FR_FUELS}); the diesel ones by default.
 * @returns {number|null}
 */
export function normalizeFuelPrice(value, { minEurL = FUEL_FR_MIN_EUR_L, maxEurL = FUEL_FR_MAX_EUR_L } = {}) {
  let price = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(price)) return null;
  if (price > 100) price /= 1000;
  if (price < minEurL || price > maxEurL) return null;
  return Math.round(price * 1000) / 1000;
}

/**
 * The feed's coordinates are degrees × 100 000, as strings.
 * @param {unknown} value
 * @returns {number|null}
 */
export function feedCoordinate(value) {
  const raw = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw) / 100_000;
}

/**
 * Drop in cents per litre: positive when the price came DOWN.
 * @param {number|null} now
 * @param {number|null} before
 * @returns {number|null} one decimal.
 */
export function fuelDropCents(now, before) {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
  return Math.round((before - now) * 1000) / 10;
}

/**
 * @param {number|null} dropCents
 * @returns {string} a key of {@link FUEL_FR_BAND_KEYS}.
 */
export function fuelBand(dropCents) {
  if (!Number.isFinite(dropCents)) return FUEL_FR_UNKNOWN_BAND;
  return FUEL_FR_BANDS.find((band) => dropCents >= band.minCents).key;
}

/**
 * Join the instant feed onto the frozen reference pack.
 *
 * A station keeps its row even when it has no before price (opened since, or
 * too few declarations in the window) or no current diesel price: it is drawn
 * in the `inconnue` band rather than dropped, so the count on the key is the
 * count of stations the State publishes.
 *
 * @param {Array<object>} records Rows of the export (see {@link FUEL_FR_EXPORT_URL}).
 * @param {object|null} reference The pack written by `build-fuel-fr-reference.mjs`.
 * @param {{now?: number}} [options]
 * @returns {{rows: Array<Array>, counts: object, latestAt: number|null}}
 */
export function joinFuelStations(records, reference, { now = Date.now() } = {}) {
  const refStations = reference?.stations && typeof reference.stations === 'object' ? reference.stations : {};
  const maxAgeMs = FUEL_FR_MAX_AGE_DAYS * 86_400_000;
  const counts = {
    stations: 0,
    noCoordinate: 0,
    gazoleNow: 0,
    gazoleStale: 0,
    gazoleBefore: 0,
    branded: 0,
    bands: Object.fromEntries(FUEL_FR_BAND_KEYS.map((key) => [key, 0])),
    prices: Object.fromEntries(FUEL_FR_FUEL_KEYS.map((key) => [key, 0])),
    shortages: Object.fromEntries(FUEL_FR_FUEL_KEYS.map((key) => [key, 0])),
  };
  const rows = [];
  let latestAt = null;
  const seen = new Set();

  const current = (price, at, bounds) => {
    const value = normalizeFuelPrice(price, bounds);
    const atMs = parseParisWallClock(at);
    if (value === null || atMs === null) return { value: null, atMs: null, stale: false };
    if (now - atMs > maxAgeMs) return { value: null, atMs, stale: true };
    return { value, atMs, stale: false };
  };

  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const lat = feedCoordinate(record.latitude);
    const lon = feedCoordinate(record.longitude);
    if (lat === null || lon === null || (lat === 0 && lon === 0)) {
      counts.noCoordinate += 1;
      continue;
    }
    const ref = Array.isArray(refStations[id]) ? refStations[id] : null;
    const brand = Number.isInteger(ref?.[0]) ? ref[0] : -1;
    const gazoleBefore = Number.isFinite(ref?.[1]) ? ref[1] : null;
    const e10Before = Number.isFinite(ref?.[2]) ? ref[2] : null;
    const access = ref?.[3] ? 1 : 0;

    const prices = {};
    for (const fuel of FUEL_FR_FUELS) {
      prices[fuel.key] = current(record[`${fuel.key}_prix`], record[`${fuel.key}_maj`], fuel); // i18n-ignore-line — column names
      const at = prices[fuel.key].atMs;
      if (Number.isFinite(at) && at <= now + 3_600_000 && (latestAt === null || at > latestAt)) latestAt = at;
      if (prices[fuel.key].value !== null) counts.prices[fuel.key] += 1;
    }
    const { gazole, e10 } = prices;
    const shortage = fuelShortageMask(record.carburants_rupture_temporaire);
    for (const fuel of FUEL_FR_FUELS) {
      if (fuelInShortage(shortage, fuel.key)) counts.shortages[fuel.key] += 1;
    }

    counts.stations += 1;
    if (gazole.value !== null) counts.gazoleNow += 1;
    if (gazole.stale) counts.gazoleStale += 1;
    if (gazoleBefore !== null) counts.gazoleBefore += 1;
    if (brand >= 0) counts.branded += 1;
    counts.bands[fuelBand(fuelDropCents(gazole.value, gazoleBefore))] += 1;

    rows.push([
      id,
      lat,
      lon,
      brand,
      gazole.value,
      gazole.atMs,
      gazoleBefore,
      e10.value,
      e10.atMs,
      e10Before,
      String(record.ville ?? '').trim(),
      String(record.adresse ?? '').trim(),
      String(record.pop ?? '').trim().toUpperCase() === 'A' ? 1 : 0,
      access,
      prices.sp95.value,
      prices.sp95.atMs,
      prices.sp98.value,
      prices.sp98.atMs,
      prices.e85.value,
      prices.e85.atMs,
      prices.gplc.value,
      prices.gplc.atMs,
      shortage,
    ]);
  }
  return { rows, counts, latestAt };
}

/**
 * The route's answer, from a join and the reference pack's provenance.
 * @param {ReturnType<typeof joinFuelStations>} joined
 * @param {object|null} reference
 * @param {{fetchedAt: number, stale?: boolean}} meta
 * @returns {object}
 */
export function fuelPayload(joined, reference, { fetchedAt, stale = false }) {
  return {
    version: 1,
    fetchedAt,
    stale: Boolean(stale),
    latestAt: joined.latestAt,
    columns: Object.keys(FUEL_FR_ROW),
    window: reference?.window || null,
    referenceBuiltAt: reference?.builtAt || null,
    brands: Array.isArray(reference?.brands) ? reference.brands : [],
    brandGroups: Array.isArray(reference?.brandGroups) ? reference.brandGroups : [],
    counts: joined.counts,
    stations: joined.rows,
  };
}

/**
 * One payload row → the properties a GeoJSON Feature carries on the globe.
 * @param {Array} row
 * @param {object} payload
 * @returns {object}
 */
export function fuelStationProps(row, payload) {
  const brandIndex = row[FUEL_FR_ROW.brand];
  const brand = brandIndex >= 0 ? payload?.brands?.[brandIndex] || null : null;
  const gazole = row[FUEL_FR_ROW.gazole];
  const gazoleBefore = row[FUEL_FR_ROW.gazoleBefore];
  const drop = fuelDropCents(gazole, gazoleBefore);
  return {
    id: row[FUEL_FR_ROW.id],
    brand,
    group: brandIndex >= 0 ? payload?.brandGroups?.[brandIndex] || null : null,
    gazole,
    gazoleAt: row[FUEL_FR_ROW.gazoleAt],
    gazoleBefore,
    e10: row[FUEL_FR_ROW.e10],
    e10At: row[FUEL_FR_ROW.e10At],
    e10Before: row[FUEL_FR_ROW.e10Before],
    city: row[FUEL_FR_ROW.city],
    address: row[FUEL_FR_ROW.address],
    motorway: row[FUEL_FR_ROW.motorway] === 1,
    access: row[FUEL_FR_ROW.access] === 1,
    sp95: row[FUEL_FR_ROW.sp95] ?? null,
    sp95At: row[FUEL_FR_ROW.sp95At] ?? null,
    sp98: row[FUEL_FR_ROW.sp98] ?? null,
    sp98At: row[FUEL_FR_ROW.sp98At] ?? null,
    e85: row[FUEL_FR_ROW.e85] ?? null,
    e85At: row[FUEL_FR_ROW.e85At] ?? null,
    gplc: row[FUEL_FR_ROW.gplc] ?? null,
    gplcAt: row[FUEL_FR_ROW.gplcAt] ?? null,
    shortage: Number.isInteger(row[FUEL_FR_ROW.shortage]) ? row[FUEL_FR_ROW.shortage] : 0,
    dropCents: drop,
    e10DropCents: fuelDropCents(row[FUEL_FR_ROW.e10], row[FUEL_FR_ROW.e10Before]),
    band: fuelBand(drop),
  };
}

// ── The readings the key offers ──────────────────────────────────────────
//
// The layer was built to answer one question (did the drop arrive?) and is
// read for a second one as well: where is it cheapest? The second is a
// PRICE, per fuel, so the key offers one reading per fuel next to the drop.
//
// The diesel PRICE opens the layer, not the drop (owner's call, 2026-11-23):
// the price is what every visitor can act on, the drop is a question about one
// measure and one month. The drop stays one chip away, last in the row.

/** The drop reading (diesel only: the measure and its before-window are diesel's). */
export const FUEL_FR_DROP_VIEW = 'baisse';

/** The reading the layer opens on: the diesel price. */
export const FUEL_FR_DEFAULT_VIEW = 'gazole';

/** Every reading, in key order: one price reading per fuel, then the drop. */
export const FUEL_FR_VIEWS = Object.freeze([...FUEL_FR_FUEL_KEYS, FUEL_FR_DROP_VIEW]);

/**
 * The band of a station in shortage of the fuel the reading is about. Its
 * own band, not « no price », because the reader who wants a full tank needs
 * to tell « out of it today » from « never sold it » — and to hide the first.
 */
export const FUEL_FR_SHORTAGE_BAND = 'rupture';

/** Price bands, cheapest first: the national quintiles of the fuel read. */
export const FUEL_FR_PRICE_BAND_KEYS = Object.freeze(['p1', 'p2', 'p3', 'p4', 'p5']);

/**
 * Every band a reading can put a station in, in key order. The drop bands,
 * the price bands, then shortage and « not measurable », which both readings
 * share.
 */
export const FUEL_FR_ALL_BAND_KEYS = Object.freeze([
  ...FUEL_FR_BANDS.map((band) => band.key),
  ...FUEL_FR_PRICE_BAND_KEYS,
  FUEL_FR_SHORTAGE_BAND,
  FUEL_FR_UNKNOWN_BAND,
]);

/**
 * The bands of one reading, in key order.
 * @param {string} view
 * @returns {ReadonlyArray<string>}
 */
export function fuelViewBandKeys(view) {
  const lead = view === FUEL_FR_DROP_VIEW ? FUEL_FR_BANDS.map((band) => band.key) : FUEL_FR_PRICE_BAND_KEYS;
  return Object.freeze([...lead, FUEL_FR_SHORTAGE_BAND, FUEL_FR_UNKNOWN_BAND]);
}

/**
 * A reading the key offers, or the default one when `value` is not one.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFuelView(value) {
  const view = String(value ?? '').trim().toLowerCase();
  return FUEL_FR_VIEWS.includes(view) ? view : FUEL_FR_DEFAULT_VIEW;
}

/**
 * The national price quintiles of one fuel, rounded to the cent, as the four
 * cut points between five bands.
 *
 * NATIONAL, not the view's, and measured before choosing: on 2026-11-23 the
 * national diesel quintiles put Paris's 37 stations in 1/1/9/11/15, Lyon's 17
 * in 5/0/3/7/2 and greater Bordeaux's 103 in 45/17/8/13/20 — the colour still
 * separates the stations of one town, and it means the same thing in every
 * town, which a scale re-cut on every camera move would not.
 *
 * Rounded to the cent so the key can print them; a cut that rounds onto the
 * one before it is dropped, so a fuel whose prices bunch (E10 at 1.999) gets
 * fewer, honest bands rather than an empty one.
 * @param {Iterable<number>} prices
 * @returns {Array<number>} 0 to 4 increasing cut points, €/L.
 */
export function fuelPriceCuts(prices) {
  const sorted = [...prices].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < FUEL_FR_PRICE_BAND_KEYS.length) return [];
  const cuts = [];
  for (let k = 1; k < FUEL_FR_PRICE_BAND_KEYS.length; k += 1) {
    const at = sorted[Math.min(sorted.length - 1, Math.floor((k * sorted.length) / FUEL_FR_PRICE_BAND_KEYS.length))];
    const cut = Math.round(at * 100) / 100;
    if (cut > sorted[0] && (cuts.length === 0 || cut > cuts[cuts.length - 1])) cuts.push(cut);
  }
  return cuts;
}

/**
 * The price band of one price against a fuel's cuts: `p1` is under the first
 * cut. With fewer than four cuts the top bands go unused, never the bottom.
 * @param {number|null} price
 * @param {Array<number>} cuts From {@link fuelPriceCuts}.
 * @returns {string}
 */
export function fuelPriceBand(price, cuts) {
  if (!Number.isFinite(price)) return FUEL_FR_UNKNOWN_BAND;
  let index = 0;
  while (index < cuts.length && price >= cuts[index]) index += 1;
  return FUEL_FR_PRICE_BAND_KEYS[index];
}

/**
 * The band of one station under one reading.
 * @param {object} props From {@link fuelStationProps}.
 * @param {string} view From {@link FUEL_FR_VIEWS}.
 * @param {Record<string, Array<number>>} cutsByFuel From {@link fuelPriceCuts}, per fuel.
 * @returns {string}
 */
export function fuelViewBand(props, view, cutsByFuel) {
  const reading = normalizeFuelView(view);
  const fuel = reading === FUEL_FR_DROP_VIEW ? 'gazole' : reading;
  const price = props?.[fuel];
  if (!Number.isFinite(price) && fuelInShortage(props?.shortage, fuel)) return FUEL_FR_SHORTAGE_BAND;
  if (reading === FUEL_FR_DROP_VIEW) {
    return FUEL_FR_BAND_KEYS.includes(props?.band) ? props.band : FUEL_FR_UNKNOWN_BAND;
  }
  return fuelPriceBand(price, cutsByFuel?.[fuel] || []);
}

/**
 * The national quintiles of every fuel, from the loaded stations.
 * @param {Iterable<object>} stations Station props.
 * @returns {Record<string, Array<number>>}
 */
export function fuelPriceCutsByFuel(stations) {
  const values = Object.fromEntries(FUEL_FR_FUEL_KEYS.map((key) => [key, []]));
  for (const props of stations) {
    for (const key of FUEL_FR_FUEL_KEYS) {
      if (Number.isFinite(props?.[key])) values[key].push(props[key]);
    }
  }
  return Object.fromEntries(FUEL_FR_FUEL_KEYS.map((key) => [key, fuelPriceCuts(values[key])]));
}
