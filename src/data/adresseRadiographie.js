/**
 * @module data/adresseRadiographie
 *
 * **La radiographie d'adresse** — one point in, ten themes out.
 *
 * This is the scene Cityscan was built around and the one thing this fork had
 * all the material for and none of the shape. The Cityscan teardown (#99) measured it:
 * eight of their ten themes were already served by routes in production, the
 * remaining two landed as `/api/arcep-fr` and `/api/emploi-fr`, and what was
 * missing was never data — it was *une adresse, un barème et une fiche*.
 *
 * This module is the fiche. The barème is deliberately NOT here; see below.
 *
 * ── WHERE IT GRADES, AND WHERE IT REFUSES TO ────────────────────────────────
 * Cityscan grades every theme out of 100 and stamps a letter A→E on it. A
 * letter is a claim about a NATIONAL DISTRIBUTION, and since 2026-09-08 this
 * repository has one: `baremeNational.js` carries eleven measured scales, from
 * a national draw of 1 200 residents.
 *
 * **It covers two of this sheet's numbers and refuses the rest, on purpose.**
 * A scale is keyed on the GEOMETRY it was measured on, and it will not rank a
 * value measured on another shape — the trap that module exists to make
 * impossible. Of everything below:
 *
 *   - the **ten-minute walking area** is measured on exactly the ring the
 *     scale was drawn from (`RING_FOOT_600`), so it carries a national
 *     percentile and a letter;
 *   - the **median price per m²** is measured on the same 300 m disc
 *     (`DISC_300`), so it carries a percentile — and never a letter, because
 *     a high price is good news for a seller and bad news for a buyer;
 *   - every neighbourhood figure here is averaged over a RECTANGLE of INSEE
 *     carreaux, not over a walking ring, so the scale refuses it and the sheet
 *     prints the refusal. The globe's `Fiche implantation` measures the same
 *     indicators on the ring and does carry their ranks.
 *
 * Nothing else has a scale at all. A reader is told "3 crèches à 400 m",
 * "fibre chez 94,5 % des locaux", "indice ATMO 2 sur 6, tiré par l'ozone" —
 * values, without a letter, because no letter has been earned for them.
 *
 * ── The ten themes, and where each one's number comes from ──────────────────
 * Every route below already existed or was added for this fiche, every one is
 * cached server-side, and every one may fail on its own without taking the
 * page with it — a theme with no answer says so and the other nine stand.
 *
 * TWO THEMES READ TWO REGISTERS EACH, and that is the fix for the two halves
 * this sheet was missing. Nuisances printed the air and never the aircraft;
 * Numérique printed the cable and never the mast. Both routes were already in
 * production for the globe's own layers — the 2026-09 audit counted four such
 * routes with a layer and no line here — and both join a theme that already
 * existed rather than founding one of their own. One subject, one heading.
 *
 *   Immobilier   `/api/dvf` · `/api/loyers-fr` · `/api/dpe`
 *   Transport    `/api/isochrone` (marche 5/10/15 min, voiture 15 min)
 *   Éducation    `/api/schools-fr/sites` — with the DEPP's IPS on each school
 *   Commodités   `/api/amenities-fr/sites` — BPE + FINESS
 *   Nuisances    `/api/atmo-fr` · `/api/bruit-fr`
 *   Risques      `/api/georisques`
 *   Numérique    `/api/arcep-fr` · `/api/anfr-fr/supports`
 *   Emploi       `/api/emploi-fr`
 *   Urbanisme    `/api/gpu` · `/api/ads-fr`
 *   Voisinage    `/api/filosofi/carreaux`
 *
 * ── The one place this fiche goes further than the product it copies ────────
 * Cityscan's Éducation theme counts schools. This one names them and prints
 * each one's **indice de position sociale** beside the national figure, because
 * `ipsFeed.js` already joined the DEPP's file to the ministry's register on the
 * UAI. Counting schools describes a catchment; the IPS describes what is
 * actually on offer inside it, and the two are not the same address.
 *
 * ── Every theme carries its own silence ─────────────────────────────────────
 * A theme is `ok`, `partial` or `absent`, and the reasons are printed rather
 * than smoothed over: an air index borrowed from a neighbouring zone, a rent
 * computed for a mesh of communes rather than for this one, an unemployment
 * rate withheld because the commune has fewer than a hundred active residents.
 * The teardown's whole argument was that Cityscan's ten scores hide exactly
 * these; a copy that hid them too would not be worth building.
 *
 * Dependency-free and side-effect-free apart from the injected `fetch`: URL
 * construction and projection only. Runs in the browser and under `node --test`.
 */

import {
  AMENITY_FAMILY_LABELS,
  AMENITY_FAMILY_PLURALS,
} from './amenitiesFamilies.i18n.js';
import { ANFR_GENERATIONS } from './anfrFeed.js';
import {
  BAREME_GEOMETRIES,
  BAREME_REASON_CODES,
  BAREME_SAMPLE,
  scoreIndicator,
} from './baremeNational.js';
import messages, {
  ARCEP_TECHNOLOGIES,
  ATMO_BANDS,
  ATMO_POLLUTANTS,
  LOYERS_BASIS,
  LOYERS_SEGMENTS,
  RADON_LABELS,
  RISK_GRADES,
  RISK_LABELS,
  RISK_VERDICTS,
  SCHOOL_LEVELS,
  SCHOOL_SECTORS,
} from './adresseRadiographie.i18n.js';
import { DEFAULT_LOCALE, getLocale } from '../i18n/locale.js';
import { labelFor } from '../i18n/messages.js';
import {
  formatEuros,
  formatEurosPerM2,
  formatNumber,
  formatPercent,
  formatQuantity,
  ordinal,
} from '../i18n/format.js';

/**
 * A label the SERVER published, in the page's language.
 *
 * Seven of the seventeen routes compose their own French labels — the ATMO
 * band, the ARCEP technology, the rent segment — and the server that composes
 * them has no locale by design. So French prints what the payload carries,
 * byte for byte, and any other language looks the STABLE KEY up in a table.
 * An unknown key falls back to the published words: a category the producer
 * added last week is better read in French than not at all.
 *
 * @param {ReturnType<typeof labelFor>} table A catalog keyed by the raw value.
 * @param {string|number} key The stable key the payload carries.
 * @param {?string} [publishedLabel] The words the payload printed, if any.
 * @returns {string}
 */
function published(table, key, publishedLabel = null) {
  if (getLocale() === DEFAULT_LOCALE && publishedLabel) return publishedLabel;
  const translated = labelFor(table, key);
  if (translated && translated !== String(key)) return translated;
  return publishedLabel ?? translated;
}

