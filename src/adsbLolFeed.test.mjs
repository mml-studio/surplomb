import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADSBLOL_429_PAUSE_MS,
  ADSBLOL_MIN_GAP_MS,
  ADSBLOL_RADIUS_NM,
  ADSBLOL_WANT_TTL_MS,
  FRANCE_BBOX,
  FRANCE_CELLS,
  createAdsbLolScheduler,
  distanceKm,
  franceSnapshot,
  inFranceZone,
  mergeCellSnapshots,
  parsePointAnswer,
  pointUrl,
  regionalSnapshot,
} from './adsbLolFeed.js';

// ── A clock the tests drive ────────────────────────────────────────────────

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function fakeClock(start = 1_790_000_000_000) {
  let t = start;
  const timers = [];
  return {
    now: () => t,
    setTimer(fn, ms) {
      const handle = { at: t + Math.max(0, ms), fn };
      timers.push(handle);
      return handle;
    },
    clearTimer(handle) {
      const index = timers.indexOf(handle);
      if (index >= 0) timers.splice(index, 1);
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        await flush();
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > end) break;
        timers.shift();
        t = due.at;
        due.fn();
      }
      t = end;
      await flush();
    },
  };
}

/** adsb.lol answering one aircraft per circle, named after the circle. */
function fakeAdsbLol(clock, { status = () => 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push({ url: String(url), at: clock.now() });
    const code = status(String(url), calls.length);
    if (code !== 200) return new Response('{}', { status: code });
    const [, lat, lon] = /lat\/([-\d.]+)\/lon\/([-\d.]+)/.exec(String(url)) || [];
    const hex = lat ? `a${Math.abs(Math.round(Number(lat) * 10))}${Math.abs(Math.round(Number(lon) * 10))}`.slice(0, 6).padEnd(6, '0') : 'mil000';
    const body = {
      now: clock.now(),
      ac: [
        { hex, flight: 'AFR1234 ', lat: Number(lat) || 48, lon: Number(lon) || 2, seen_pos: 1, seen: 1, alt_baro: 35000, t: 'A20N', r: 'F-HXXX' },
        // Heard by every circle: the merge must keep one.
        { hex: 'shared', flight: 'EZY1', lat: 46, lon: 2, seen_pos: 0, seen: 0, alt_baro: 30000 },
      ],
    };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  impl.calls = calls;
  return impl;
}

const quiet = { warn() {} };

function scheduler(clock, fetchImpl, extra = {}) {
  return createAdsbLolScheduler({
    fetchImpl, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, log: quiet, ...extra,
  });
}

// ── Geometry ───────────────────────────────────────────────────────────────

test('the four circles cover every point of metropolitan France and Corsica', () => {
  const radiusKm = ADSBLOL_RADIUS_NM * 1.852;
  let worst = 0;
  for (let lat = FRANCE_BBOX.south; lat <= FRANCE_BBOX.north + 1e-9; lat += 0.1) {
    for (let lon = FRANCE_BBOX.west; lon <= FRANCE_BBOX.east + 1e-9; lon += 0.1) {
      const nearest = Math.min(...FRANCE_CELLS.map((cell) => distanceKm(lat, lon, cell.lat, cell.lon)));
      worst = Math.max(worst, nearest);
    }
  }
  assert.ok(worst < radiusKm, `farthest point is ${worst.toFixed(0)} km from a centre, radius ${radiusKm.toFixed(0)} km`);
  assert.ok(worst > 380, 'and the circles are not packed tighter than they need to be');
});

test('the France zone is the box: Brest, Ajaccio and Strasbourg in, London and Barcelona out', () => {
  assert.equal(inFranceZone(48.39, -4.49), true);
  assert.equal(inFranceZone(41.92, 8.74), true);
  assert.equal(inFranceZone(48.57, 7.75), true);
  assert.equal(inFranceZone(51.5, -0.12), false);
  assert.equal(inFranceZone(41.39, 2.17), true, 'Barcelona sits just inside the box, which the circles cover');
  assert.equal(inFranceZone(40.4, -3.7), false);
  assert.equal(inFranceZone(Number.NaN, 2), false);
});

test('a merged snapshot holds each aircraft once, from the circle that heard it last, and the oldest time', () => {
  const merged = mergeCellSnapshots([
    { time: 100, states: [['a', 'X', null, 99, 99], ['b', 'Y', null, 90, 90]] },
    { time: 110, states: [['a', 'X', null, 108, 108], ['c', 'Z', null, 105, 105]] },
    null,
  ]);
  assert.equal(merged.time, 100);
  assert.deepEqual(merged.states.map((s) => [s[0], s[4]]).sort(), [['a', 108], ['b', 90], ['c', 105]]);
});

test('a point answer is read into OpenSky-shaped vectors with the feed type and tail', () => {
  const record = parsePointAnswer(JSON.stringify({
    now: 1_790_000_000_000,
    ac: [{ hex: '3c6444', flight: 'DLH4AB ', lat: 48, lon: 2, seen_pos: 2, seen: 1, alt_baro: 36000, t: 'A20N', r: 'D-AINA' }],
  }));
  assert.equal(record.count, 1);
  assert.equal(record.time, 1_790_000_000);
  assert.equal(record.states[0][18], 'A20N');
  assert.equal(pointUrl(48.65, -1.5), 'https://api.adsb.lol/v2/lat/48.65/lon/-1.5/dist/250');
});

// ── The queue ──────────────────────────────────────────────────────────────

test('departures are at least 20 s apart, whoever asks, and each job is fetched in turn', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock);
  const feed = scheduler(clock, fetchImpl);
  // Asked for every 30 s, like a visitor's poll.
  const ask = () => {
    for (const cell of FRANCE_CELLS) feed.want(cell.key, { url: pointUrl(cell.lat, cell.lon), parse: parsePointAnswer });
    feed.want('mil', { url: 'https://api.adsb.lol/v2/mil', parse: (text) => ({ body: text }) });
  };
  ask();
  await clock.advance(30_000);
  ask();
  await clock.advance(30_000);
  ask();
  await clock.advance(ADSBLOL_MIN_GAP_MS + 1);
  assert.equal(fetchImpl.calls.length, 5, 'five jobs, five departures, one round');
  for (let i = 1; i < fetchImpl.calls.length; i += 1) {
    assert.ok(fetchImpl.calls[i].at - fetchImpl.calls[i - 1].at >= ADSBLOL_MIN_GAP_MS);
  }
  assert.equal(new Set(fetchImpl.calls.map((call) => call.url)).size, 5, 'nobody is fetched twice before everybody once');
  assert.equal(feed.roundSeconds(), 100);
});

