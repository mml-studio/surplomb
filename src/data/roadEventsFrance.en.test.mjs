// Road events in English, composed from the SAME captured DATEX II document
// the French tests project: the real Bison Futé snapshot of 2026-08-31, run
// through the real projection.
//
// A card here is an argument, not a readout — a forecast is labelled as one, a
// section drawn between two published endpoints says the route was not
// supplied — and the English has to make the same claims. Each block asserts
// the English and then the French beside it, proving one loaded layer answers
// in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROAD_EVENT_CATEGORIES,
  ROAD_EVENT_SCOPES,
  createRoadEventSelectedEntry,
  formatRoadEventWindow,
  roadEventDetails,
  roadEventLegend,
  roadEventLegendNote,
  roadEventTitle,
  summarizeRoadEvents,
} from './roadEventsFrance.js';
import { projectRoadEvents } from './bisonFuteFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const EVENTS_XML = readFileSync(
  new URL('./fixtures/bison-fute-evenementiel-sample.xml', import.meta.url),
  'utf8',
);
const CAPTURE_MS = Date.parse('2026-08-31T21:13:26.825+02:00');
const EVENTS = projectRoadEvents(EVENTS_XML, { nowMs: CAPTURE_MS }).events;
const byId = (id) => EVENTS.find((event) => event.id === id);

// Roads, operators and the publisher are data: they stay French inside an
// English card.
const DATA = ['DIR Méditerranée', 'Bison Futé'];

/**
 * The lines a card OWNS, without the ones it merely carries.
 *
 * The DIRs write their order, their place description and their town names in
 * French and this app republishes them verbatim — translating a prefectoral
 * order would be inventing one. So the English assertions run on the lines
 * this layer composes, and the data lines are dropped here rather than
 * allow-listed one by one.
 */
const composed = (event, lines) => {
  const carried = new Set([
    ...String(event?.description || '').split('\n').map((part) => part.trim()).filter(Boolean),
    [event?.town, event?.location].filter(Boolean).join(' — '),
  ]);
  return lines.filter((line) => !carried.has(line));
};

test('the key: eight categories, what each covers, and who publishes them', () => {
  const summary = summarizeRoadEvents(EVENTS);
  const view = withLocale('en', () => ({
    legend: roadEventLegend(summary.byCategory).map(({ label, blurb, count }) => ({ label, blurb, count })),
    note: roadEventLegendNote(),
  }));
  assertNoFrench(view, { allow: DATA });
  assert.equal(view.note, 'published by Bison Futé and the DIRs, re-read every 5 min');
  const labels = view.legend.map((row) => row.label);
  assert.ok(labels.includes('Roadworks'), `roadworks row missing from ${labels.join(', ')}`);
  const works = view.legend.find((row) => row.label === 'Roadworks');
  assert.equal(works.blurb, 'work under way or scheduled');
  // The French key, unchanged.
  const fr = withLocale('fr', () => roadEventLegend(summary.byCategory));
  assert.ok(fr.some((row) => row.label === 'Travaux' && row.blurb === 'chantier en cours ou programmé'));
  assert.equal(withLocale('fr', () => roadEventLegendNote()),
    'publié par Bison Futé et les DIR, relu toutes les 5 min');
});

test('the Action b credit and the conceded-motorway legend read in both languages', () => {
  const event = {
    ...EVENTS[0],
    operator: 'APRR',
    licence: 'action-b',
    updated: Date.parse('2026-08-31T20:45:00+02:00'),
  };
  const en = withLocale('en', () => roadEventDetails(event, CAPTURE_MS));
  assert.ok(en.includes('Information supplied by APRR · updated 20:45'), en.join(' | '));
  const fr = withLocale('fr', () => roadEventDetails(event, CAPTURE_MS));
  assert.ok(fr.includes('Information fournie par APRR · mise à jour 20:45'), fr.join(' | '));
  assert.equal(withLocale('en', () => roadEventLegendNote(true)),
    'published by Bison Futé, the DIRs and the motorway companies, re-read every 5 min');
  assert.equal(withLocale('fr', () => roadEventLegendNote(true)),
    'publié par Bison Futé, les DIR et les sociétés d’autoroute, relu toutes les 5 min');
});

test('the three scopes name what they add', () => {
  const chips = withLocale('en', () => ROAD_EVENT_SCOPES.map(({ id, label, title }) => ({ id, label, title })));
  assertNoFrench(chips);
  assert.deepEqual(chips, [
    { id: 'active', label: 'Under way', title: 'Only events under way' },
    { id: 'upcoming', label: '+ Upcoming', title: 'Add scheduled roadworks and closures' },
    { id: 'all', label: 'All', title: 'Add the events the operator has closed' },
  ]);
  assert.equal(withLocale('fr', () => ROAD_EVENT_SCOPES[1].label), '+ À venir');
});

test('a title says what happened and where, without repeating itself', () => {
  const titles = withLocale('en', () => ({
    plain: roadEventTitle(byId('260830-002035')),
    withSubtype: roadEventTitle(byId('260131-000090')),
    noRoad: roadEventTitle({ category: 'travaux', subtype: 'grassCuttingWork' }),
    unknownCode: roadEventTitle({ category: 'travaux', subtype: 'bridgeJacking' }),
  }));
  assertNoFrench(titles, { allow: DATA });
  assert.equal(titles.plain, 'Accident — N94');
  assert.equal(titles.withSubtype, 'Obstacle · rockfalls — N20');
  assert.equal(titles.noRoad, 'Roadworks · grass cutting');
  // A subtype code this build has never met is printed as the code, never dropped.
  assert.equal(titles.unknownCode, 'Roadworks · bridgeJacking');
  assert.equal(withLocale('fr', () => roadEventTitle(byId('260131-000090'))),
    'Obstacle · chutes de pierres — N20');
});