/** How far around the point each bounded question looks. */
export const RADIOGRAPHIE_RADIUS = Object.freeze({
  /** DVF's own scan radius, kept identical so the two views cannot disagree. */
  sales: 300,
  /** Diagnostics: dense enough at 200 m to describe a street. */
  dpe: 200,
  /** The statutory état des risques is a commune-and-address answer anyway. */
  risks: 500,
  /** Permits: the block, not the quarter. */
  permits: 500,
  /** Half a kilometre of box for the point registers — schools, équipements. */
  boxDeg: 0.006,
});

/** Walking budgets the catchment is written in, plus the driving one. */
export const RADIOGRAPHIE_WALK_STEPS = Object.freeze([300, 600, 900]);
export const RADIOGRAPHIE_DRIVE_SECONDS = 900;

/** How many named items a theme may list before it says "and N more". */
export const RADIOGRAPHIE_LIST_CAP = 6;

/**
 * The ten themes, in the order Cityscan itself lists them.
 *
 * `question` is the sentence the theme answers, printed on the sheet: a header
 * that says only "Numérique" leaves the reader to guess whether the number
 * below is coverage, speed or price.
 */
export const RADIOGRAPHIE_THEMES = Object.freeze([
  // i18n-ignore-start — theme IDS, not words: they key PROJECTORS, THEME_PARTS
  // and the catalog, and `composeRadiographie` publishes them in `absent`.
  'immobilier', 'transport', 'education', 'commodites', 'nuisances',
  'risques', 'numerique', 'emploi', 'urbanisme', 'voisinage',
  // i18n-ignore-end
  // GETTERS, not values: the words are read when the sheet is composed, so one
  // module answers in whichever language the page is in (CONVENTIONS § 2).
].map((id) => Object.freeze({
  id,
  get label() { return messages().themes[id].label; },
  get question() { return messages().themes[id].question; },
})));

/**
 * Minutes, as a reader says them.
 *
 * `implantationFiche.js` exports the same three lines, and this page does NOT
 * import them from there: that module imports Cesium, and pulling a 3D engine
 * into a printable text sheet to format "10 min" is not a trade worth making.
 * Duplication of an expression this small, with the reason written down, beats
 * a dependency that size.
 *
 * @param {number} seconds @returns {string}
 */
export function minutesLabel(seconds) {
  return Number.isFinite(seconds) ? `${Math.round(seconds / 60)} min` : '—';
}

/** A whole number, grouped as the page's language groups them, or the em dash. */
export function count(value) {
  return Number.isFinite(value) ? formatNumber(Math.round(value)) : '—';
}

/** Round to `digits` decimals the way this sheet has always rounded. */
function rounded(value, digits) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

/** A decimal at the given precision: `5,6` in French, `5.6` in English. */
export function decimal(value, digits = 1) {
  return Number.isFinite(value) ? formatNumber(rounded(value, digits)) : '—';
}

/** A percentage, one decimal at most, with its sign kept. */
function percent(value, digits = 1) {
  return Number.isFinite(value) ? formatPercent(rounded(value, digits)) : '—';
}

/** An amount of euros, rounded as the row rounds it. */
function euros(value, digits = 0) {
  return Number.isFinite(value) ? formatEuros(rounded(value, digits)) : '—';
}

/** A price per square metre, rounded as the row rounds it. */
function eurosPerM2(value, digits = 0) {
  return Number.isFinite(value) ? formatEurosPerM2(rounded(value, digits)) : '—';
}

/** Great-circle metres between two points. */
export function metresBetween(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(b?.lat)) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

/**
 * A label written for mid-sentence use, promoted to a row heading.
 *
 * The pollutant names come from `atmoFeed.js`, where they are written to be
 * read inside a sentence — "tiré par ozone". Printed as a row label beside
 * "Indice ATMO du jour" they were the only lower-case headings on the sheet.
 * @param {string} label @returns {string}
 */
function asHeading(label) {
  const text = String(label ?? '');
  return text ? text[0].toLocaleUpperCase('fr-FR') + text.slice(1) : text;
}

/** A distance as a reader says it. */
export function distanceLabel(metres) {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return formatQuantity(Math.round(metres / 10) * 10, 'm');
  return formatQuantity(rounded(metres / 1000, 1), 'km');
}

/**
 * The bounding box a point-register question is asked over.
 * @param {{lat: number, lon: number}} point
 * @param {number} [padDeg]
 */
export function scanBox({ lat, lon }, padDeg = RADIOGRAPHIE_RADIUS.boxDeg) {
  return {
    south: lat - padDeg,
    west: lon - padDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
    north: lat + padDeg,
    east: lon + padDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
  };
}

/**
 * Every request the fiche makes, as `{key, url}`.
 *
 * Named keys rather than positional results, so a route added or removed does
 * not silently shift every theme's input by one.
 *
 * @param {{lat: number, lon: number}} point
 * @returns {Array<{key: string, url: string}>}
 */
export function radiographieRequests({ lat, lon }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const box = scanBox({ lat, lon });
  const bbox = `south=${box.south.toFixed(5)}&west=${box.west.toFixed(5)}`
    + `&north=${box.north.toFixed(5)}&east=${box.east.toFixed(5)}`;
  const at = `lat=${lat}&lon=${lon}`;
  // i18n-ignore-start — request KEYS, matched against `THEME_PARTS` and printed
  // by `fiche.js` as the identifier of a source that said nothing.
  return [
    { key: 'address', url: `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1` },
    { key: 'dvf', url: `/api/dvf?${at}&radius=${RADIOGRAPHIE_RADIUS.sales}` },
    { key: 'loyers', url: `/api/loyers-fr?${at}` },
    { key: 'dpe', url: `/api/dpe?${at}&radius=${RADIOGRAPHIE_RADIUS.dpe}` },
    { key: 'walk', url: `/api/isochrone?${at}&profile=foot&seconds=${RADIOGRAPHIE_WALK_STEPS.join(',')}` },
    { key: 'drive', url: `/api/isochrone?${at}&profile=car&seconds=${RADIOGRAPHIE_DRIVE_SECONDS}` },
    { key: 'schools', url: `/api/schools-fr/sites?${bbox}` },
    { key: 'amenities', url: `/api/amenities-fr/sites?${bbox}` },
    { key: 'atmo', url: `/api/atmo-fr?${at}` },
    { key: 'risques', url: `/api/georisques?${at}&radius=${RADIOGRAPHIE_RADIUS.risks}` },
    { key: 'arcep', url: `/api/arcep-fr?${at}` },
    // The mobile half of Numérique and the aircraft half of Nuisances. Both
    // routes were already in production for their own layers, and both were
    // named in the audit as "a route with a layer that the fiche ignores".
    // `bruit-fr` answers a POINT — the same probe the globe's layer makes —
    // and `anfr-fr/supports` answers the same box the schools and the
    // équipements are asked for, well inside its own 0.35° ceiling.
    { key: 'bruit', url: `/api/bruit-fr?${at}` },
    { key: 'anfr', url: `/api/anfr-fr/supports?${bbox}` },
    { key: 'emploi', url: `/api/emploi-fr?${at}` },
    { key: 'gpu', url: `/api/gpu?${at}` },
    { key: 'permis', url: `/api/ads-fr?${at}&radius=${RADIOGRAPHIE_RADIUS.permits}&months=36` },
    { key: 'carroyage', url: `/api/filosofi/carreaux?${bbox}&resolution=200` },
  ];
  // i18n-ignore-end
}

