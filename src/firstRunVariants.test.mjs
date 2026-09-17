import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIRST_RUN_ADDRESS_BUNDLE,
  FIRST_RUN_ARRIVAL_DEADLINE_MS,
  FIRST_RUN_VARIANTS,
  runFirstRunFlight,
  runFirstRunTile,
  tileLayerIds,
  variantLayerIds,
} from './firstRunVariants.js';
import { FIRST_RUN_VARIANT_IDS } from './firstRunExperience.js';
import { PHONE_HEAVY_LAYER_IDS } from './phoneSheetLayout.js';

const source = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

/** A layer switch that records what it was asked, answering per id. */
function layerSpy(answer = () => true) {
  const calls = [];
  return {
    calls,
    setLayerEnabled: async (layerId) => {
      calls.push(layerId);
      return answer(layerId);
    },
  };
}

/** Timers the test fires by hand. */
function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    setTimer: (fn, ms) => {
      const id = next++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => pending.delete(id),
    fireAll: () => {
      for (const [id, entry] of [...pending]) {
        pending.delete(id);
        entry.fn();
      }
    },
  };
}

// ── The table ────────────────────────────────────────────────────────────────

test('the table names the three variants the core knows, and what each is', () => {
  assert.deepEqual(Object.keys(FIRST_RUN_VARIANTS), [...FIRST_RUN_VARIANT_IDS]);
  assert.equal(FIRST_RUN_VARIANTS.A.kind, 'card');
  assert.equal(FIRST_RUN_VARIANTS.B.kind, 'card');
  assert.equal(FIRST_RUN_VARIANTS.C.kind, 'hint');
  assert.ok(Object.isFrozen(FIRST_RUN_VARIANTS));
  assert.ok(Object.isFrozen(FIRST_RUN_VARIANTS.B.tiles.sales.layerIds));
});

test('A switches on exactly sales, permits and DPE', () => {
  assert.deepEqual([...FIRST_RUN_ADDRESS_BUNDLE], ['dvf-sales', 'ads-fr', 'dpe-fr']);
  assert.equal(FIRST_RUN_VARIANTS.A.bundle, FIRST_RUN_ADDRESS_BUNDLE);
  assert.deepEqual(variantLayerIds('A'), ['dvf-sales', 'ads-fr', 'dpe-fr']);
  assert.equal(FIRST_RUN_ARRIVAL_DEADLINE_MS, 10000);
});

test('B asks three questions in order, and the fourth tile touches nothing', () => {
  const { tiles } = FIRST_RUN_VARIANTS.B;
  assert.deepEqual(Object.keys(tiles), ['sales', 'permits', 'live', 'explore']);
  assert.deepEqual([...tiles.sales.layerIds], ['dvf-sales', 'cadastre-fr']);
  assert.deepEqual([...tiles.permits.layerIds], ['ads-fr', 'sitadel-fr']);
  assert.deepEqual([...tiles.live.layerIds], ['traffic', 'transit-fr', 'flights']);
  assert.deepEqual([...tiles.explore.layerIds], []);
  for (const choice of ['sales', 'permits', 'live']) {
    assert.match(tiles[choice].busyText, /^Allumage : .+…$/, `${choice} says what it is doing`);
  }
  assert.equal(variantLayerIds('C').length, 0);
  assert.equal(variantLayerIds('Z').length, 0);
  assert.equal(variantLayerIds('toString').length, 0);
});

test('a phone keeps the sales and skips only the heavy parcel layer', () => {
  const { sales, permits } = FIRST_RUN_VARIANTS.B.tiles;
  assert.deepEqual(tileLayerIds(sales, false), ['dvf-sales', 'cadastre-fr']);
  assert.deepEqual(tileLayerIds(sales, true), ['dvf-sales']);
  assert.deepEqual(tileLayerIds(permits, true), ['ads-fr', 'sitadel-fr']);
  // The only skip, and it is skipped BECAUSE the sheet badges it heavy.
  const skipped = Object.values(FIRST_RUN_VARIANTS.B.tiles).flatMap((tile) => tile.phoneSkipLayerIds || []);
  assert.deepEqual(skipped, ['cadastre-fr']);
  for (const layerId of skipped) assert.ok(PHONE_HEAVY_LAYER_IDS.includes(layerId), `${layerId} is not heavy`);
  // ...and the subcopy stops promising the parcel.
  assert.equal(sales.phoneSubcopy, 'Ventes DVF, 5 ans');
  assert.doesNotMatch(sales.phoneSubcopy, /parcelle/);
  assert.deepEqual(variantLayerIds('B', { phoneShell: true }).includes('cadastre-fr'), false);
});

// ── B tiles ──────────────────────────────────────────────────────────────────

