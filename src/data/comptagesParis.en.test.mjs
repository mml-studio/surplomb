// Paris traffic counts, the rhythm wheel and the TomTom flow layer in
// English — the three blocks that share the « Trafic routier » row.
//
// What the English must not lose is this layer's separation of absences: an
// arc that never measures, an arc that measures and published nothing for
// THIS hour, and an arc that publishes occupancy but no count are three
// different facts with three different sentences. And the week is always
// named: this is an archived typical week, never "now".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComptagesLoadingLabel,
  buildComptagesSelectionLabel,
  comptagesSilenceLine,
  comptagesWeekLabel,
} from './comptagesParis.js';
import {
  COMPTAGES_MOMENTS,
  COMPTAGES_OCCUPANCY_BANDS,
  COMPTAGES_RHYTHM_LABELS,
  COMPTAGES_STATE_LABELS,
  comptagesFlowBandLabel,
  comptagesFlowScaleDomain,
  comptagesHourGapLabel,
  comptagesRhythmBlurbs,
  comptagesSlotLabel,
} from './comptagesRhythm.js';
import trafficMessages from './traffic.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Street names, junction names and the publisher stay as published.
const DATA = ['Boulevard Saint-Germain', 'Rue du Bac', 'Rue de Solférino', 'Ville de Paris'];
const WEEK = { start: '2026-08-31', end: '2026-09-06' };

test('the archived week is named, in each language’s own date order', () => {
  assert.equal(withLocale('en', () => comptagesWeekLabel(WEEK)), 'August 31 to September 6, 2026');
  assert.equal(withLocale('en', () => comptagesWeekLabel({ start: '2026-08-24', end: '2026-08-30' })),
    'August 24 to 30, 2026');
  assert.equal(withLocale('fr', () => comptagesWeekLabel(WEEK)), 'du 31 août au 6 septembre 2026');
});

test('the four silences are four different claims', () => {
  const en = withLocale('en', () => ({
    invalid: comptagesSilenceLine({ s: 'silent', b: 'i' }),
    closed: comptagesSilenceLine({ s: 'silent', b: 'b' }),
    open: comptagesSilenceLine({ s: 'silent', b: 'o' }),
    none: comptagesSilenceLine({ s: 'silent' }),
  }));
  assertNoFrench(en, { allow: DATA });
  assert.equal(en.invalid, 'No measurement over 168 h — sensor declared invalid by the City');
  assert.equal(en.closed, 'No measurement over 168 h — link declared closed to traffic');
  assert.equal(en.open, 'No measurement over 168 h — yet the link is declared open');
  assert.equal(en.none, 'No measurement over 168 h — no state published for this link');
  assert.equal(new Set(Object.values(en)).size, 4, 'four silences, four sentences');
  assert.match(withLocale('fr', () => comptagesSilenceLine({ s: 'silent', b: 'b' })),
    /arc déclaré barré à la circulation$/);
});

test('a counted arc’s card, in English', () => {
  const arc = {
    a: '1234',
    n: 'Boulevard Saint-Germain',
    f: 'Rue du Bac',
    t: 'Rue de Solférino',
    s: 'counted',
    mq: 1240,
    hq: 141,
    mk: 22,
    b: 'o',
    g: 1,
    wq: new Array(24).fill(800),
    eq: new Array(24).fill(400),
  };
  const lines = withLocale('en', () => buildComptagesSelectionLabel(
    { arc }, { hours: 168, week: WEEK }, { kind: 'mean' },
  ).split('\n'));
  assertNoFrench(lines, { allow: DATA });
  assert.equal(lines[0], 'Boulevard Saint-Germain · link 1234');
  assert.equal(lines[1], 'from Rue du Bac to Rue de Solférino');
  assert.equal(lines[2], '1,240 veh/h on average, in the typical weekday hour');
  assert.equal(lines[3], '141 hours counted out of 168');
  assert.ok(lines.some((line) => /^Occupancy 22% — /.test(line)));
  assert.ok(lines.some((line) => /^Measured, D-2 · week August 31 to September 6, 2026 · average weekday hour$/.test(line)));
  assert.equal(lines.at(-1), 'Ville de Paris — ODbL');
  // French, same arc.
  const fr = withLocale('fr', () => buildComptagesSelectionLabel(
    { arc }, { hours: 168, week: WEEK }, { kind: 'mean' },
  ).split('\n'));
  assert.match(fr[2], /^1\s240 véh\/h en moyenne, l’heure ouvrée type$/);
  assert.ok(fr.some((line) => line.startsWith('Mesuré, J-2 · semaine du 31 août')));
});