/**
 * Fetch every part, tolerating any of them failing.
 *
 * Resolves to a map of key → payload, with `null` for anything that did not
 * answer. Never throws: a page that renders nine themes because the tenth
 * upstream is down is the whole design.
 *
 * @param {{lat: number, lon: number}} point
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [seams]
 * @returns {Promise<Object<string, ?object>>}
 */
export async function fetchRadiographieParts(point, { fetchImpl = fetch, signal = null } = {}) {
  const requests = radiographieRequests(point);
  const settled = await Promise.all(requests.map(async ({ key, url }) => {
    try {
      const response = await fetchImpl(url, signal ? { signal } : undefined);
      if (!response?.ok) return [key, null];
      const payload = await response.json();
      if (!payload || payload.error) return [key, null];
      return [key, payload];
    } catch {
      return [key, null];
    }
  }));
  return Object.fromEntries(settled);
}

/**
 * The national rank of one value, as the row a reader can read.
 *
 * `scoreIndicator` never throws and never returns null: an indicator it could
 * not place comes back with a NAMED reason, and printing that reason is half
 * the product — "échelle mesurée sur une autre géométrie" and "aucune échelle"
 * are different facts and a reader deserves the second sentence rather than a
 * dash.
 *
 * @param {string} id Indicator id in `baremeNational.js`.
 * @param {?number} value
 * @param {string} geometry The shape THIS sheet measured on. Passing it is what
 *   makes a wrong ranking impossible; omitting it earns a refusal, by design.
 * @param {string} label Row heading.
 * @returns {?object} A printable row, or null when there is nothing to say.
 */
function rankRow(id, value, geometry, label) {
  const m = messages();
  const score = scoreIndicator(id, value, { geometry });
  if (score.reason && score.percentile === null) {
    // Only worth a row when the refusal teaches something. "No scale at all"
    // for an indicator nobody expected to be graded is noise. The CODE is what
    // is tested — it never moves with the language — and the sentence beside
    // it is the barème's own, in the page's language.
    if (score.reasonCode !== BAREME_REASON_CODES.GEOMETRY) return null;
    return line(label, m.rank.unranked, score.reason);
  }
  if (score.percentile === null) return null;
  const bracket = m.rank.bracket(ordinal(score.percentileLow), ordinal(score.percentileHigh));
  // The letter only when both ends of the bracket land in one band; otherwise
  // the honest answer is two letters, which is what `scoreIndicator` says.
  const letter = score.letter
    ? m.rank.letter(score.letter)
    : (score.letterHigh && score.letterLow
      ? m.rank.letterEither(score.letterHigh, score.letterLow)
      : null);
  const head = [bracket, letter].filter(Boolean).join(' — ');
  // The direction note is a SENTENCE and the bracket is a figure; chaining both
  // on em dashes read as one run-on. It is printed only where there is no
  // letter, which is exactly where a reader needs to be told why.
  // The barème publishes the note in the reader's language, so nothing is
  // repeated here: see `baremeNational.i18n.js`.
  const note = score.direction ? head : `${head}. ${score.directionNote}`;
  return line(label, m.rank.percentile(ordinal(score.percentile)), note);
}

/** Shorthand for one printed row. */
function line(label, value, note = null) {
  return note ? { label, value, note } : { label, value };
}

/** Immobilier — sales, rents, diagnostics. */
function projectImmobilier({ dvf, loyers, dpe }) {
  const m = messages();
  const lines = [];
  const notes = [];
  const summary = dvf?.summary ?? null;
  if (summary) {
    lines.push(line(
      m.immobilier.medianPrice(RADIOGRAPHIE_RADIUS.sales),
      summary.medianPrixM2 === null ? '—' : eurosPerM2(summary.medianPrixM2),
      m.immobilier.comparables(count(summary.comparableCount), count(summary.count)),
    ));
    if (Number.isFinite(summary.p25PrixM2) && Number.isFinite(summary.p75PrixM2)) {
      lines.push(line(m.immobilier.middleHalf,
        m.immobilier.priceRange(count(summary.p25PrixM2), count(summary.p75PrixM2)),
        m.immobilier.quartiles));
    }
    // The 300 m radius above is `RADIOGRAPHIE_RADIUS.sales`, kept identical to
    // DVF's own — and identical to the disc the national scale was measured on,
    // which is what lets this one line carry a rank at all.
    const priceRank = rankRow('prixM2', summary.medianPrixM2, BAREME_GEOMETRIES.DISC_300,
      m.rank.priceLabel);
    if (priceRank) lines.push(priceRank);
    const reference = summary.reference ?? null;
    if (reference?.medianPrixM2) {
      lines.push(line(m.immobilier.reference(reference.name || reference.code || '').trim(),
        eurosPerM2(reference.medianPrixM2),
        m.immobilier.referenceSales(count(reference.comparableCount))));
    }
  } else {
    notes.push(m.immobilier.dvfSilent);
  }

  if (loyers?.segments?.length) {
    for (const segment of loyers.segments) {
      lines.push(line(
        // The published label verbatim: lower-casing it turned « T1-T2 » into
        // « t1-t2 », which is not a thing the ministry publishes. In English
        // the segment is named by its key, which is the same four segments.
        m.immobilier.rent(published(LOYERS_SEGMENTS, segment.key, segment.label)),
        eurosPerM2(segment.eurM2, 2),
        m.immobilier.rentNote(
          decimal(segment.low, 2),
          decimal(segment.high, 2),
          count(segment.monthlyEur),
          segment.surfaceM2,
          published(LOYERS_BASIS, segment.basis, segment.basisLabel),
        ),
      ));
    }
    notes.push(m.immobilier.rentModel);
    if (loyers.borrowedSegments > 0) {
      notes.push(m.immobilier.rentBorrowed(loyers.borrowedSegments, loyers.segments.length));
    }
  } else {
    notes.push(m.immobilier.rentSilent);
  }

  if (dpe && Number.isFinite(dpe.total)) {
    const distribution = dpe.distribution || {};
    const served = Object.values(distribution).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const best = Object.entries(distribution)
      .filter(([, value]) => Number(value) > 0)
      .map(([label, value]) => `${label} ${value}`)
      .join(', ');
    lines.push(line(m.immobilier.dpe(RADIOGRAPHIE_RADIUS.dpe), count(dpe.total),
      served ? m.immobilier.dpeSpread(best, count(served)) : null));
    if (Number.isFinite(dpe.medianCoutAnnuel)) {
      lines.push(line(m.immobilier.dpeCost, euros(dpe.medianCoutAnnuel),
        m.immobilier.dpeCostNote));
    }
    // Never averaged into a street grade: a DPE describes one dwelling.
    notes.push(m.immobilier.dpeNotAveraged);
  }
  return { lines, notes };
}