test('with nobody asking the queue goes quiet, and a single job refreshes every 20 s', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock);
  const feed = scheduler(clock, fetchImpl);
  feed.want('mil', { url: 'https://api.adsb.lol/v2/mil', parse: (text) => ({ body: text }) });
  await clock.advance(60_000);
  assert.equal(fetchImpl.calls.length, 4, 't = 0, 20, 40, 60 s');
  await clock.advance(ADSBLOL_WANT_TTL_MS * 2);
  const quietAt = fetchImpl.calls.length;
  await clock.advance(10 * 60_000);
  assert.equal(fetchImpl.calls.length, quietAt, 'no request with nobody watching');
  assert.ok(quietAt <= 1 + Math.ceil((60_000 + ADSBLOL_WANT_TTL_MS) / ADSBLOL_MIN_GAP_MS) + 1);
});

test('a 429 pauses the whole queue for a minute', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock, { status: (url, n) => (n === 1 ? 429 : 200) });
  const feed = scheduler(clock, fetchImpl);
  feed.want('mil', { url: 'https://api.adsb.lol/v2/mil', parse: (text) => ({ body: text }) });
  await clock.advance(ADSBLOL_429_PAUSE_MS - 1);
  assert.equal(fetchImpl.calls.length, 1);
  await clock.advance(2);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(feed.stats().refusals, 1);
});

