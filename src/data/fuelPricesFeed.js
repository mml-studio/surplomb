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
 * The export the route reads: every station, eleven columns. Measured
 * 2026-11-23: 9 826 rows, 715 KB uncompressed, 7.6 s cold, no key, CORS `*`.
 */
export const FUEL_FR_EXPORT_URL =
  `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${FUEL_FR_DATASET}/exports/json`
  + '?select=id,latitude,longitude,cp,ville,adresse,pop,gazole_prix,gazole_maj,e10_prix,e10_maj'; // i18n-ignore-line — column names

/** A declared price older than this is not a current price (pre-registered rule). */
export const FUEL_FR_MAX_AGE_DAYS = 30;

/** Plausible bounds, €/L, after the thousandths fix (pre-registered rule). */
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
});

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
 * @returns {number|null}
 */
export function normalizeFuelPrice(value) {
  let price = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(price)) return null;
  if (price > 100) price /= 1000;
  if (price < FUEL_FR_MIN_EUR_L || price > FUEL_FR_MAX_EUR_L) return null;
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
  };
  const rows = [];
  let latestAt = null;
  const seen = new Set();

  const current = (price, at) => {
    const value = normalizeFuelPrice(price);
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

    const gazole = current(record.gazole_prix, record.gazole_maj);
    const e10 = current(record.e10_prix, record.e10_maj);
    for (const at of [gazole.atMs, e10.atMs]) {
      if (Number.isFinite(at) && at <= now + 3_600_000 && (latestAt === null || at > latestAt)) latestAt = at;
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
    dropCents: drop,
    e10DropCents: fuelDropCents(row[FUEL_FR_ROW.e10], row[FUEL_FR_ROW.e10Before]),
    band: fuelBand(drop),
  };
}