/** Transport — what the door actually reaches. */
function projectTransport({ walk, drive }) {
  const m = messages();
  const lines = [];
  const notes = [];
  for (const ring of walk?.rings || []) {
    lines.push(line(m.transport.onFoot(minutesLabel(ring.seconds)),
      formatQuantity(rounded(ring.areaKm2, 2), 'km²'),
      m.transport.reachable));
    // ONLY the ten-minute ring, and only because the national scale was drawn
    // on exactly that shape. Ranking the five- or fifteen-minute ring against
    // it would give a plausible letter and a false one — the whole reason
    // `baremeNational.js` keys its scales on a geometry.
    if (ring.seconds === 600) {
      const rank = rankRow('acces', ring.areaKm2, BAREME_GEOMETRIES.RING_FOOT_600,
        m.rank.walkLabel);
      if (rank) lines.push(rank);
    }
  }
  const driveRing = drive?.rings?.[0] ?? null;
  if (driveRing) {
    lines.push(line(m.transport.byCar(minutesLabel(driveRing.seconds)),
      formatQuantity(rounded(driveRing.areaKm2, 1), 'km²'),
      m.transport.noTraffic));
  }
  if (!lines.length) notes.push(m.transport.silent);
  else {
    notes.push(m.transport.noTransit);
    notes.push(m.transport.onlyTenMinutes);
  }
  return { lines, notes };
}

/** Éducation — the schools, and the index Cityscan does not print. */
function projectEducation({ schools, point }) {
  const m = messages();
  const lines = [];
  const notes = [];
  const sites = Array.isArray(schools?.sites) ? schools.sites : [];
  if (!schools) {
    notes.push(m.education.silent);
    return { lines, notes };
  }
  const ranked = sites
    .map((site) => ({ site, distance: metresBetween(point, { lat: site.lat, lon: site.lon }) }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance);
  const byLevel = new Map();
  for (const { site } of ranked) {
    const level = site.level || 'autre'; // i18n-ignore-line — the register's own key
    byLevel.set(level, (byLevel.get(level) || 0) + 1);
  }
  lines.push(line(m.education.count, count(ranked.length),
    [...byLevel.entries()]
      .map(([level, n]) => m.education.byLevel(published(SCHOOL_LEVELS, level, level), n))
      .join(', ') || null));

  let withIndex = 0;
  for (const { site, distance } of ranked.slice(0, RADIOGRAPHIE_LIST_CAP)) {
    const ips = site.ips ?? null;
    const value = ips && ips.status === 'ok' && Number.isFinite(ips.value) ? ips.value : null;
    if (value !== null) withIndex += 1;
    // Never read as average. `ipsFeed.js` measures that roughly one school in
    // three that COULD carry an index does not, and a blank is not a middling
    // score. The sector is prefixed only when the register published one:
    // joining an empty string with an em dash produced rows opening on a dash.
    const index = value === null
      ? m.education.noIps
      : (Number.isFinite(ips.national)
        ? m.education.ipsAgainst(decimal(value, 1), decimal(ips.national, 1))
        : m.education.ips(decimal(value, 1)));
    lines.push(line(site.name || site.uai || m.education.unnamed,
      distanceLabel(distance),
      site.sector
        ? m.education.sectorAndIps(published(SCHOOL_SECTORS, site.sector, site.sector), index)
        : index));
  }
  if (ranked.length > RADIOGRAPHIE_LIST_CAP) {
    lines.push(line('…', m.education.more(count(ranked.length - RADIOGRAPHIE_LIST_CAP))));
  }
  if (ranked.length) {
    notes.push(m.education.ipsCoverage(withIndex, Math.min(ranked.length, RADIOGRAPHIE_LIST_CAP)));
  }
  return { lines, notes };
}

/** Commodités — the everyday registers, by family and by distance. */
function projectCommodites({ amenities, point }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!amenities) {
    notes.push(m.commodites.silent);
    return { lines, notes };
  }
  const sites = Array.isArray(amenities.sites) ? amenities.sites : [];
  const nearest = new Map();
  const tally = new Map();
  for (const site of sites) {
    const { family } = site;
    const lat = Number(site.lat);
    const lon = Number(site.lon);
    if (!family || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // `count` is how many establishments the fold put on this one coordinate:
    // three GPs in one surgery are one dot and three médecins, and a card that
    // counted dots would under-report the dense half of every city.
    tally.set(family, (tally.get(family) || 0) + (Number(site.count) || 1));
    const distance = metresBetween(point, { lat, lon });
    const held = nearest.get(family);
    if (!held || distance < held.distance) nearest.set(family, { distance, site });
  }
  lines.push(line(m.commodites.count, count(amenities.rows ?? sites.length),
    amenities.capped
      ? m.commodites.capped(count(amenities.capped))
      : m.commodites.dots(count(amenities.dots ?? sites.length))));
  for (const [family, entry] of [...nearest.entries()].sort((a, b) => a[1].distance - b[1].distance)) {
    const nearestName = entry.site.names?.[0] || entry.site.kinds?.[0] || m.commodites.noName;
    const total = tally.get(family);
    // "1 commerces alimentaires" is the reason this is not a template string:
    // the plural head-word is the only one the vocabulary carries, and a rural
    // scan finds exactly one of most families.
    const many = total === 1
      ? m.commodites.onlyOne
      : m.commodites.inBox(count(total),
        labelFor(AMENITY_FAMILY_PLURALS, family));
    lines.push(line(labelFor(AMENITY_FAMILY_LABELS, family),
      distanceLabel(entry.distance),
      m.commodites.nearest(many, nearestName)));
  }
  if (!nearest.size) notes.push(m.commodites.empty);
  notes.push(m.commodites.bpeGaps);
  return { lines, notes };
}

/** Nuisances — today's air. */
function projectNuisances({ atmo }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!atmo || atmo.uncovered) {
    notes.push(m.nuisances.uncovered);
    return { lines, notes };
  }
  const band = (value) => (value?.code
    ? published(ATMO_BANDS, value.code, value.label)
    : (value?.label ?? '—'));
  // The driving sub-indices arrive as LABELS; the key is what a catalog can
  // translate, so it is read back off the pollutant list the same payload
  // carries. A driver nobody listed keeps the agency's own word.
  const pollutantKeys = new Map((atmo.pollutants || []).map((entry) => [entry.label, entry.key]));
  const drivers = (atmo.driving || [])
    .map((label) => published(ATMO_POLLUTANTS, pollutantKeys.get(label) ?? label, label));
  lines.push(line(m.nuisances.index,
    m.nuisances.indexValue(atmo.quality, band(atmo.band)),
    drivers.length ? m.nuisances.drivenBy(drivers.join(', ')) : null));
  for (const pollutant of atmo.pollutants || []) {
    if (!Number.isFinite(pollutant.quality)) continue;
    lines.push(line(asHeading(published(ATMO_POLLUTANTS, pollutant.key, pollutant.label)),
      m.nuisances.pollutantValue(pollutant.quality, band(pollutant.band))));
  }
  for (const day of atmo.forecast || []) {
    lines.push(line(m.nuisances.forecast(day.date),
      m.nuisances.pollutantValue(day.quality, band(day.band))));
  }
  if (atmo.borrowed && atmo.zone) {
    notes.push(m.nuisances.borrowed(
      atmo.zone.name || atmo.zone.code,
      atmo.zone.scale === 'epci' ? m.nuisances.borrowedEpci : m.nuisances.borrowedCommune,
      Number.isFinite(atmo.zone.distanceM)
        ? m.nuisances.borrowedDistance(distanceLabel(atmo.zone.distanceM))
        : '',
    ));
  }
  if (atmo.agency) notes.push(m.nuisances.agency(atmo.agency));
  notes.push(m.nuisances.maximum);
  return { lines, notes };
}

