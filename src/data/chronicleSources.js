/**
 * @module chronicleSources
 * @description The five feeds this server records because nobody else does —
 * what each one publishes, what is folded, what is only kept, and why.
 *
 * This is the declaration, not the plumbing. `chronicle.js` holds the fold and
 * the retention arithmetic; `vite.config.js` holds the files and the wiring
 * that calls the recorder from inside each proxy. This file is what the status
 * endpoint, `DATA_SOURCES.md` and the tests all read, so that "which sources
 * are recorded, under what licence, at what cadence" has exactly one answer.
 *
 * ── The entry test: does anyone publish its past? ──────────────────────────
 *
 * A feed belongs here when its own publisher overwrites it and no third party
 * sells the history. That is deliberately a high bar, and it excludes most of
 * what this fork draws:
 *
 *   • Filosofi, DVF, DPE, Sitadel, the cadastre — archives already, by year or
 *     by semester. Recording them would duplicate a public file.
 *   • éCO2mix, RTE generation — RTE publishes its own multi-year history.
 *   • Météo-France SYNOP — the running-year archive is a published product.
 *   • Vélib' and Vélo'v — Lyon already publishes the Vélo'v availability
 *     history back to 2023-03-27 (`veloPulse.js` is built from it), and the
 *     Paris feed is ODbL, so an accumulated Vélib' base could not be closed
 *     even if it were worth building. It is left out on both counts.
 *   • OpenSky and adsb.lol — non-commercial and ODbL respectively, and
 *     Flightradar24 has sold that history for fifteen years.
 *
 * ── The licence line, which decides what may stay closed ──────────────────
 *
 * Four of the five are Licence Ouverte 2.0, which permits a proprietary
 * derivative against attribution alone. The fifth, AISStream, redistributes an
 * unencrypted public radio broadcast under no formal terms.
 *
 * GTFS-RT is the one that has to be read per feed: transport.data.gouv.fr's
 * catalogue declares Licence Ouverte 2.0 on most French realtime feeds and
 * ODbL 1.0 on a sizeable minority, and ODbL's share-alike reaches any derived
 * DATABASE that is publicly exposed — not just the map drawn from it. So the
 * recorder stores the declared licence WITH each transit series, and a profile
 * built on an ODbL feed is share-alike no matter what is built on top of it.
 * `licenceOf()` below is what a future export path must consult; it is not
 * decoration.
 */

/** Directory-and-URL token pattern every source id obeys. */
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * The recorded feeds.
 *
 * ENGLISH, AND NOT BILINGUAL. Every string below is read by ONE consumer:
 * `/api/chronicle-fr/status`, which `vite.config.js` serves from Node. The
 * server has no locale by design — no cookie, no Accept-Language — and no
 * browser surface prints any of it; it is operator documentation of what this
 * fork records, alongside `DATA_SOURCES.md`. So it follows the repository's
 * own language rule rather than the interface's, and the `label` lines are
 * marked for the ratchet with that reason. The `attribution` lines are marked
 * too, and for the opposite reason: they are quoted from the publisher.
 *
 * `profile: false` is not a lesser status — it says the hour-of-week fold is
 * the WRONG shape for this phenomenon, and that the value of recording it is
 * the chronology alone. Only Vigicrues declares it, and the reason is in its
 * `why`.
 */
