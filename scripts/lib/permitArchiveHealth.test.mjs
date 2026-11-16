// scripts/lib/permitArchiveHealth.test.mjs
// The nightly verdict on the permit archive, against archives written here:
// a healthy night, the 15 November 2026 failure modes (a sweep that runs but
// does not read, a list stopped for weeks, robots refusals), and an archive
// file that cannot be read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LISTED_STOPS,
  NEW_STOP_MAX_DAYS,
  STOPPED_AFTER_DAYS,
  assessPermitArchive,
  daysBetween,
  expectedPermitArchive,
  readPermitArchive,
} from './permitArchiveHealth.mjs';

const DAY = '2026-11-16';

function commune(instance, insee, lastDay, rows = 3) {
  return { insee, instance, firstDay: '2026-10-01', lastDay, rows };
}

function family(stampDay, communes, extra = {}) {
  return {
    stamp: stampDay ? { day: stampDay, communes: communes.length, read: communes.length, added: 4, failed: [], refused: [], ...extra } : null,
    communes,
    unreadable: 0,
  };
}

test('daysBetween counts calendar days across a month and the DST change', () => {
  assert.equal(daysBetween('2026-10-17', '2026-11-16'), 30);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween(DAY, DAY), 0);
});

test('a night where every family swept and every municipality was read is ok', () => {
  const report = assessPermitArchive({
    cartds: family(DAY, [commune('dijon', '21231', DAY), commune('mamp', '13055', DAY)]),
    mmm: family('2026-11-15', [commune('mmm', '34172', '2026-11-15')]),
  }, DAY);
  assert.equal(report.verdict, 'ok');
  assert.deepEqual(report.problems, []);
  assert.equal(report.families.cartds.fresh, 2);
  assert.equal(report.families.mmm.fresh, 1, 'Montpellier is swept after the check: a day behind is fresh');
  assert.match(report.text, /^Permit archive 2026-11-16: OK, nothing to do\./);
});

test('a sweep that runs but no longer reads an instance is caught by the files, not the stamp', () => {
  // 15/11/2026: sweep.json was dated that night, yet 736 Cart@DS municipalities
  // had not been read since 22-25 October.
  const report = assessPermitArchive({
    cartds: family(DAY, [
      commune('dijon', '21231', '2026-10-24'),
      commune('mamp', '13001', '2026-10-25'),
      commune('mamp', '13055', '2026-10-22'),
      commune('toulon', '83137', DAY),
    ], { refused: ['dijon', 'mamp'] }),
  }, DAY);
  assert.equal(report.verdict, 'act');
  const stops = report.problems.filter((p) => p.kind === 'stopped');
  assert.deepEqual(stops.map((p) => [p.instance, p.communes, p.since, p.daysStopped, p.isNew, p.robots]), [
    ['mamp', 2, '2026-10-25', 22, false, true],
    ['dijon', 1, '2026-10-24', 23, false, true],
  ]);
  assert.equal(report.problems.filter((p) => p.kind === 'refused').length, 0, 'a refused instance is named once, on its stop');
  assert.match(report.text, /Ongoing stops, cartds: mamp \(2 municipalities, since 2026-10-25, 22 d, robots\), dijon \(since 2026-10-24, 23 d, robots\)\./);
  assert.match(report.text, /--recheck-robots/);
});