/**
 * Le bruit des aéronefs, lu AU SOL.
 *
 * The globe files `bruit-fr` under hazards and argues, in its own taxonomy
 * entry, that "the polygon is about the aircraft, not about the ground under
 * it". That is true of the MAP and false of a door: a PEB band is a planning
 * constraint written against the address, and this sheet is where a reader
 * asks what may be built and who may live there. It is the reading the layer's
 * own header owed and never had a surface for.
 *
 * @param {{bruit: ?object}} parts
 * @returns {{lines: object[], notes: string[]}}
 */
function projectBruit({ bruit }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!bruit) {
    notes.push(m.bruit.silent);
    return { lines, notes };
  }
  const bands = (bruit.peb || [])
    // Only a band the probe actually landed IN is a fact about this door. The
    // overview bands the layer draws around an aerodrome carry `atPoint:false`
    // precisely because nothing was tested against a point.
    .filter((band) => band && band.atPoint !== false);
  for (const band of bands) {
    const airport = [band.airport, band.oaci ? `(${band.oaci})` : ''].filter(Boolean).join(' ');
    const index = String(band.index || '').toLowerCase() === 'psophique' ? m.bruit.psophic : 'Lden';
    const range = Number.isFinite(band.low) && Number.isFinite(band.high)
      ? `${index} ${band.low}–${band.high}`
      : index;
    lines.push(line(m.bruit.zone(band.zone), range,
      [airport, band.arreteDate ? m.bruit.order(band.arreteDate) : ''].filter(Boolean).join(' · ')));
  }
  if (!bands.length) {
    const nearest = bruit.nearest;
    if (nearest && Number.isFinite(nearest.distanceKm)) {
      lines.push(line(m.bruit.plan, m.bruit.none,
        m.bruit.nearest(nearest.name || nearest.oaci, decimal(nearest.distanceKm, 1))));
    } else {
      lines.push(line(m.bruit.plan, m.bruit.none));
    }
  }
  // The three refusals this theme owes, in the order they mislead.
  notes.push(m.bruit.planningConstraint);
  if (bands.some((band) => String(band.index || '').toLowerCase() === 'psophique')) {
    notes.push(m.bruit.psophicNote);
  }
  notes.push(m.bruit.aircraftOnly);
  return { lines, notes };
}

/**
 * One Géorisques verdict, in the page's language.
 *
 * The register answers a short closed vocabulary — `Risque Existant`,
 * `Risque non Connu`, `Risque Concerne` — optionally graded after a dash
 * (`Risque Existant - important`). The grade is split off rather than listed
 * as a dozen combinations: the register grades a dozen hazards on four words,
 * and a table of every pair is a table nobody keeps current. French prints
 * what the register published, unchanged.
 *
 * @param {?string} verdict @returns {?string}
 */
function hazardVerdict(verdict) {
  if (!verdict) return verdict ?? null;
  if (getLocale() === DEFAULT_LOCALE) return verdict;
  const match = /^(.*?)\s-\s*(.+)$/.exec(String(verdict).trim());
  if (!match) return published(RISK_VERDICTS, verdict, verdict);
  const [, head, grade] = match;
  const translated = published(RISK_VERDICTS, head.trim(), head.trim());
  return messages().risques.verdictGraded(translated, published(RISK_GRADES, grade, grade));
}