export const CHRONICLE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'transit-fr',
    // i18n-ignore-next-line — server-side operator text, never drawn (see the note above).
    label: 'Public transit — GTFS-RT (PAN)',
    upstream: 'transport.data.gouv.fr — 151 GTFS-Realtime feeds, VehiclePositions + TripUpdates',
    licence: 'per-feed: Licence Ouverte 2.0 / ODbL 1.0 / Licence Ouverte 1.0',
    // i18n-ignore-next-line — the attribution each feed requires, as published.
    attribution: 'transport.data.gouv.fr + l’autorité organisatrice de chaque réseau',
    // Five minutes per series, not per tick: the server polls GTFS-RT per
    // VIEWPORT, so which feeds are refreshed depends on where an operator is
    // looking. Gating each feed on its own clock means a network recorded once
    // every five minutes whichever viewport happened to trigger the fetch.
    minIntervalMs: 5 * 60_000,
    retentionDays: 30,
    profile: true,
    axes: 'feed:<id>/vehicles (the fleet the network publishes), feed:<id>/onTimePct and feed:<id>/spoken; no national series — the answer is a viewport',
    why: 'A VehiclePositions feed is overwritten about every 30 s and no network publishes its past punctuality. '
      + 'The schedule × real-time join already exists in this server; only the accumulation is missing.',
    // Recorded ONLY where an operator has looked. The bias is real and the
    // status endpoint reports the per-series week count so a thin profile
    // reads as thin rather than as a quiet network.
    opportunistic: true,
  }),
  Object.freeze({
    id: 'irve-fr',
    // i18n-ignore-next-line — server-side operator text, never drawn (see the note above).
    label: 'EV charging — dynamic status (QualiCharge)',
    upstream: 'proxy.transport.data.gouv.fr/resource/qualicharge-irve-dynamique',
    licence: 'Licence Ouverte 2.0',
    // i18n-ignore-next-line — attribution, as the publisher writes it.
    attribution: 'QualiCharge — Direction générale de l’énergie et du climat, via transport.data.gouv.fr',
    minIntervalMs: 15 * 60_000,
    retentionDays: 30,
    profile: true,
    axes: 'fr/* nationally, then op:<code>/occupePct per roaming operator',
    why: 'The static consolidated file says where the charge points are; this one says which are free, '
      + 'and it is replaced at every publication. Nobody keeps the past occupancy.',
    opportunistic: false,
  }),
  Object.freeze({
    id: 'road-status-fr',
    // i18n-ignore-next-line — server-side operator text, never drawn (see the note above).
    label: 'National road network — DATEX II (Bison Futé)',
    upstream: 'tipi.bison-fute.gouv.fr — Traficolor per conurbation + QTV national flow/speed',
    licence: 'Licence Ouverte 2.0',
    // i18n-ignore-next-line — attribution, as the publisher writes it.
    attribution: 'Bison Futé — DGITM / Ministère chargé des transports',
    // The flow snapshot has a strict six-minute publication window; asking
    // faster records the same document twice.
    minIntervalMs: 6 * 60_000,
    retentionDays: 30,
    profile: true,
    axes: 'fr/* nationally, then axis:<A7>/congestedPct and axis:<A7>/speedKph per named road',
    why: 'Each conurbation’s directory holds the current publication only; the previous one is deleted. '
      + 'The QTV flow figure is gone after six minutes.',
    opportunistic: true,
  }),
  Object.freeze({
    id: 'ais-fr',
    // i18n-ignore-next-line — server-side operator text, never drawn (see the note above).
    label: 'Maritime traffic — the France box (AISStream)',
    upstream: 'stream.aisstream.io — 41.0..51.6 N, -8.0..10.0 E',
    licence: 'no formal terms; AIS is a public radio broadcast',
    attribution: 'AISStream.io (as a courtesy)',
    minIntervalMs: 5 * 60_000,
    retentionDays: 30,
    profile: true,
    axes: 'fr/* nationally, then cell:<lat>,<lon>/vessels per 1° square of the France box',
    why: 'A socket cannot be replayed. MarineTraffic sells this history for the world; nobody publishes '
      + 'it for the French coast.',
    opportunistic: false,
  }),
  Object.freeze({
    id: 'vigicrues',
    // i18n-ignore-next-line — server-side operator text, never drawn (see the note above).
    label: 'Flood warnings — monitored river reaches',
    upstream: 'vigicrues.gouv.fr/services/InfoVigiCru.geojson',
    licence: 'Licence Ouverte 2.0',
    // i18n-ignore-next-line — attribution, as the publisher writes it.
    attribution: 'Vigicrues — SCHAPI, Ministère de la Transition écologique',
    minIntervalMs: 30 * 60_000,
    retentionDays: 30,
    // NO typical week, and this is the whole point of letting a source say so.
    // A flood answers to rainfall, not to Tuesday. Folding a vigilance level
    // into hour-of-week slots would manufacture a weekly seasonality that does
    // not exist and then score real episodes against it. What is worth having
    // here is the CHRONOLOGY — which reach went amber, when, and for how long —
    // so the raw ticks are kept and nothing is folded.
    profile: false,
    retention: 'chronology only',
    axes: 'fr/level2, fr/level3, fr/level4 raw; no weekly profile',
    why: 'The bulletin is republished over the previous one twice a day, and no public archive says which '
      + 'reach was amber on 12 March.',
    opportunistic: true,
  }),
]);

/** @type {Map<string, object>} */
const BY_ID = new Map(CHRONICLE_SOURCES.map((source) => [source.id, source]));

/** One declared source, or null. Never throws on an unknown id. */
export function chronicleSourceById(id) {
  return BY_ID.get(String(id || '')) || null;
}

/** Every declared source id, in declaration order. */
export function chronicleSourceIds() {
  return CHRONICLE_SOURCES.map((source) => source.id);
}

/**
 * Whether the registry itself is well formed.
 *
 * Exported because the test asserts it rather than re-listing the invariants:
 * an id that is not directory-safe becomes a path, and a source with no
 * licence becomes an export nobody can clear.
 */
export function chronicleRegistryFaults(sources = CHRONICLE_SOURCES) {
  const faults = [];
  const seen = new Set();
  for (const source of sources) {
    if (!SOURCE_ID.test(source?.id || '')) faults.push(`id not directory-safe: ${source?.id}`);
    if (seen.has(source?.id)) faults.push(`duplicate id: ${source.id}`);
    seen.add(source?.id);
    if (!source?.licence) faults.push(`${source?.id}: no licence declared`);
    if (!source?.attribution) faults.push(`${source?.id}: no attribution declared`);
    if (!source?.why) faults.push(`${source?.id}: no reason it has no public archive`);
    if (!Number.isFinite(source?.minIntervalMs) || source.minIntervalMs < 60_000) {
      faults.push(`${source?.id}: minIntervalMs must be at least a minute`);
    }
    if (!Number.isFinite(source?.retentionDays) || source.retentionDays < 1) {
      faults.push(`${source?.id}: retentionDays must be a positive number of days`);
    }
    if (typeof source?.profile !== 'boolean') faults.push(`${source?.id}: profile must be declared true or false`);
  }
  return faults;
}