test('one missed night is not a stop; two are, and a stop stays new for three days', () => {
  const report = assessPermitArchive({
    'permit-lists': family(DAY, [
      commune('lille', '59350', '2026-11-15'),
      commune('acheres', '78005', '2026-11-14'),
      commune('larochelle', '17300', '2026-11-13'),
      commune('auchel', '62048', '2026-11-12'),
      commune('marseille', '13055', '2026-10-17'),
    ]),
  }, DAY);
  assert.equal(STOPPED_AFTER_DAYS, 2);
  assert.equal(NEW_STOP_MAX_DAYS, 3);
  const stops = report.problems.filter((p) => p.kind === 'stopped');
  assert.deepEqual(stops.map((p) => [p.instance, p.daysStopped, p.isNew]), [
    ['acheres', 2, true],
    ['larochelle', 3, true],
    ['auchel', 4, false],
    ['marseille', 30, false],
  ]);
  assert.match(report.text, /NEW stops: permit-lists\/acheres \(since 2026-11-14, 2 d\), permit-lists\/larochelle \(since 2026-11-13, 3 d\)\./);
  assert.match(report.text, /Ongoing stops, permit-lists: auchel \(since 2026-11-12, 4 d\), marseille \(since 2026-10-17, 30 d\)\./);
});

test('a family whose sweep did not run tonight is named, and so is an instance refused before it stopped', () => {
  const report = assessPermitArchive({
    sirap: family('2026-11-15', [commune('siea', '01001', '2026-11-15')]),
    cartds: family(DAY, [commune('ccpro', '84087', DAY)], { refused: ['ccpro'] }),
    epermis: family(null, [commune('nicecotedazur', '06088', DAY)]),
  }, DAY);
  assert.deepEqual(report.problems.map((p) => [p.kind, p.family, p.instance ?? p.stampDay ?? null]), [
    ['refused', 'cartds', 'ccpro'],
    ['not-swept', 'epermis', null],
    ['not-swept', 'sirap', '2026-11-15'],
  ]);
  assert.match(report.text, /Not swept: epermis \(last stamp none\), sirap \(last stamp 2026-11-15\)\./);
  assert.match(report.text, /Refused by robots\.txt tonight: cartds\/ccpro\./);
});

test('a refusal on a stamp that is itself stale is not reported as tonight\'s', () => {
  const report = assessPermitArchive({
    cartds: family('2026-11-14', [commune('ccpro', '84087', '2026-11-15')], { refused: ['ccpro'] }),
  }, DAY);
  assert.deepEqual(report.problems.map((p) => p.kind), ['not-swept']);
});

test('a file whose municipality left its register is retired, not stopped', () => {
  const report = assessPermitArchive({
    sirap: family(DAY, [commune('siea', '01001', DAY), commune('pu16131', '16131', '2026-10-04')]),
  }, DAY, { sirap: new Set(['01001']) });
  assert.equal(report.verdict, 'ok');
  assert.equal(report.families.sirap.retired, 1);
  assert.equal(report.families.sirap.neverArchived, 0);
  assert.equal(report.families.sirap.files, 1);
});

test('a registered municipality with no file after a sweep is never archived, named by its instance', () => {
  // Bayonne, 2 October to 16 November 2026: registered, swept every night,
  // refused every night, and no file, so no stop to see.
  const expected = {
    cartds: new Map([['21231', 'dijon'], ['64102', 'bayonne'], ['94017', 'champigny'], ['94018', 'champigny']]),
    'permit-lists': new Map([['59350', 'lille']]),
  };
  const report = assessPermitArchive({
    cartds: family(DAY, [commune('dijon', '21231', DAY)]),
    'permit-lists': family('2026-11-14', []),
  }, DAY, expected);
  assert.equal(report.verdict, 'act');
  assert.equal(report.families.cartds.neverArchived, 3);
  assert.deepEqual(report.problems.filter((p) => p.kind === 'never-archived'), [
    { kind: 'never-archived', family: 'cartds', instance: 'champigny', communes: 2, robots: false },
    { kind: 'never-archived', family: 'cartds', instance: 'bayonne', communes: 1, robots: false },
  ], 'a family that did not sweep is not judged on what it has not archived yet');
  assert.match(report.text, /Never archived: cartds\/champigny \(2 municipalities\), cartds\/bayonne\./);
});

