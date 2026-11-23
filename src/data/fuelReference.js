/**
 * Pure rules behind the frozen fuel-price reference pack
 * (`src/data/local_data/fuel_fr/reference.json`).
 *
 * The pack answers one question per filling station: what did Gazole and E10
 * cost there BEFORE the late-October 2026 announcement, and which brand flies
 * over the forecourt? The layer compares that with today's live price.
 *
 * Everything here is pure — no file, no network, no clock — so that
 * `scripts/build-fuel-fr-reference.mjs` stays a thin I/O shell and every rule
 * below is pinned by `fuelReference.test.mjs`. The rules mirror a
 * pre-registered analysis; changing one changes published numbers, so each is
 * stated once, here, with its exact boundary.
 *
 * @module src/data/fuelReference
 */

/** Pack schema version. Bump on any breaking change to `reference.json`. */
export const FUEL_REFERENCE_VERSION = 1;

/** The two fuels the pack carries, with their id in the official feed. */
export const REFERENCE_FUELS = Object.freeze([
  Object.freeze({ name: 'Gazole', id: '1' }),
  Object.freeze({ name: 'E10', id: '5' }),
]);

/**
 * The "before" window: 24 → 30 October 2026, both days included. Fixed dates,
 * so a rebuild never moves the reference.
 */
export const REFERENCE_WINDOW = Object.freeze({
  start: '2026-10-24',
  end: '2026-10-30',
  minValidDays: 5,
  maxAgeDays: 30,
});

/** Accepted pump prices, in thousandths of a euro, bounds included. */
export const PRICE_BOUNDS_MILLIS = Object.freeze({ min: 1000, max: 4000 });

// i18n-ignore-start — brand names and groups are values written into the pack
// and matched by the runtime, not copy; the layer prints them as published.
/** Brand groups, in the order the pack lists them. */
export const BRAND_GROUPS = Object.freeze(['Pétrolier', 'Grande surface', 'Réseau indépendant']);

/**
 * Brand patterns, tested against normalized text (see `normalizeBrandText`).
 * Order matters: within one OSM field, the first rule whose pattern matches
 * wins.
 */
export const BRAND_RULES = Object.freeze([
  { brand: 'TotalEnergies', group: 'Pétrolier', patterns: [/totalenergies/, /\btotal\b/, /\belan\b/] },
  { brand: 'Esso', group: 'Pétrolier', patterns: [/\besso\b/] },
  { brand: 'BP', group: 'Pétrolier', patterns: [/\bbp\b/] },
  { brand: 'Shell', group: 'Pétrolier', patterns: [/\bshell\b/] },
  { brand: 'Eni', group: 'Pétrolier', patterns: [/\beni\b/, /\bagip\b/] },
  { brand: 'Avia', group: 'Réseau indépendant', patterns: [/\bavia\b/] },
  { brand: 'Dyneff', group: 'Réseau indépendant', patterns: [/dyneff/] },
  { brand: 'Vito', group: 'Réseau indépendant', patterns: [/\bvito\b/] },
  { brand: 'Carrefour', group: 'Grande surface', patterns: [/carrefour/] },
  { brand: 'E.Leclerc', group: 'Grande surface', patterns: [/leclerc/] },
  {
    brand: 'Intermarché',
    group: 'Grande surface',
    patterns: [/intermarche/, /ecomarche/, /\bitm\b/, /mousquetaires/],
  },
  { brand: 'Netto', group: 'Grande surface', patterns: [/\bnetto\b/] },
  {
    brand: 'Système U',
    group: 'Grande surface',
    patterns: [
      /\b(super|hyper|systeme|station|marche) u\b/,
      /\bu express\b/,
      /^u$/,
      /magasins u\b/,
      /cooperative u\b/,
    ],
  },
  { brand: 'Auchan', group: 'Grande surface', patterns: [/auchan/] },
  { brand: 'Casino', group: 'Grande surface', patterns: [/casino/, /\bgeant\b/] },
  { brand: 'Cora', group: 'Grande surface', patterns: [/\bcora\b/] },
  { brand: 'Leader Price', group: 'Grande surface', patterns: [/leader price/] },
  { brand: 'Match', group: 'Grande surface', patterns: [/\bmatch\b/] },
  { brand: 'Colruyt', group: 'Grande surface', patterns: [/colruyt/] },
  { brand: 'Spar', group: 'Grande surface', patterns: [/\bspar\b/] },
  {
    brand: 'Autres réseaux',
    group: 'Réseau indépendant',
    patterns: [
      /\bdats 24\b/, /\bas ?24\b/, /\bgulf\b/, /rompetrol/, /\bfulli\b/, /\bbi1\b/,
      /\bg20\b/, /coccinelle/, /\baire c\b/, /\bproxi\b/, /\butile\b/, /\bq8\b/,
      /\boil\b/, /\bv gas\b/, /comptoir/, /\bcampus\b/,
    ],
  },
]);
// i18n-ignore-end