/** Risques — the statutory register, commune verdict and address verdict apart. */
function projectRisques({ risques }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!risques) {
    notes.push(m.risques.silent);
    return { lines, notes };
  }
  // THE ROUTE ANSWERS EVEN WHEN THE REGISTER DID NOT. Géorisques fans out to
  // three upstream endpoints and reports which of them replied; measured live
  // on 2026-09-08, the risk REPORT failed while the ICPE list and the radon
  // lookup succeeded — the documented ECONNRESET on roughly one call in four.
  // The payload then carries `naturalRisks: []`, and a card that printed
  // "0 risques inscrits" would be publishing the most consequential false
  // negative this whole fiche can produce. Silence is named instead.
  const available = risques.available || {};
  const reported = available.report !== false;
  const families = [
    ...(risques.naturalRisks || []).map((risk) => ({ ...risk, kind: 'naturel' })),
    ...(risques.technologicalRisks || []).map((risk) => ({ ...risk, kind: 'technologique' })),
  ];
  const present = families.filter((risk) => risk.present);
  if (!reported || !families.length) {
    lines.push(line(m.risques.onRecord, m.risques.notRead, m.risques.notReadNote));
    notes.push(m.risques.reportMissing);
  } else {
    lines.push(line(m.risques.onRecord, count(present.length),
      m.risques.families(count(families.length), RADIOGRAPHIE_RADIUS.risks)));
  }
  for (const risk of present) {
    // The disagreement is read from the two verdicts themselves, not from the
    // `variesByAddress` flag, which is the source's statement about variation
    // WITHIN the radius. A commune classed "Risque Existant - important" for
    // clay shrinkage above a point classed "Risque non Connu" is a
    // disagreement whatever that flag says.
    lines.push(line(published(RISK_LABELS, risk.id, risk.label),
      hazardVerdict(risk.addressVerdict || risk.communeVerdict) || '—',
      risk.communeVerdict && risk.addressVerdict && risk.communeVerdict !== risk.addressVerdict
        ? m.risques.disagree(hazardVerdict(risk.communeVerdict))
        : null));
  }
  if (risques.radon?.label) {
    // Named apart from the `radon` risk family above, which answers a verdict:
    // two rows both titled "Radon" saying different things read as a bug.
    lines.push(line(m.risques.radon,
      published(RADON_LABELS, risques.radon.class, risques.radon.label),
      Number.isFinite(risques.radon.class) ? m.risques.radonClass(risques.radon.class) : null));
  }
  if (Number.isFinite(risques.icpeTotal)) {
    lines.push(line(m.risques.icpe, count(risques.icpeTotal),
      risques.icpeTruncated
        ? m.risques.icpeTruncated
        : m.risques.within(RADIOGRAPHIE_RADIUS.risks)));
  }
  if (reported && families.length) {
    notes.push(m.risques.twoVerdicts);
  }
  return { lines, notes };
}

/** Numérique — the fixed line. */
function projectNumerique({ arcep }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!arcep) {
    notes.push(m.numerique.silent);
    return { lines, notes };
  }
  lines.push(line(m.numerique.premises, count(arcep.premises),
    arcep.edition ? m.numerique.edition(arcep.edition) : null));
  for (const technology of arcep.technologies || []) {
    lines.push(line(asHeading(published(ARCEP_TECHNOLOGIES, technology.key, technology.label)),
      percent(technology.percent),
      m.numerique.premisesCount(count(technology.premises))));
  }
  const gigabit = (arcep.speeds || []).find((speed) => speed.key === 'gigabit');
  if (gigabit) {
    lines.push(line(m.numerique.gigabit, percent(gigabit.percent),
      m.numerique.premisesCount(count(gigabit.premises))));
  }
  if (arcep.wiredIneligible && arcep.wiredIneligible.premises > 0) {
    lines.push(line(m.numerique.noWired, count(arcep.wiredIneligible.premises),
      percent(arcep.wiredIneligible.percent)));
  }
  if (arcep.copper) {
    lines.push(line(m.numerique.copper, percent(arcep.copper.percent),
      arcep.copper.premises === 0
        ? m.numerique.copperClosed
        : m.numerique.premisesCount(count(arcep.copper.premises))));
  }
  notes.push(m.numerique.wiredOnly);
  if (arcep.commune?.folded) {
    notes.push(m.numerique.folded);
  }
  return { lines, notes };
}

/**
 * Le mobile, sous la même thématique que le filaire.
 *
 * The ARCEP note above ends "débits FILAIRES uniquement", and that sentence was
 * the whole hole: the sheet answered what a cable can carry here and said
 * nothing about what radiates over it, while `/api/anfr-fr` had been in
 * production for the globe's own layer the entire time.
 *
 * IT COUNTS WHAT RADIATES, NEVER WHAT IS PLANNED. `live` is the mask of
 * generations in service or technically operational; `plan` is paperwork.
 * `anfrFeed.js` calls that distinction "the whole ethical content" of its band
 * function, and a sheet that folded the two would report 5G at an address
 * where none exists.
 *
 * @param {{anfr: ?object}} parts
 * @returns {{lines: object[], notes: string[]}}
 */
function projectAntennes({ anfr }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!anfr) {
    notes.push(m.antennes.silent);
    return { lines, notes };
  }
  const supports = Array.isArray(anfr.supports) ? anfr.supports : [];
  // AN EMPTY REGISTER IS NOT AN EMPTY ADDRESS. Measured 2026-09-09, the ANFR
  // observatoire CSV published on 2026-09-03 is 222 bytes — its header row and
  // nothing else, against 181 988 412 bytes and 826 418 rows on 2026-08-27.
  // Printing "0 supports" from that would report an upstream outage as a fact
  // about somebody's street, which is the one thing this sheet exists not to
  // do. It says which of the two it is looking at instead.
  if (!Number.isFinite(anfr.national?.count) || anfr.national.count === 0) {
    notes.push(m.antennes.emptyRegister(anfr.edition ? ` (${anfr.edition})` : ''));
    return { lines, notes };
  }
  const box = Math.round(RADIOGRAPHIE_RADIUS.boxDeg * 111_320);
  lines.push(line(m.antennes.around, count(anfr.inBox ?? supports.length),
    m.antennes.boxSide(box, anfr.edition ? m.antennes.editionSuffix(anfr.edition) : '')));
  // One row per generation, from the newest down: 5G first is what a reader
  // came for, and an empty 2G row below it says the site is modern rather than
  // leaving them to infer it from an absence.
  for (let i = ANFR_GENERATIONS.length - 1; i >= 0; i -= 1) {
    const bit = 1 << i;
    const live = supports.filter((support) => (Number(support?.live) || 0) & bit).length;
    const planned = supports.filter((support) => (
      ((Number(support?.plan) || 0) & bit) && !((Number(support?.live) || 0) & bit)
    )).length;
    if (!live && !planned) continue;
    lines.push(line(m.antennes.generation(ANFR_GENERATIONS[i]), count(live),
      planned ? m.antennes.planned(count(planned)) : null));
  }
  if (supports.length && !supports.some((support) => Number(support?.live))) {
    notes.push(m.antennes.noneLive);
  }
  if (anfr.truncated) {
    notes.push(m.antennes.truncated(count(supports.length), count(anfr.inBox)));
  }
  notes.push(m.antennes.mastNotAntenna);
  notes.push(m.antennes.indoor);
  return { lines, notes };
}

