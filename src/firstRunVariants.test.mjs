import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIRST_RUN_ADDRESS_BUNDLE,
  FIRST_RUN_ARRIVAL_DEADLINE_MS,
  FIRST_RUN_VARIANTS,
  mountVariantA,
  mountVariantB,
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
  // Raced, so a lost early landing fails here instead of hanging the suite.
  const landed = await Promise.race([
    outcome.arrival,
    new Promise((resolve) => setTimeout(() => resolve('never landed'), 1000)),
  ]);
  assert.deepEqual(landed, { why: 'arrived', failedLayerIds: [] });
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

// ── The two card bodies, against a stub card ────────────────────────────────

/** An element double: listeners, dataset, and the few properties A and B touch. */
function stubElement({ dataset = {}, hidden = false, small = null } = {}) {
  const listeners = new Map();
  return {
    dataset,
    hidden,
    value: '',
    readOnly: false,
    focused: 0,
    selected: 0,
    small,
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) || []).filter((h) => h !== handler)); },
    listenerCount() { return [...listeners.values()].reduce((sum, list) => sum + list.length, 0); },
    fire(type, event = {}) {
      const payload = { preventDefault() {}, stopPropagation() { payload.stopped = true; }, currentTarget: this, ...event };
      for (const handler of listeners.get(type) || []) handler(payload);
      return payload;
    },
    focus() { this.focused += 1; },
    select() { this.selected += 1; },
    querySelector(selector) { return selector === 'small' ? this.small : null; },
  };
}

function cardA() {
  const form = stubElement();
  const field = stubElement({ dataset: { firstRunAddress: '' } });
  const locate = stubElement({ dataset: { firstRunChip: 'locate' }, hidden: true });
  const eiffel = stubElement({ dataset: { firstRunChip: 'Tour Eiffel, Paris' } });
  const marseille = stubElement({ dataset: { firstRunChip: 'Vieux-Port, Marseille' } });
  const lookAround = stubElement();
  const root = {
    querySelector: (selector) => ({
      '[data-first-run-form]': form,
      '[data-first-run-address]': field,
      '[data-first-run-chip="locate"]': locate,
      '[data-first-run-look-around]': lookAround,
    })[selector] || null,
    querySelectorAll: (selector) => (selector === '[data-first-run-chip]' ? [locate, eiffel, marseille] : []),
  };
  return { root, form, field, locate, eiffel, marseille, lookAround };
}

function cardB() {
  const choices = ['sales', 'permits', 'live', 'explore'].map((choice) => stubElement({
    dataset: { firstRunChoice: choice },
    small: { textContent: `subcopy ${choice}` },
  }));
  const root = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-first-run-choice]' ? choices : []),
  };
  return { root, choices, byChoice: Object.fromEntries(choices.map((node) => [node.dataset.firstRunChoice, node])) };
}