test('a never-archived instance refused by robots.txt is named once, with the hint to recheck', () => {
  const report = assessPermitArchive({
    cartds: family(DAY, [commune('dijon', '21231', DAY)], { refused: ['ccpro'] }),
  }, DAY, { cartds: new Map([['21231', 'dijon'], ['84087', 'ccpro']]) });
  assert.deepEqual(report.problems.map((p) => [p.kind, p.instance, p.robots]), [['never-archived', 'ccpro', true]]);
  assert.match(report.text, /Never archived: cartds\/ccpro \(robots\)\./);
  assert.match(report.text, /--recheck-robots/);
});

test('above a dozen stops in a family, the largest are named and the rest counted', () => {
  const communes = [];
  for (let i = 0; i < LISTED_STOPS + 3; i += 1) {
    for (let j = 0; j <= i; j += 1) communes.push(commune(`host${i}`, `${10000 + i * 100 + j}`, '2026-10-24'));
  }
  const report = assessPermitArchive({ cartds: family(DAY, communes) }, DAY);
  const line = report.text.split('\n').find((l) => l.startsWith('Ongoing stops, cartds'));
  assert.match(line, /^Ongoing stops, cartds: 15 instances, 120 municipalities; largest host14 \(15 municipalities/);
  assert.equal(line.match(/host/g).length, 5);
});

test('the registers name a set of municipalities for every family the server archives', () => {
  const expected = expectedPermitArchive();
  assert.deepEqual(Object.keys(expected).sort(), ['cartds', 'epermis', 'mmm', 'permit-lists', 'sirap']);
  for (const [name, codes] of Object.entries(expected)) assert.ok(codes.size > 0, name);
  assert.ok(expected['permit-lists'].has('13055'), 'Marseille is a list city');
  assert.ok(expected.mmm.has('34172'), 'Montpellier is in the open-data family');
  assert.equal(expected.cartds.get('64102'), 'bayonne', 'each municipality names the instance that reads it');
  assert.equal(expected['permit-lists'].get('59350'), 'lille');
});

test('assessPermitArchive refuses a day that is not a day', () => {
  assert.throws(() => assessPermitArchive({}, '16/11/2026'), /not a day/);
});

test('readPermitArchive reads stamps and municipalities, counts what it cannot parse, and writes nothing', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'permit-archive-health-'));
  try {
    const dir = path.join(root, 'cartds');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'sweep.json'), JSON.stringify({ day: DAY, communes: 2, read: 1, added: 0, failed: ['21231'], refused: [] }));
    await fsp.writeFile(path.join(dir, '21231.json'), JSON.stringify({
      schema: 1, instance: 'dijon', insee: '21231', firstDay: '2026-10-02', lastDay: '2026-11-13', days: 22,
      rows: [{ board: 'pc', cells: [], first: '2026-10-02', last: '2026-11-13' }],
    }));
    await fsp.writeFile(path.join(dir, '83137.json'), '{"schema":1,');
    await fsp.writeFile(path.join(dir, '83137.json.unreadable-1'), 'kept aside');
    await fsp.writeFile(path.join(root, 'stray.json'), '{}');
    const before = (await fsp.readdir(dir)).sort();

    const families = await readPermitArchive(root);
    assert.deepEqual(Object.keys(families), ['cartds']);
    assert.equal(families.cartds.stamp.day, DAY);
    assert.equal(families.cartds.unreadable, 1);
    assert.deepEqual(families.cartds.communes, [{ insee: '21231', instance: 'dijon', firstDay: '2026-10-02', lastDay: '2026-11-13', rows: 1 }]);
    assert.deepEqual((await fsp.readdir(dir)).sort(), before);

    const report = assessPermitArchive(families, DAY);
    assert.equal(report.families.cartds.unreadable, 1);
    assert.equal(report.families.cartds.sweep.failed, 1);
    assert.match(report.text, /cartds 1\/2 read, 0\/1 fresh, \+0 rows, 1 failed tonight/);
    assert.deepEqual(await readPermitArchive(path.join(root, 'missing')), {});
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