/** Brand labels, in pack order; `brandIndex` in the pack points into this. */
export const BRANDS = Object.freeze(BRAND_RULES.map((rule) => rule.brand));

/** Group of each brand, parallel to `BRANDS`. */
export const BRAND_GROUP_OF = Object.freeze(BRAND_RULES.map((rule) => rule.group));

/** OSM fields tested for a brand, in priority order. */
export const BRAND_FIELDS = Object.freeze(['brand', 'name', 'operator']);

/** The OSM key that carries the official station id. */
export const OSM_STATION_REF_KEY = 'ref:FR:prix-carburants';

// ── Parsing the annual XML ────────────────────────────────────────────────

const ATTRIBUTE_PATTERN = /([\w:-]+)="([^"]*)"/g;
const PDV_OPEN_PATTERN = /<pdv\b([^>]*)>/;
const PRIX_PATTERN = /<prix\b([^>]*?)\/?>/g;
const RUPTURE_PATTERN = /<rupture\b([^>]*?)\/?>/g;
const PDV_CLOSE = '</pdv>';
const PDV_OPEN = '<pdv ';

/**
 * Attributes of one XML start tag, as raw strings.
 * Values are not entity-decoded: every attribute this module reads is numeric
 * or an ISO timestamp.
 * @param {string} text The text between the tag name and `>`.
 * @returns {Record<string, string>}
 */
export function parseAttributes(text) {
  const attributes = {};
  for (const match of String(text || '').matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

/** A coordinate stored as degrees × 100 000, or null when absent. */
function scaledCoordinate(raw) {
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value / 100000 : null;
}

/**
 * Parse one `<pdv>…</pdv>` block of the annual file.
 *
 * Empty `<prix/>` and `<rupture/>` placeholders (present in the real file)
 * are skipped.
 *
 * @param {string} block
 * @returns {?{id: string, cp: string, pop: string, lat: ?number, lon: ?number,
 *   prices: Array<{fuelId: string, fuel: string, maj: string, value: string}>,
 *   ruptures: Array<{fuelId: string, fuel: string, debut: string, fin: string, type: string}>}}
 */
export function parseStationBlock(block) {
  const open = PDV_OPEN_PATTERN.exec(block);
  if (!open) return null;
  const attributes = parseAttributes(open[1]);
  const id = (attributes.id || '').trim();
  if (!id) return null;
  const prices = [];
  for (const match of block.matchAll(PRIX_PATTERN)) {
    const price = parseAttributes(match[1]);
    if (!price.id || !price.maj || price.valeur == null) continue;
    prices.push({ fuelId: price.id, fuel: price.nom || '', maj: price.maj, value: price.valeur });
  }
  const ruptures = [];
  for (const match of block.matchAll(RUPTURE_PATTERN)) {
    const rupture = parseAttributes(match[1]);
    if (!rupture.id) continue;
    ruptures.push({
      fuelId: rupture.id,
      fuel: rupture.nom || '',
      debut: rupture.debut || '',
      fin: rupture.fin || '',
      type: rupture.type || '',
    });
  }
  return {
    id,
    cp: (attributes.cp || '').trim(),
    pop: attributes.pop || '',
    lat: scaledCoordinate(attributes.latitude),
    lon: scaledCoordinate(attributes.longitude),
    prices,
    ruptures,
  };
}

/**
 * Split a character stream into `<pdv>…</pdv>` blocks.
 *
 * Feed decoded text in chunks of any size; `onBlock` receives each complete
 * block once. Work is linear in the input: only the unfinished tail is kept
 * between chunks.
 *
 * @param {(block: string) => void} onBlock
 * @returns {{push: (chunk: string) => void, end: () => string}} `end` returns
 *   any trailing text that never closed (expected: `</pdv_liste>` only).
 */
export function createStationSplitter(onBlock) {
  let pending = '';
  return {
    push(chunk) {
      pending += chunk;
      let cursor = 0;
      for (;;) {
        const start = pending.indexOf(PDV_OPEN, cursor);
        if (start < 0) break;
        const close = pending.indexOf(PDV_CLOSE, start);
        if (close < 0) {
          cursor = start;
          break;
        }
        const end = close + PDV_CLOSE.length;
        onBlock(pending.slice(start, end));
        cursor = end;
      }
      // Keep only the unfinished tail. When no block opened in what is left,
      // keep a few characters in case `<pdv ` straddles the chunk boundary.
      const keepFrom = pending.indexOf(PDV_OPEN, cursor) >= 0
        ? pending.indexOf(PDV_OPEN, cursor)
        : Math.max(cursor, pending.length - PDV_OPEN.length);
      pending = pending.slice(keepFrom);
    },
    end() {
      const rest = pending;
      pending = '';
      return rest;
    },
  };
}

// ── Prices and dates ──────────────────────────────────────────────────────

const NAIVE_STAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})$/;
const ZONED_STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