/** The ctx the core hands a body, recording everything a body does to it. */
function stubCtx(root, { phoneShell = false, flight = { status: 'flying', label: 'Marseille' }, layerAnswer = () => true } = {}) {
  const calls = { events: [], dismissed: [], busy: [], status: [], layers: [], searches: [], locates: [] };
  let busy = false;
  let closed = false;
  let arrival = null;
  const ctx = {
    root,
    phoneShell,
    styleManager: {
      flyToAddress: async (query, { onArrival }) => { calls.searches.push(query); arrival = onArrival; return flight; },
      locateMe: async ({ onArrival, notify }) => { calls.locates.push({ notify }); arrival = onArrival; return flight; },
    },
    emit: (event) => calls.events.push(event),
    setBusy: (next, text) => { busy = next; calls.busy.push([next, text]); },
    setStatus: (text) => calls.status.push(text),
    dismiss: (options) => { closed = true; calls.dismissed.push(options); },
    isBusy: () => busy || closed,
    isClosed: () => closed,
    setLayerEnabled: async (layerId) => { calls.layers.push(layerId); return layerAnswer(layerId); },
  };
  return { ctx, calls, arrive: (why) => arrival?.(why) };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('A: Enter searches, closes the card as the flight starts, and reports no text', async () => {
  const card = cardA();
  const { ctx, calls } = stubCtx(card.root);
  const mounted = mountVariantA(ctx);
  assert.equal(mounted.focusTarget, card.field, 'a desktop gets the caret in the field');
  card.field.value = '  12 rue de la Paix, Paris  ';
  card.form.fire('submit');
  await tick();
  assert.deepEqual(calls.searches, ['12 rue de la Paix, Paris']);
  assert.deepEqual(calls.busy[0], [true, 'Recherche de « 12 rue de la Paix, Paris »…']);
  assert.deepEqual(calls.dismissed, [{ reason: 'choice' }]);
  assert.deepEqual(calls.events, [{
    type: 'action', kind: 'address', outcome: 'found', queryLength: 24, layerIds: ['dvf-sales', 'ads-fr', 'dpe-fr'],
  }]);
  assert.equal(typeof calls.events[0].queryLength, 'number');
  assert.ok(!JSON.stringify(calls.events).includes('Paix'), 'the typed text never leaves the card');
  // Nothing switched on until the camera lands.
  assert.deepEqual(calls.layers, []);
  mounted.teardown();
  assert.equal(card.form.listenerCount() + card.field.listenerCount() + card.lookAround.listenerCount(), 0);
});

test('A: the bundle follows the landing, even after the card is gone', async () => {
  const card = cardA();
  const { ctx, calls, arrive } = stubCtx(card.root);
  const mounted = mountVariantA(ctx);
  card.field.value = 'Vieux-Port, Marseille';
  card.form.fire('submit');
  await tick();
  mounted.teardown();
  arrive('arrived');
  await tick();
  assert.deepEqual(calls.layers, ['dvf-sales', 'ads-fr', 'dpe-fr']);
});

test('A: an unknown place keeps the card open, says so, and selects the text', async () => {
  const card = cardA();
  const { ctx, calls } = stubCtx(card.root, { flight: { status: 'not-found' } });
  mountVariantA(ctx);
  card.field.value = 'zzqxv';
  card.form.fire('submit');
  await tick();
  assert.deepEqual(calls.dismissed, [], 'not found is not a close');
  assert.deepEqual(calls.status, ['Introuvable. Essayez une commune ou une adresse plus précise.']);
  assert.deepEqual(calls.busy.at(-1), [false, undefined]);
  assert.equal(card.field.focused, 1);
  assert.equal(card.field.selected, 1);
  assert.deepEqual(calls.events, [{ type: 'action', kind: 'address', outcome: 'not-found', queryLength: 5 }]);
  assert.deepEqual(calls.layers, []);
});

test('A: a failed lookup and a refused one read differently', async () => {
  for (const [flight, status, outcome] of [
    [{ status: 'failed' }, ['La recherche a échoué. Réessayez, ou regardez autour d’ici.'], 'not-found'],
    [{ status: 'refused' }, [], 'cancelled'],
    [{ status: 'superseded' }, [], 'cancelled'],
  ]) {
    const card = cardA();
    const { ctx, calls } = stubCtx(card.root, { flight });
    mountVariantA(ctx);
    card.field.value = 'Lyon';
    card.form.fire('submit');
    await tick();
    assert.deepEqual(calls.status, status, flight.status);
    assert.equal(calls.events[0].outcome, outcome, flight.status);
    assert.deepEqual(calls.dismissed, [], flight.status);
  }
});

test('A: a chip fills the field and searches; an empty field searches nothing', async () => {
  const card = cardA();
  const { ctx, calls } = stubCtx(card.root);
  mountVariantA(ctx);
  card.form.fire('submit');
  await tick();
  assert.deepEqual(calls.searches, [], 'nothing typed, nothing asked');
  assert.equal(card.field.focused, 1);
  card.marseille.fire('click');
  await tick();
  assert.equal(card.field.value, 'Vieux-Port, Marseille');
  assert.deepEqual(calls.searches, ['Vieux-Port, Marseille']);
  assert.equal(calls.events[0].kind, 'chip');
  // A second click while the first is running is ignored.
  card.eiffel.fire('click');
  await tick();
  assert.deepEqual(calls.searches, ['Vieux-Port, Marseille']);
});

test('A: "Autour de moi" writes a refusal into the card, not a toast', async () => {
  const card = cardA();
  // Node has no geolocation: the chip stays hidden, and it still works when clicked.
  assert.equal(card.locate.hidden, true);
  const { ctx, calls } = stubCtx(card.root, { flight: { status: 'failed', message: 'Position refusée.' } });
  mountVariantA(ctx);
  assert.equal(card.locate.hidden, true);
  card.locate.fire('click');
  await tick();
  assert.deepEqual(calls.locates, [{ notify: false }]);
  assert.deepEqual(calls.busy[0], [true, 'Position en cours…']);
  assert.deepEqual(calls.status, ['Position refusée.']);
  assert.deepEqual(calls.events, [{ type: 'action', kind: 'geoloc', outcome: 'not-found' }]);
});

test('A: looking around closes the card and touches nothing', async () => {
  const card = cardA();
  const { ctx, calls } = stubCtx(card.root);
  mountVariantA(ctx);
  card.lookAround.fire('click');
  await tick();
  assert.deepEqual(calls.events, [{ type: 'action', kind: 'explore', outcome: 'found' }]);
  assert.deepEqual(calls.dismissed, [{ reason: 'choice' }]);
  assert.deepEqual(calls.layers, []);
  assert.deepEqual(calls.searches, []);
});

test('A: typed keys stop at the field, Escape and Tab do not', () => {
  const card = cardA();
  const { ctx } = stubCtx(card.root, { phoneShell: true });
  const mounted = mountVariantA(ctx);
  assert.equal(mounted.focusTarget, null, 'no caret, so no keyboard, on a phone');
  assert.equal(card.field.fire('keydown', { key: 'n' }).stopped, true);
  assert.equal(card.field.fire('keydown', { key: 'Escape' }).stopped, undefined);
  assert.equal(card.field.fire('keydown', { key: 'Tab' }).stopped, undefined);
});

test('B: a tile switches its layers on, closes the card, and names them', async () => {
  const card = cardB();
  const { ctx, calls } = stubCtx(card.root);
  const mounted = mountVariantB(ctx);
  assert.equal(mounted.focusTarget, card.byChoice.sales);
  assert.equal(card.byChoice.sales.small.textContent, 'subcopy sales', 'a desktop keeps the parcel promise');
  card.byChoice.permits.fire('click');
  await tick();
  assert.deepEqual(calls.layers, ['ads-fr', 'sitadel-fr']);
  assert.deepEqual(calls.busy[0], [true, 'Allumage : ce qui se construit…']);
  assert.deepEqual(calls.events, [{ type: 'action', kind: 'tile:permits', outcome: 'found', layerIds: ['ads-fr', 'sitadel-fr'] }]);
  assert.deepEqual(calls.dismissed, [{ reason: 'choice' }]);
  assert.deepEqual(calls.searches, []);
  mounted.teardown();
  assert.equal(card.choices.reduce((sum, node) => sum + node.listenerCount(), 0), 0);
});

test('B: a refused layer keeps the card open and says which', async () => {
  const card = cardB();
  const { ctx, calls } = stubCtx(card.root, { layerAnswer: (id) => id !== 'flights' });
  mountVariantB(ctx);
  card.byChoice.live.fire('click');
  await tick();
  assert.deepEqual(calls.dismissed, []);
  assert.deepEqual(calls.status, ['Impossible d’allumer flights. Réessayez, ou regardez par vous-même.']);
  assert.equal(calls.events[0].outcome, 'cancelled');
  assert.deepEqual(calls.busy.at(-1), [false, undefined]);
});

test('B: on a phone the sales tile drops the parcel and says so', async () => {
  const card = cardB();
  const { ctx, calls } = stubCtx(card.root, { phoneShell: true });
  mountVariantB(ctx);
  assert.equal(card.byChoice.sales.small.textContent, 'Ventes DVF, 5 ans');
  assert.equal(card.byChoice.permits.small.textContent, 'subcopy permits');
  card.byChoice.sales.fire('click');
  await tick();
  assert.deepEqual(calls.layers, ['dvf-sales']);
  const explore = cardB();
  const second = stubCtx(explore.root);
  mountVariantB(second.ctx);
  explore.byChoice.explore.fire('click');
  await tick();
  assert.deepEqual(second.calls.layers, []);
  assert.deepEqual(second.calls.events, [{ type: 'action', kind: 'tile:explore', outcome: 'found', layerIds: [] }]);
});
