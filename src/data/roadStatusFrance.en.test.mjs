// The declared state of the national road network, in English: the card of a
// selected segment, the key, and the viewport gate — read through the real
// module, from a record shaped exactly as the proxy sends it.
//
// What the English has to keep is the layer's honesty: the numbers are a
// six-minute average and say so, a station that counted nothing is not a jam,
// and a dot resolved from a kilometer post admits it.
import test from 'node:test';
import assert from 'node:assert/strict';
import layer, {
  buildRoadStatusSelectionLabel,
  roadStatusLegendNote,
  segmentMidpoint,
  _roadStatusRowControlsForTest,
  _roadStatusStatsForTest,
  _setRoadStatusNoticeForTest,
  _setRoadStatusStateForTest,
} from './roadStatusFrance.js';
import { roadStatusCoverageNotice } from './roadStatusCoverage.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Publisher, operator and centre names stay French inside English text.
const NAMES = ['Bison Futé', 'DIRA', 'ALIENOR'];

function makeRecord(overrides = {}) {
  const segment = {
    id: 'MB133.I1',
    c: [-0.62269, 44.8835, -0.63265, 44.87688],
    s: 'freeFlow',
    d: 'DIRA',
    a: 'A630',
    z: 'BX33',
    src: ['ALIENOR'],
    at: new Date(Date.now() - 42_000).toISOString(),
    f: 410,
    v: 88.666664,
    n: 53,
    ...overrides,
  };
  return { id: `road-status-fr:${segment.id}`, segment, midpoint: segmentMidpoint(segment.c) };
}

test('the card of a free-flowing segment, in English', () => {
  const label = withLocale('en', () => buildRoadStatusSelectionLabel(makeRecord()));
  const [title, ...details] = label.split('\n');
  assertNoFrench(details, { allow: NAMES });
  assert.equal(title, 'A630 · MB133.I1');
  assert.equal(details[0], '● Free-flowing');
  assert.equal(details[1], '410 veh/h · 89 km/h (6 min average)');
  assert.equal(details[2], '⌖ Bordeaux');
  assert.equal(details[3], 'Operator DIRA');
  assert.equal(details[4], 'state read 42 s ago');
  assert.equal(details.at(-1), 'Bison Futé / DIR — Licence Ouverte 2.0');
});

test('the same card in French, byte for byte what it printed before', () => {
  const label = withLocale('fr', () => buildRoadStatusSelectionLabel(makeRecord()));
  assert.match(label, /410 véh\/h · 89 km\/h \(moyenne sur 6 min\)/);
  assert.match(label, /état relevé il y a 42 s/);
  assert.match(label, /Exploitant DIRA/);
});

test('a station that counted nothing, and a position derived from a kilometer post', () => {
  const quiet = withLocale('en', () => buildRoadStatusSelectionLabel(makeRecord({ f: 0, v: 0, g: 'pr' })));
  assertNoFrench(quiet.split('\n'), { allow: NAMES });
  assert.match(quiet, /no vehicle counted in the last 6 min window/);
  assert.match(quiet, /position derived from its kilometer post \(PR\), median 4 m/);
  assert.ok(!/km\/h/.test(quiet), 'a zero speed is never drawn as stationary traffic');
});

test('the empty state names the publisher that is silent, and where to look instead', () => {
  _setRoadStatusStateForTest({ payload: { segments: [] } });
  _setRoadStatusNoticeForTest(withLocale('en', () => roadStatusCoverageNotice(
    { south: 48.55, west: 1.85, north: 49.15, east: 3.05 }, { segments: 0 },
  )));
  const stats = withLocale('en', () => _roadStatusStatsForTest());
  assert.equal(stats.status, 'empty');
  assert.match(stats.notice, /^DIRIF publishes neither counting stations nor a traffic-status feed — try \w/);
});

test('an unnamed road, a segment nobody watches, and a site with no state', () => {
  const orphan = withLocale('en', () => buildRoadStatusSelectionLabel(
    makeRecord({ a: null, s: 'unknown', src: [], at: null }),
    { flow: { windowEnd: Date.now() } },
  ));
  assertNoFrench(orphan.split('\n'), { allow: NAMES });
  assert.match(orphan, /^Unnamed road · MB133\.I1/);
  assert.match(orphan, /● Not reported/);
  assert.match(orphan, /state not reported for this site/);
});

test('the key names its provenance and its clock, and the gate names its threshold', async () => {
  _setRoadStatusStateForTest({
    payload: { counts: { freeFlow: 12, congested: 3, unknown: 5 } },
    status: 'ready',
  });
  const controls = withLocale('en', () => _roadStatusRowControlsForTest());
  assertNoFrench(controls, { allow: NAMES });
  assert.equal(controls.legendNote, 'state declared by the DIRs, refreshed every 60 to 360 s');
  assert.deepEqual(controls.legend.map((row) => row.label), ['Free-flowing', 'Jammed', 'Not reported']);
  assert.equal(controls.legend.at(-1).blurb, 'no center publishes a state for this point');
  assert.equal(withLocale('fr', () => roadStatusLegendNote()),
    'état déclaré par les DIR, rafraîchi toutes les 60 à 360 s');

  // The gate, through the real path: a camera above the activation ceiling.
  _setRoadStatusStateForTest({
    viewer: { camera: { positionCartographic: { height: 5_000_000 } } },
    payload: null,
  });
  await layer.update();
  const gated = withLocale('en', () => _roadStatusStatsForTest());
  assertNoFrench(gated, { allow: NAMES });
  assert.match(gated.loadingLabel, /^Zoom in below [\d.]+° to load the network state$/);
  assert.match(withLocale('fr', () => _roadStatusStatsForTest()).loadingLabel,
    /^Zoome sous [\d.,]+° pour charger l’état du réseau$/);
});