test('a B tile switches on its layers, per shell', async () => {
  const desktop = layerSpy();
  const outcome = await runFirstRunTile('sales', { setLayerEnabled: desktop.setLayerEnabled });
  assert.deepEqual(outcome, {
    ok: true, choice: 'sales', layerIds: ['dvf-sales', 'cadastre-fr'], failedLayerIds: [],
  });
  assert.deepEqual(desktop.calls, ['dvf-sales', 'cadastre-fr']);

  const phone = layerSpy();
  const onPhone = await runFirstRunTile('sales', { setLayerEnabled: phone.setLayerEnabled, phoneShell: true });
  assert.equal(onPhone.ok, true);
  assert.deepEqual(phone.calls, ['dvf-sales']);
});

test('a refused layer fails the tile by name, and a throwing one is a refusal', async () => {
  const refused = layerSpy((layerId) => layerId !== 'transit-fr');
  const outcome = await runFirstRunTile('live', { setLayerEnabled: refused.setLayerEnabled });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.failedLayerIds, ['transit-fr']);
  // Every layer was still asked: a refusal does not stop the others.
  assert.deepEqual(refused.calls, ['traffic', 'transit-fr', 'flights']);

  const throwing = await runFirstRunTile('permits', {
    setLayerEnabled: async (layerId) => {
      if (layerId === 'sitadel-fr') throw new Error('boom');
      return true;
    },
  });
  assert.equal(throwing.ok, false);
  assert.deepEqual(throwing.failedLayerIds, ['sitadel-fr']);

  // An unknown id answers `undefined` from the manager: that is not a refusal.
  const unknown = await runFirstRunTile('permits', { setLayerEnabled: async () => undefined });
  assert.equal(unknown.ok, true);
});

test('explore and an unknown choice touch nothing', async () => {
  const spy = layerSpy();
  assert.deepEqual(await runFirstRunTile('explore', { setLayerEnabled: spy.setLayerEnabled }), {
    ok: true, choice: 'explore', layerIds: [], failedLayerIds: [],
  });
  for (const choice of ['nope', 'toString', '__proto__', undefined]) {
    assert.deepEqual(await runFirstRunTile(choice, { setLayerEnabled: spy.setLayerEnabled }), { ok: false, choice });
  }
  assert.deepEqual(spy.calls, []);
});

// ── A: the flight, then the bundle ───────────────────────────────────────────

async function flight({ status = 'flying', answer, timers = fakeTimers(), label = 'Marseille' } = {}) {
  const spy = layerSpy(answer);
  let onArrival = null;
  const outcome = await runFirstRunFlight(async (hook) => {
    onArrival = hook;
    return { status, label, message: status === 'failed' ? 'Refusé.' : undefined };
  }, { setLayerEnabled: spy.setLayerEnabled, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { spy, outcome, timers, arrive: (why) => onArrival(why) };
}

test('the bundle waits for the landing, then switches on once', async () => {
  const run = await flight();
  assert.equal(run.outcome.ok, true);
  assert.equal(run.outcome.status, 'flying');
  assert.equal(run.outcome.label, 'Marseille');
  assert.deepEqual(run.outcome.layerIds, ['dvf-sales', 'ads-fr', 'dpe-fr']);
  // Nothing before the landing: a Paris scan for a flight to Marseille is waste.
  assert.deepEqual(run.spy.calls, []);
  assert.equal(run.timers.pending.size, 1);
  assert.equal([...run.timers.pending.values()][0].ms, FIRST_RUN_ARRIVAL_DEADLINE_MS);

  run.arrive('arrived');
  const landed = await run.outcome.arrival;
  assert.deepEqual(landed, { why: 'arrived', failedLayerIds: [] });
  assert.deepEqual(run.spy.calls, ['dvf-sales', 'ads-fr', 'dpe-fr']);
  assert.equal(run.timers.pending.size, 0, 'the deadline is cleared');

  // Never twice: a late cancel, a late deadline.
  run.arrive('cancelled');
  run.timers.fireAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.spy.calls.length, 3);
});

test('an interrupted flight still gets the layers the visitor chose', async () => {
  const run = await flight();
  run.arrive('cancelled');
  assert.deepEqual(await run.outcome.arrival, { why: 'cancelled', failedLayerIds: [] });
  assert.deepEqual(run.spy.calls, ['dvf-sales', 'ads-fr', 'dpe-fr']);
});

test('a lost landing hook costs the deadline, not the layers', async () => {
  const run = await flight({ answer: (layerId) => layerId !== 'dpe-fr' });
  run.timers.fireAll();
  assert.deepEqual(await run.outcome.arrival, { why: 'deadline', failedLayerIds: ['dpe-fr'] });
  run.arrive('arrived');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.spy.calls.length, 3, 'the hook arriving late does not switch them on again');
});