test('the card of a closed accident: place, kilometer post, window, lanes, source', () => {
  const event = byId('260830-002035');
  const lines = withLocale('en', () => roadEventDetails(event, CAPTURE_MS));
  assertNoFrench(composed(event, lines), { allow: DATA });
  assert.ok(lines.some((line) => line === 'PR 05PR91U + 941 m'));
  assert.ok(lines.some((line) => line === 'Source: DIR Méditerranée'));
  assert.ok(lines.some((line) => line === '2 lanes closed of 2'));
  assert.ok(lines.some((line) => line === 'Safety-related message'));
  assert.ok(lines.some((line) => line.includes('both directions')));
  assert.ok(lines.some((line) => /^Ended on /.test(line)));
  // French, same event.
  const fr = withLocale('fr', () => roadEventDetails(byId('260830-002035'), CAPTURE_MS));
  assert.ok(fr.some((line) => line === 'Source : DIR Méditerranée'));
  assert.ok(fr.some((line) => line.includes('2 voies neutralisées sur 2')));
});

test('a forecast is never presented as a fact', () => {
  const probable = { ...byId('260122-001698'), probability: 'probable' };
  const risk = { ...probable, probability: 'riskOf' };
  const en = withLocale('en', () => ({
    probable: roadEventDetails(probable, CAPTURE_MS),
    risk: roadEventDetails(risk, CAPTURE_MS),
  }));
  assertNoFrench(composed(probable, en.probable), { allow: DATA });
  assertNoFrench(composed(risk, en.risk), { allow: DATA });
  assert.ok(en.probable.includes('Forecast — not confirmed'));
  assert.ok(en.risk.includes('Risk reported — not confirmed'));
  assert.ok(!withLocale('en', () => roadEventDetails({ ...probable, probability: 'certain' }, CAPTURE_MS))
    .some((line) => line.includes('not confirmed')));
});

test('a consequence tally counts and pluralizes in the reader’s language', () => {
  const also = { travaux: 2, fermeture: 1, deviation: 3, accident: 1 };
  const en = withLocale('en', () => roadEventDetails({ category: 'travaux', also })
    .find((line) => line.startsWith('Declared consequences')));
  assertNoFrench(en);
  assert.equal(en, 'Declared consequences: 2 roadworks, 1 closure, 3 detours, 1 accident');
  assert.equal(
    withLocale('fr', () => roadEventDetails({ category: 'travaux', also }).find((line) => line.startsWith('Conséquences'))),
    'Conséquences déclarées : 2 travaux, 1 fermeture, 3 déviations, 1 accident',
  );
});

test('a long chord admits it is not the road, and a short one does not apologize', () => {
  const short = { category: 'travaux', geometry: { kind: 'segment', coordinates: [2.0, 48.0, 2.01, 48.0] } };
  const long = { category: 'travaux', geometry: { kind: 'segment', coordinates: [2.0, 48.0, 2.0, 48.5] } };
  const en = withLocale('en', () => ({
    short: roadEventDetails(short).find((line) => line.startsWith('Section')),
    long: roadEventDetails(long).find((line) => line.startsWith('Section')),
  }));
  assertNoFrench(en);
  assert.match(en.short, /^Section of \d+ m$/);
  assert.equal(en.long, 'Section of 56 km — endpoints published, no route supplied');
});

test('the window is phrased for the state it describes, on a 24-hour clock', () => {
  const en = withLocale('en', () => ({
    planned: formatRoadEventWindow(byId('260122-001698'), CAPTURE_MS),
    ended: formatRoadEventWindow(byId('260830-002035'), CAPTURE_MS),
    active: formatRoadEventWindow(byId('260831-001970'), CAPTURE_MS),
    closedWithNoEnd: formatRoadEventWindow({ state: 'ended', start: CAPTURE_MS, end: null }, CAPTURE_MS),
    sameDay: formatRoadEventWindow({ state: 'active', start: CAPTURE_MS }, CAPTURE_MS),
  }));
  assertNoFrench(en);
  assert.match(en.planned, /^Scheduled from /);
  assert.match(en.ended, /^Ended on /);
  assert.match(en.active, /^Since /);
  assert.equal(en.closedWithNoEnd, 'Closed by the operator');
  // Same day: the hour alone, 24-hour clock in both languages (glossary).
  assert.equal(en.sameDay, 'Since 21:13');
  assert.equal(withLocale('fr', () => formatRoadEventWindow({ state: 'active', start: CAPTURE_MS }, CAPTURE_MS)),
    'Depuis 21:13');
});

test('the selected card carries its English title and details', () => {
  const event = byId('260131-000090');
  const entry = withLocale('en', () => createRoadEventSelectedEntry({
    id: 'road-event:260131-000090',
    position: { x: 1, y: 2, z: 3 },
    event,
    nowMs: CAPTURE_MS,
  }));
  assertNoFrench({ title: entry.title, details: composed(event, entry.details) }, { allow: DATA });
  assert.equal(entry.title, 'Obstacle · rockfalls — N20');
  assert.ok(ROAD_EVENT_CATEGORIES.obstacle.priority > ROAD_EVENT_CATEGORIES.deviation.priority);
});