test('the row line names the week, the slot and what is not drawn', () => {
  const payload = {
    week: WEEK,
    states: { counted: 1730, silent: 891, occupancy: 12 },
    unplacedMeasuring: 64,
  };
  const line = withLocale('en', () => buildComptagesLoadingLabel({
    payload, loading: false, inView: true, slot: { kind: 'mean' },
  }));
  assertNoFrench(line, { allow: DATA });
  assert.equal(line, '1,730 links counted · week August 31 to September 6, 2026 · '
    + 'average weekday hour · 891 with no measurement at all · 64 measured links with no published geometry');
  assert.equal(withLocale('en', () => buildComptagesLoadingLabel({ loading: true })),
    'reading the measured week...');
  assert.equal(withLocale('en', () => buildComptagesLoadingLabel({ loading: false, inView: false })),
    'Paris inner city only — outside this view');
});

test('the counts key: states, bands, hour chips and the scale domain', () => {
  const en = withLocale('en', () => ({
    states: { ...COMPTAGES_STATE_LABELS },
    gap: comptagesHourGapLabel(),
    bands: [0, 2, 4].map((bin) => comptagesFlowBandLabel(bin)),
    domain: comptagesFlowScaleDomain(),
    moments: COMPTAGES_MOMENTS.map((moment) => moment.label),
    occupancy: COMPTAGES_OCCUPANCY_BANDS.map((band) => band.label),
    slot: comptagesSlotLabel({ kind: 'hour', day: 'weekend', hour: 18 }),
  }));
  assertNoFrench(en);
  assert.deepEqual(en.states, {
    counted: 'Vehicles counted', occupancy: 'Occupancy only', silent: 'No measurement',
  });
  assert.equal(en.gap, 'No measurement at this hour');
  assert.deepEqual(en.bands, ['< 100 veh/h', '250–500 veh/h', '≥ 1,000 veh/h']);
  assert.equal(en.domain, 'from under 100 to over 1,000');
  assert.deepEqual(en.moments, ['Weekday average', 'At this hour', 'Wk 04:00', 'Wk 08:00', 'Wk 18:00', 'WE 04:00', 'WE 18:00']);
  // The occupancy bands are the city's own, and they read like the congestion
  // ladder rather than inventing a second vocabulary.
  assert.deepEqual(en.occupancy, ['Free-flowing', 'Near saturation', 'Saturated', 'Jammed']);
  assert.equal(en.slot, 'typical weekend · 18:00');
  assert.equal(withLocale('fr', () => comptagesSlotLabel({ kind: 'hour', day: 'weekend', hour: 18 })),
    'week-end type · 18 h');
});

test('the rhythm wheel names seven shapes, and prints the cut behind each', () => {
  const labels = withLocale('en', () => ({ ...COMPTAGES_RHYTHM_LABELS }));
  const blurbs = withLocale('en', () => comptagesRhythmBlurbs());
  assertNoFrench({ labels, blurbs });
  assert.equal(labels.pendulaire, 'Commuter');
  assert.equal(labels.vesperal, 'Evening peak');
  assert.equal(labels.indetermine, 'Rhythm undetermined');
  assert.match(blurbs.nocturne, /^\d{2}–\d{2} h ≥ \d+% of the weekday$/);
  assert.match(blurbs.plateau, /^no peak ≥ [\d.]+ × the \d{2}–\d{2} h trough$/);
  assert.match(blurbs.indetermine, /^fewer than \d+ h published of 24$/);
  assert.equal(withLocale('fr', () => COMPTAGES_RHYTHM_LABELS.pendulaire), 'Pendulaire');
});

test('the TomTom flow key prints its thresholds and refuses to invent a feed', () => {
  const m = withLocale('en', () => trafficMessages());
  assertNoFrench({
    buckets: [m.buckets.jam(55), m.buckets.slow(55, 85), m.buckets.free(85)],
    legend: m.legend,
    note: m.legendNote,
    chips: [m.chips.measuredOnly.label, m.chips.measuredOnly.hideSimulated, m.chips.flowRibbon.show],
  });
  assert.equal(m.buckets.jam(55), 'under 55% of free-flow speed');
  assert.equal(m.buckets.slow(55, 85), '55 to 85% of free-flow speed');
  assert.equal(m.legendNote, 'flow modeled by TomTom, refreshed every 60 s');
  assert.equal(m.legend.simulated, 'Simulated speed');
  assert.equal(m.legend.simulatedBlurb, 'an invented speed, nothing published — “MEASURED ONLY” removes them');
  assert.equal(m.chips.measuredOnly.label, 'MEASURED ONLY');
  // A keyless session must never read as live.
  assert.match(m.status.keyless, /^SIMULATED — /);
  assert.equal(withLocale('fr', () => trafficMessages().legend.simulated), 'Vitesse simulée');
});