test('whoever is waiting is served first', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock);
  const feed = scheduler(clock, fetchImpl);
  feed.want('a', { url: 'https://api.adsb.lol/v2/lat/1/lon/1/dist/250', parse: parsePointAnswer });
  await clock.advance(1); // 'a' departs at once
  feed.want('b', { url: 'https://api.adsb.lol/v2/lat/2/lon/2/dist/250', parse: parsePointAnswer });
  feed.want('c', { url: 'https://api.adsb.lol/v2/lat/3/lon/3/dist/250', parse: parsePointAnswer });
  const answer = feed.next('c', 30_000);
  await clock.advance(ADSBLOL_MIN_GAP_MS);
  assert.equal(fetchImpl.calls[1].url, 'https://api.adsb.lol/v2/lat/3/lon/3/dist/250');
  assert.equal((await answer).count, 2);
});

test('a wait that outlasts its bound resolves with what the job holds', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock, { status: () => 503 });
  const feed = scheduler(clock, fetchImpl);
  feed.want('a', { url: 'https://api.adsb.lol/v2/lat/1/lon/1/dist/250', parse: parsePointAnswer });
  const answer = feed.next('a', 5_000);
  await clock.advance(5_001);
  assert.equal(await answer, null);
});

// ── What the flights endpoint serves ───────────────────────────────────────

test('France from cold: the circle nearest the view first, then all four merged within a round', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock);
  const feed = scheduler(clock, fetchImpl);
  const first = franceSnapshot(feed, { lat: 43.3, lon: 5.4 }, { now: clock.now }); // Marseille
  await clock.advance(1);
  const cold = await first;
  assert.equal(cold.area, 'fr-metro');
  assert.equal(cold.cells, 1);
  assert.equal(fetchImpl.calls[0].url, pointUrl(43.75, 5.9), 'the south-east circle, nearest Marseille');
  await clock.advance(ADSBLOL_MIN_GAP_MS * 3);
  const warm = await franceSnapshot(feed, { lat: 43.3, lon: 5.4 }, { now: clock.now });
  assert.equal(warm.cells, 4);
  assert.equal(warm.states.filter((state) => state[0] === 'shared').length, 1, 'heard four times, drawn once');
  assert.equal(warm.states.length, 5);
  assert.equal(warm.roundSeconds, 80);
});

test('France with adsb.lol down: null after the bounded wait, and nothing drawn from nothing', async () => {
  const clock = fakeClock();
  const feed = scheduler(clock, fakeAdsbLol(clock, { status: () => 502 }));
  const pending = franceSnapshot(feed, null, { now: clock.now, waitMs: 25_000 });
  await clock.advance(25_001);
  assert.equal(await pending, null);
});

test('a regional circle is shared by any view within 100 NM of it', async () => {
  const clock = fakeClock();
  const fetchImpl = fakeAdsbLol(clock);
  const feed = scheduler(clock, fetchImpl);
  const madrid = regionalSnapshot(feed, { lat: 40.42, lon: -3.7 }, { now: clock.now });
  await clock.advance(1);
  const first = await madrid;
  assert.equal(first.key, 'pt:40.50,-3.75');
  // 60 km north-east: the same circle, no new request.
  const nearby = await regionalSnapshot(feed, { lat: 40.8, lon: -3.2 }, { now: clock.now });
  assert.equal(nearby.key, first.key);
  assert.equal(fetchImpl.calls.length, 1);
  // 500 km away: a circle of its own.
  const lisbon = regionalSnapshot(feed, { lat: 38.72, lon: -9.14 }, { now: clock.now });
  await clock.advance(ADSBLOL_MIN_GAP_MS);
  assert.equal((await lisbon).key, 'pt:38.75,-9.25');
  assert.equal(fetchImpl.calls.length, 2);
});