/**
 * Two projections under one heading.
 *
 * A theme is one question, and two of them here are answered by two registers
 * that have nothing else in common — the air and the aircraft, the cable and
 * the mast. Merging at the PROJECTION rather than adding two more themes is
 * the same decision the layer panel just made: one subject, one line.
 *
 * @param {...(parts: object) => {lines: object[], notes: string[]}} projectors
 * @returns {(parts: object) => {lines: object[], notes: string[]}}
 */
function mergeProjections(...projectors) {
  return (parts) => {
    const lines = [];
    const notes = [];
    for (const projector of projectors) {
      const projected = projector(parts) || {};
      lines.push(...(projected.lines || []));
      notes.push(...(projected.notes || []));
    }
    return { lines, notes };
  };
}

/**
 * Why the census withheld the rates, in the page's language.
 *
 * `emploiFeed.js` composes the reason ON THE SERVER, which has no locale: it
 * is either "the arithmetic identities do not check out" or "fewer than N
 * economically active residents", with N in the sentence. The second is read
 * back off the sentence rather than recomputed — the floor belongs to the
 * feed, and a second copy of it here would be the number that goes stale.
 *
 * @param {?string} reason @returns {?string}
 */
function withheldReason(reason) {
  if (!reason || getLocale() === DEFAULT_LOCALE) return reason ?? null;
  const m = messages();
  if (reason === m.emploi.withheldInconsistent) return m.emploi.withheldInconsistent;
  const floor = /(\d+)/.exec(String(reason));
  return floor ? m.emploi.withheldTooFew(floor[1]) : reason;
}

/** Emploi — the census, and its direction of travel. */
function projectEmploi({ emploi }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (!emploi) {
    notes.push(m.emploi.silent);
    return { lines, notes };
  }
  if (emploi.outOfScope) {
    notes.push(m.emploi.outOfScope);
    return { lines, notes };
  }
  const current = emploi.current;
  if (!current) {
    notes.push(m.emploi.noObservation);
    return { lines, notes };
  }
  lines.push(line(m.emploi.population(current.year), count(current.population)));
  if (current.unemploymentRate === null) {
    lines.push(line(m.emploi.unemployment, m.emploi.notPublished, withheldReason(current.ratesWithheld)));
  } else {
    lines.push(line(m.emploi.unemployment, percent(current.unemploymentRate),
      m.emploi.unemployed(count(current.unemployed), count(current.active))));
    lines.push(line(m.emploi.participation, percent(current.activityRate)));
    lines.push(line(m.emploi.employment, percent(current.employmentRate)));
  }
  if (Number.isFinite(emploi.trend)) {
    const sense = emploi.trend > 0
      ? m.emploi.trendUp
      : (emploi.trend < 0 ? m.emploi.trendDown : m.emploi.trendFlat);
    lines.push(line(m.emploi.sincePrevious,
      m.emploi.points(`${emploi.trend > 0 ? '+' : ''}${decimal(emploi.trend, 1)}`),
      sense));
  }
  for (const year of emploi.series || []) {
    if (year.year === current.year) continue;
    lines.push(line(m.emploi.census(year.year),
      year.unemploymentRate === null ? m.emploi.notPublished : percent(year.unemploymentRate)));
  }
  notes.push(m.emploi.censusSense);
  return { lines, notes };
}

/** Urbanisme — the zoning and the live permits. */
function projectUrbanisme({ gpu, permis }) {
  const m = messages();
  const lines = [];
  const notes = [];
  if (gpu) {
    const zones = Array.isArray(gpu.zones) ? gpu.zones : [];
    const atPoint = zones.filter((zone) => zone.atPoint);
    const shown = atPoint.length ? atPoint : zones.slice(0, 1);
    for (const zone of shown) {
      // The zone's code and its label are the PLU document's own words —
      // written by the municipality that drew it, not by any nomenclature a
      // catalog could carry. They are printed as published, in both languages.
      lines.push(line(m.urbanisme.zoning, zone.code || '—', zone.label || zone.typezone || null));
    }
    if (!shown.length) lines.push(line(m.urbanisme.zoning, m.urbanisme.noZoning));
    if (Number.isFinite(gpu.zonesAtPoint) && gpu.zonesAtPoint > 1) {
      notes.push(m.urbanisme.overlap(gpu.zonesAtPoint));
    }
    const servitudes = Array.isArray(gpu.servitudes) ? gpu.servitudes : [];
    if (servitudes.length) {
      lines.push(line(m.urbanisme.easements, count(servitudes.length)));
    }
  } else {
    notes.push(m.urbanisme.silent);
  }
  if (permis?.summary) {
    const summary = permis.summary;
    lines.push(line(m.urbanisme.permits(RADIOGRAPHIE_RADIUS.permits),
      count(summary.count),
      m.urbanisme.permitsWindow));
    const kinds = Object.entries(summary.byKind || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([kind, value]) => `${kind} ${value}`)
      .join(', ');
    if (kinds) lines.push(line(m.urbanisme.byKind, kinds, m.urbanisme.kinds));
    if (Number.isFinite(summary.housing) && summary.housing > 0) {
      lines.push(line(m.urbanisme.housing, count(summary.housing), m.urbanisme.housingNote));
    }
    if (Number.isFinite(summary.underInstruction) && summary.underInstruction > 0) {
      lines.push(line(m.urbanisme.underInstruction, count(summary.underInstruction)));
    }
    if (Number.isFinite(permis.unplacedInCommune) && permis.unplacedInCommune > 0) {
      notes.push(m.urbanisme.unplaced(count(permis.unplacedInCommune)));
    }
  }
  return { lines, notes };
}