test('a landing reported before the start resolved is kept', async () => {
  const spy = layerSpy();
  const timers = fakeTimers();
  const outcome = await runFirstRunFlight(async (onArrival) => {
    onArrival('arrived');
    return { status: 'flying' };
  }, { setLayerEnabled: spy.setLayerEnabled, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  assert.deepEqual(await outcome.arrival, { why: 'arrived', failedLayerIds: [] });
  assert.equal(timers.pending.size, 0, 'no deadline armed for a flight that already landed');
});

test('no flight, no layers', async () => {
  for (const status of ['not-found', 'refused', 'superseded', 'cancelled', 'failed']) {
    const run = await flight({ status });
    assert.equal(run.outcome.ok, false, status);
    assert.equal(run.outcome.status, status);
    assert.equal(run.outcome.arrival, undefined);
    // Even a hook that fires anyway switches nothing on.
    run.arrive('arrived');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(run.spy.calls, [], status);
    assert.equal(run.timers.pending.size, 0, status);
  }
  assert.equal((await flight({ status: 'failed' })).outcome.message, 'Refusé.');

  const spy = layerSpy();
  const warn = console.warn;
  console.warn = () => {};
  let thrown;
  try {
    thrown = await runFirstRunFlight(async () => { throw new Error('no viewer'); }, {
      setLayerEnabled: spy.setLayerEnabled,
    });
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(thrown, { ok: false, status: 'failed' });
  const empty = await runFirstRunFlight(async () => null, { setLayerEnabled: spy.setLayerEnabled });
  assert.equal(empty.status, 'failed');
  assert.deepEqual(spy.calls, []);
});

// ── What the modules may and may not do ─────────────────────────────────────

test('B never moves the camera', () => {
  const variants = source('./firstRunVariants.js');
  const b = variants.slice(variants.indexOf('export function mountVariantB'));
  assert.ok(b.length > 0);
  assert.doesNotMatch(b, /flyTo|locateMe|camera|setView/);
  const tile = variants.slice(
    variants.indexOf('export async function runFirstRunTile'),
    variants.indexOf('/**\n * Start a flight, then switch the bundle on'),
  );
  assert.match(tile, /return \{ ok: failedLayerIds\.length === 0, choice, layerIds, failedLayerIds \};/);
  assert.doesNotMatch(tile, /flyTo|locateMe|camera|setView/);
});

test('typing an address never reaches the app hotkeys', () => {
  const variants = source('./firstRunVariants.js');
  assert.match(
    variants,
    /listen\(field, 'keydown', \(event\) => \{\s*if \(event\.key !== 'Escape' && event\.key !== 'Tab'\) event\.stopPropagation\(\);/,
  );
  // A goes through the search box's own seams, never a camera call of its own.
  assert.match(variants, /styleManager\.flyToAddress\(text, \{ onArrival \}\)/);
  assert.match(variants, /styleManager\.locateMe\(\{ onArrival, notify: false \}\)/);
  // No autofocus on a phone.
  assert.match(variants, /focusTarget: phoneShell \? null : field,/);
  // Geolocation offered only where it can work.
  assert.match(variants, /if \(locate && canGeolocate\(\)\) locate\.hidden = false;/);
});

test('no first-run module but the core touches storage', () => {
  for (const file of ['./firstRunVariants.js', './firstRunHint.js']) {
    assert.doesNotMatch(source(file), /localStorage|sessionStorage|getItem|setItem/, file);
  }
});

test('every event the modules emit is one the contract names', () => {
  const types = new Set(['impression', 'action', 'dismiss']);
  const kinds = new Set(['address', 'geoloc', 'chip', 'tile:sales', 'tile:permits', 'tile:live',
    'tile:explore', 'explore', 'hint-click']);
  const outcomes = new Set(['found', 'not-found', 'cancelled']);
  const vias = new Set(['esc', 'choice', 'yield', 'timeout', 'click-away']);
  let seen = 0;
  for (const file of ['./firstRunExperience.js', './firstRunVariants.js', './firstRunHint.js']) {
    const code = source(file);
    for (const match of code.matchAll(/emit\(\{ type: '([^']+)'/g)) {
      seen += 1;
      assert.ok(types.has(match[1]), `${file} emits an unknown type "${match[1]}"`);
    }
    for (const match of code.matchAll(/emit\(\{[^}]*?kind: '([^']+)'/g)) {
      assert.ok(kinds.has(match[1]), `${file} emits an unknown kind "${match[1]}"`);
    }
    for (const match of code.matchAll(/emit\(\{[^}]*?outcome: '([^']+)'/g)) {
      assert.ok(outcomes.has(match[1]), `${file} emits an unknown outcome "${match[1]}"`);
    }
    for (const match of code.matchAll(/(?:reason: |close\()'([^']+)'/g)) {
      assert.ok(vias.has(match[1]), `${file} closes for an unknown reason "${match[1]}"`);
    }
    // Never the text, never a place.
    assert.doesNotMatch(code, /emit\([^)]*\b(query|text|lat|lon|label)\b\s*[,}]/, `${file} leaks what was typed`);
  }
  assert.ok(seen >= 6, 'the scan must actually find the emits');
  const tiles = source('./firstRunVariants.js');
  assert.match(tiles, /const kind = `tile:\$\{choice\}`;/);
});