let parisFormatter = null;

/**
 * A declaration timestamp as Europe/Paris wall-clock time,
 * `YYYY-MM-DDTHH:MM:SS`, or null when unreadable.
 *
 * The annual file writes `maj` with no offset, in Paris local time: on
 * 2026-03-29 (spring forward) it holds zero declarations between 02:00 and
 * 02:59, against 3 the day before, and stations with a nightly batch keep the
 * same clock time across winter and summer. A naive stamp is therefore taken
 * as-is. A stamp that does carry an offset is converted, so the rule survives
 * a format change.
 *
 * @param {string} maj
 * @returns {?string}
 */
export function parisLocalStamp(maj) {
  const text = String(maj || '').trim();
  const naive = NAIVE_STAMP.exec(text);
  if (naive) return `${naive[1]}T${naive[2]}`;
  if (!ZONED_STAMP.test(text)) return null;
  const instant = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(instant.getTime())) return null;
  parisFormatter ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(parisFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * A declared price in thousandths of a euro, or null when unparseable.
 * Values above 100 are taken as already in thousandths (`1789` → 1789);
 * others as euros (`1.789` → 1789).
 * @param {string|number} raw
 * @returns {?number}
 */
export function priceToMillis(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return value > 100 ? Math.round(value) : Math.round(value * 1000);
}

/** Whether a price in thousandths of a euro is inside 1.00–4.00 €/L. */
export function isPriceInBounds(millis, bounds = PRICE_BOUNDS_MILLIS) {
  return Number.isFinite(millis) && millis >= bounds.min && millis <= bounds.max;
}

function utcDay(isoDate) {
  if (!ISO_DATE.test(isoDate)) throw new Error(`not an ISO date: ${isoDate}`);
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
export function dayDiff(from, to) {
  return utcDay(to) - utcDay(from);
}

/** Every calendar day from `start` to `end`, both included. */
export function windowDays(start, end) {
  const days = [];
  const last = utcDay(end);
  for (let day = utcDay(start); day <= last; day += 1) {
    days.push(new Date(day * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Daily price of one fuel at one station.
 *
 * Rule: the price for day J is the last declared value whose Paris-time `maj`
 * is ≤ J 23:59:59, i.e. whose Paris date is ≤ J. It is missing when that
 * declaration is older than `maxAgeDays` — when J minus its Paris date, in
 * whole calendar days, exceeds `maxAgeDays` (30 days old is still valid, 31
 * is not).
 *
 * @param {Array<{stamp: string, millis: number}>} declarations In-bounds
 *   declarations sorted by `stamp` (Paris wall-clock), ties in file order.
 * @param {string[]} days Ascending `YYYY-MM-DD`.
 * @param {number} maxAgeDays
 * @returns {Array<?number>} One price in thousandths per day, or null.
 */
export function dailyPrices(declarations, days, maxAgeDays) {
  let next = 0;
  let current = null;
  return days.map((day) => {
    while (next < declarations.length && declarations[next].stamp.slice(0, 10) <= day) {
      current = declarations[next];
      next += 1;
    }
    if (!current) return null;
    return dayDiff(current.stamp.slice(0, 10), day) <= maxAgeDays ? current.millis : null;
  });
}

/**
 * Mean of the valid daily prices, in euros rounded to 3 decimals, or null
 * when fewer than `minValidDays` days are valid. Summed in integer
 * thousandths so the rounding is exact (half up).
 * @param {Array<?number>} daily Prices in thousandths, null for missing days.
 * @param {number} minValidDays
 * @returns {?number}
 */
export function windowMean(daily, minValidDays) {
  let sum = 0;
  let count = 0;
  for (const millis of daily) {
    if (millis == null) continue;
    sum += millis;
    count += 1;
  }
  if (count === 0 || count < minValidDays) return null;
  return Math.round(sum / count) / 1000;
}

/**
 * The "before" price of one fuel at one station.
 *
 * Declarations dated after the window are irrelevant and skipped.
 * Out-of-bounds declarations up to the window end are ignored — the previous
 * valid one carries on — and counted.
 *
 * @param {Array<{fuelId: string, maj: string, value: string}>} prices All the
 *   station's declarations, in file order.
 * @param {string} fuelId
 * @param {typeof REFERENCE_WINDOW} [window]
 * @returns {{price: ?number, validDays: number, outOfBounds: number, unparseable: number}}
 */
export function referencePrice(prices, fuelId, window = REFERENCE_WINDOW) {
  const declarations = [];
  let outOfBounds = 0;
  let unparseable = 0;
  for (const entry of prices) {
    if (entry.fuelId !== fuelId) continue;
    const stamp = parisLocalStamp(entry.maj);
    const millis = priceToMillis(entry.value);
    if (stamp == null || millis == null) {
      unparseable += 1;
      continue;
    }
    if (stamp.slice(0, 10) > window.end) continue;
    if (!isPriceInBounds(millis)) {
      outOfBounds += 1;
      continue;
    }
    declarations.push({ stamp, millis });
  }
  // Array.prototype.sort is stable: equal stamps keep file order, so the
  // later line of the file is the "last declared" one.
  declarations.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
  const daily = dailyPrices(declarations, windowDays(window.start, window.end), window.maxAgeDays);
  return {
    price: windowMean(daily, window.minValidDays),
    validDays: daily.filter((millis) => millis != null).length,
    outOfBounds,
    unparseable,
  };
}

/**
 * Metropolitan France and Corsica: postcodes 01xxx–95xxx. Overseas (97xxx,
 * 98xxx) and the feed's test station (99999) are out of scope.
 * @param {string} postcode
 */
export function isMetropolitanPostcode(postcode) {
  return /^(0[1-9]|[1-8]\d|9[0-5])\d{3}$/.test(String(postcode || '').trim());
}

// ── OpenStreetMap brands ──────────────────────────────────────────────────

/**
 * Lowercase, accents stripped to ASCII, every other non-alphanumeric
 * character turned into a space, spaces collapsed and trimmed.
 * @param {string} value
 * @returns {string}
 */
export function normalizeBrandText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Index into `BRANDS` of the first rule matching one normalized text, or -1.
 * @param {string} normalized
 */
export function matchBrandIndex(normalized) {
  if (!normalized) return -1;
  for (let index = 0; index < BRAND_RULES.length; index += 1) {
    if (BRAND_RULES[index].patterns.some((pattern) => pattern.test(normalized))) return index;
  }
  return -1;
}

/**
 * The brand of one OSM element.
 *
 * `brand` is tested first, then `name`, then `operator`; within a field the
 * first matching rule wins. A TotalEnergies station whose `name` or `brand`
 * contains "access" is flagged as a TotalEnergies Access.
 *
 * @param {Record<string, string>} tags
 * @returns {{brandIndex: ?number, field: ?string, access: boolean}}
 */
export function resolveBrand(tags) {
  const source = tags || {};
  for (const field of BRAND_FIELDS) {
    const index = matchBrandIndex(normalizeBrandText(source[field]));
    if (index < 0) continue;
    const access = BRANDS[index] === 'TotalEnergies'
      && ['name', 'brand'].some((key) => normalizeBrandText(source[key]).includes('access'));
    return { brandIndex: index, field, access };
  }
  return { brandIndex: null, field: null, access: false };
}

/**
 * Station ids carried by one `ref:FR:prix-carburants` value. A tag may hold
 * several, separated by `;`.
 * @param {string} value
 * @returns {string[]}
 */
export function parseStationRefs(value) {
  if (typeof value !== 'string') return [];
  return value.split(';').map((part) => part.trim()).filter(Boolean);
}

/** `n123` / `w123` / `r123`. */
function compactOsmId(element) {
  return `${String(element?.type || '?')[0]}${element?.id ?? ''}`;
}

/**
 * The brand of a station that one or more OSM elements point at.
 *
 * Elements are visited in code-point order of their compact id (`n…`, `r…`,
 * `w…`), so the choice never depends on Overpass's output order; the first
 * one that resolves to a brand wins.
 *
 * @param {Array<{type: string, id: number, tags: Record<string, string>}>} elements
 * @returns {{brandIndex: ?number, access: boolean, conflict: boolean, osmId: ?string}}
 *   `conflict` is true when two elements resolve to different brands.
 */
export function pickStationBrand(elements) {
  const ordered = [...(elements || [])].sort((a, b) => {
    const left = compactOsmId(a);
    const right = compactOsmId(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  let chosen = null;
  const seen = new Set();
  for (const element of ordered) {
    const resolved = resolveBrand(element.tags);
    if (resolved.brandIndex == null) continue;
    seen.add(resolved.brandIndex);
    if (!chosen) chosen = { ...resolved, osmId: compactOsmId(element) };
  }
  if (!chosen) return { brandIndex: null, access: false, conflict: false, osmId: null };
  return { brandIndex: chosen.brandIndex, access: chosen.access, conflict: seen.size > 1, osmId: chosen.osmId };
}