/** Voisinage — the 200 m grid. */
function projectVoisinage({ carroyage }) {
  const m = messages();
  const lines = [];
  const notes = [];
  const cells = Array.isArray(carroyage?.cells) ? carroyage.cells : [];
  if (!carroyage) {
    notes.push(m.voisinage.silent);
    return { lines, notes };
  }
  if (!cells.length) {
    notes.push(m.voisinage.empty);
    return { lines, notes };
  }
  // THE ANSWER IS WIDER THAN THE QUESTION, and the label has to say so. The
  // carroyage route snaps a requested box out to a 0,01° grid before querying,
  // so a 1,8 km² scan box came back with 105 carreaux — 4,2 km² of ground.
  // Calling that "the scan box" would attribute a quarter's population to a
  // block. The covered area is computed from the cells themselves, which is
  // the only figure that is true whatever the route snaps to.
  const resolution = Number(carroyage.resolution) || 200;
  const areaKm2 = (cells.length * resolution * resolution) / 1e6;
  const extent = m.voisinage.extent(count(cells.length), resolution, decimal(areaKm2, 1));
  // The route publishes its own fold; recomputing it here would be a second
  // opinion nobody asked for, and the two would drift.
  const summary = carroyage.summary ?? null;
  const sum = (key) => cells.reduce((total, cell) => total + (Number(cell[key]) || 0), 0);
  const weighted = (key) => {
    let numerator = 0;
    let denominator = 0;
    for (const cell of cells) {
      const value = Number(cell[key]);
      const weight = Number(cell.ind);
      if (!Number.isFinite(value) || !Number.isFinite(weight)) continue;
      numerator += value * weight;
      denominator += weight;
    }
    return denominator > 0 ? numerator / denominator : null;
  };
  lines.push(line(m.voisinage.people, count(summary?.people ?? sum('ind')), extent));
  lines.push(line(m.voisinage.households, count(summary?.households ?? sum('men'))));
  const niveau = summary?.niveau ?? weighted('niveau');
  if (Number.isFinite(niveau)) {
    lines.push(line(m.voisinage.standardOfLiving, m.voisinage.perYear(count(niveau)),
      m.voisinage.weighted));
  }
  const pauvrete = summary?.pauvrete ?? weighted('pauvrete');
  if (Number.isFinite(pauvrete)) lines.push(line(m.voisinage.poverty, percent(pauvrete)));
  const solo = weighted('solo');
  if (solo !== null) lines.push(line(m.voisinage.alone, percent(solo)));
  const aines = weighted('aines');
  if (aines !== null) lines.push(line(m.voisinage.elders, percent(aines)));
  const jeunes = weighted('jeunes');
  if (jeunes !== null) lines.push(line(m.voisinage.children, percent(jeunes)));
  const imputed = Number.isFinite(summary?.imputedCells)
    ? summary.imputedCells
    : cells.filter((cell) => Number(cell.est) === 1).length;
  if (imputed > 0) {
    notes.push(m.voisinage.imputed(count(imputed), count(cells.length)));
  }
  if (carroyage.truncated) {
    notes.push(m.voisinage.truncated);
  }
  notes.push(m.voisinage.notACatchment);
  // The refusal, said where it applies. The barème has scales for every one of
  // these indicators — but measured on a ten-minute walking ring, and a
  // rectangle of carreaux is not that shape. Printing a rank here would be the
  // exact failure `baremeNational.js` was built to make impossible.
  notes.push(m.voisinage.noRank);
  return { lines, notes };
}

/** theme id → projector. */
const PROJECTORS = Object.freeze({
  immobilier: projectImmobilier,
  transport: projectTransport,
  education: projectEducation,
  commodites: projectCommodites,
  nuisances: mergeProjections(projectNuisances, projectBruit),
  risques: projectRisques,
  numerique: mergeProjections(projectNumerique, projectAntennes),
  emploi: projectEmploi,
  urbanisme: projectUrbanisme,
  voisinage: projectVoisinage,
});

/** Which fetched parts each theme depends on, for the status verdict. */
// i18n-ignore-start — the request keys of `radiographieRequests`, not words.
const THEME_PARTS = Object.freeze({
  immobilier: ['dvf', 'loyers', 'dpe'],
  transport: ['walk', 'drive'],
  education: ['schools'],
  commodites: ['amenities'],
  nuisances: ['atmo', 'bruit'],
  risques: ['risques'],
  numerique: ['arcep', 'anfr'],
  emploi: ['emploi'],
  urbanisme: ['gpu', 'permis'],
  voisinage: ['carroyage'],
});
// i18n-ignore-end

/**
 * The address line, from the BAN's own reverse answer.
 * @param {?object} feature
 */
export function projectRadiographieAddress(feature) {
  const properties = feature?.features?.[0]?.properties ?? feature?.properties ?? null;
  if (!properties) return null;
  return {
    label: properties.label || null,
    street: properties.name || null,
    postcode: properties.postcode || null,
    commune: properties.city || null,
    code: properties.citycode || null,
    // Published by the BAN and printed, because a point 180 m from the nearest
    // known address is not the same claim as one at the door.
    distanceM: Number.isFinite(properties.distance) ? Math.round(properties.distance) : null,
  };
}

/**
 * Compose the sheet.
 *
 * @param {object} options
 * @param {{lat: number, lon: number}} options.point
 * @param {Object<string, ?object>} options.parts Output of `fetchRadiographieParts`.
 * @param {number} [options.at] Wall clock; injected in tests.
 * @returns {object}
 */
export function composeRadiographie({ point, parts = {}, at = Date.now() }) {
  const themes = RADIOGRAPHIE_THEMES.map((theme) => {
    const projected = PROJECTORS[theme.id]({ ...parts, point });
    const needed = THEME_PARTS[theme.id];
    const answered = needed.filter((key) => parts[key]).length;
    // `absent` means NOTHING answered. A theme with lines but a silent second
    // source is `partial`, and the note says which — the two must not look the
    // same, because one is a fact about the address and the other about a
    // server.
    const status = answered === 0 ? 'absent' : (answered === needed.length ? 'ok' : 'partial');
    return {
      ...theme,
      status,
      silent: needed.filter((key) => !parts[key]),
      lines: projected.lines,
      notes: projected.notes,
    };
  });
  return {
    point,
    address: projectRadiographieAddress(parts.address),
    themes,
    generatedAt: at,
    // Counted rather than asserted, so the sheet's own header can say how much
    // of itself answered.
    answered: themes.filter((theme) => theme.status === 'ok').length,
    partial: themes.filter((theme) => theme.status === 'partial').length,
    absent: themes.filter((theme) => theme.status === 'absent').map((theme) => theme.id),
    // What the sheet may and may not grade, carried on the payload so no
    // renderer can forget it and no reader has to guess.
    grading: {
      source: 'baremeNational.js',
      measuredAt: BAREME_SAMPLE.measuredAt,
      rings: BAREME_SAMPLE.rings,
      marginPt: BAREME_SAMPLE.marginPt,
      ranked: ['acces', 'prixM2'],
    },
    gradingNote: messages().gradingNote(
      count(BAREME_SAMPLE.rings),
      decimal(BAREME_SAMPLE.marginPt, 1),
    ),
  };
}
