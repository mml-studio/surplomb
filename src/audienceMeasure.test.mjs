import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANONYMOUS_EVENTS,
  CONSENT_EVENT,
  DETAILED_SETTINGS,
  POSTHOG_API_HOST,
  audienceTokenFromBuild,
  makeBeforeSend,
  cleanMeasuredEvent,
  cleanMeasuredUrl,
  posthogConfig,
  startAudienceMeasure,
  watchPathname,
} from './audienceMeasure.js';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

function fakePosthog() {
  const calls = { init: [], capture: [], setConfig: [], optIn: [], recording: 0 };
  return {
    calls,
    init: (token, config) => calls.init.push({ token, config }),
    capture: (event, properties) => calls.capture.push(properties ? [event, properties] : event),
    set_config: (config) => calls.setConfig.push(config),
    opt_in_capturing: (options) => calls.optIn.push(options),
    startSessionRecording: () => { calls.recording += 1; },
  };
}

/** The banner's two answers, pressed by the test instead of a visitor. */
function fakeBanner() {
  const banner = { shown: 0, handlers: null };
  banner.ask = (handlers) => { banner.shown += 1; banner.handlers = handlers; };
  return banner;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeWindow(pathname = '/') {
  const listeners = {};
  const location = { pathname };
  const win = {
    location,
    history: {
      pushState(_state, _title, url) { location.pathname = new URL(url, 'https://x.test').pathname; },
      replaceState(_state, _title, url) { location.pathname = new URL(url, 'https://x.test').pathname; },
    },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    fire: (type) => (listeners[type] || []).forEach((fn) => fn()),
  };
  return win;
}

const now = (fn) => fn();

test('no token under node --test: the build is what turns measurement on', () => {
  assert.equal(audienceTokenFromBuild(), '');
});

test('the URL PostHog receives has no camera hash and no typed address', () => {
  assert.equal(
    cleanMeasuredUrl('https://surplomb.app/globe?q=12%20rue%20de%20la%20Paix&welcome=0#v=2&lat=48.8&lon=2.3'),
    'https://surplomb.app/globe',
  );
  assert.equal(
    cleanMeasuredUrl('https://surplomb.app/fiche.html?lat=45.76&lon=4.83&embed=1'),
    'https://surplomb.app/fiche.html',
  );
});

test('campaign parameters survive, so a link posted on X can be counted', () => {
  assert.equal(
    cleanMeasuredUrl('https://surplomb.app/?utm_source=x&utm_campaign=rayonx&gclid=abc&q=Lyon'),
    'https://surplomb.app/?utm_source=x&utm_campaign=rayonx',
  );
});

test('a value that is not a URL is dropped; a direct visit and a missing one are left alone', () => {
  assert.equal(cleanMeasuredUrl('not a url'), null);
  assert.equal(cleanMeasuredUrl('$direct'), '$direct');
  assert.equal(cleanMeasuredUrl(''), '');
  assert.equal(cleanMeasuredUrl(undefined), undefined);
});

test('every URL-bearing property is cleaned, the title is dropped, the rest kept', () => {
  const event = cleanMeasuredEvent({
    event: '$pageview',
    properties: {
      $current_url: 'https://surplomb.app/globe?q=Paris#v=2',
      $referrer: 'https://surplomb.app/?q=Paris',
      $prev_pageview_url: 'https://surplomb.app/#v=1',
      $referring_domain: 'surplomb.app',
      $pathname: '/globe',
      title: '12 rue de la Paix — Radiographie',
      $browser: 'Firefox',
    },
    $set_once: { $initial_current_url: 'https://surplomb.app/?q=Paris' },
  });
  assert.deepEqual(event.properties, {
    $current_url: 'https://surplomb.app/globe',
    $referrer: 'https://surplomb.app/',
    $prev_pageview_url: 'https://surplomb.app/',
    $referring_domain: 'surplomb.app',
    $pathname: '/globe',
    $browser: 'Firefox',
  });
  assert.equal(event.$set_once.$initial_current_url, 'https://surplomb.app/');
  assert.equal(cleanMeasuredEvent(null), null);
});

test('without an answer: counted without a cookie, page views only — what /confidentialite describes', () => {
  const config = posthogConfig();
  assert.equal(config.api_host, 'https://eu.i.posthog.com');
  assert.equal(POSTHOG_API_HOST, config.api_host);
  assert.equal(config.cookieless_mode, 'on_reject');
  assert.equal(config.opt_out_capturing_by_default, true, 'opted out = cookieless until the visitor accepts');
  assert.equal(config.persistence, 'memory');
  assert.equal(config.capture_pageview, true);
  assert.equal(config.capture_pageleave, true);
  for (const off of [
    'autocapture', 'rageclick', 'capture_dead_clicks', 'capture_heatmaps', 'enable_heatmaps',
    'capture_performance', 'capture_exceptions',
  ]) assert.equal(config[off], false, `${off} stays off`);
  for (const on of [
    'disable_session_recording', 'disable_surveys', 'disable_product_tours', 'disable_conversations',
    'disable_web_experiments', 'advanced_disable_feature_flags', 'disable_external_dependency_loading',
    'disable_capture_url_hashes',
  ]) assert.equal(config[on], true, `${on} stays on`);
  assert.equal(config.session_recording.maskAllInputs, true);
  assert.equal(typeof config.before_send, 'function');
});

test('after « Accepter »: clicks, heatmaps, replay with inputs masked, a first-party id', () => {
  const config = posthogConfig({ granted: true });
  assert.equal(config.cookieless_mode, 'on_reject');
  assert.equal(config.opt_out_capturing_by_default, false);
  assert.equal(config.persistence, 'localStorage+cookie');
  for (const on of ['autocapture', 'rageclick', 'capture_dead_clicks', 'capture_heatmaps', 'enable_heatmaps']) {
    assert.equal(config[on], true, `${on} on`);
  }
  assert.equal(config.disable_session_recording, false);
  assert.equal(config.disable_capture_url_hashes, false, 'the camera is part of what the replay shows');
  assert.equal(config.session_recording.maskAllInputs, true, 'what is typed in a field stays masked');
  assert.equal(config.disable_external_dependency_loading, true, 'still nothing loaded from PostHog');
  assert.equal(config.capture_performance, false);
  for (const [key, value] of Object.entries(DETAILED_SETTINGS)) assert.equal(config[key], value, key);
});

test('before_send: without consent, page views only and cleaned; with it, untouched', () => {
  let granted = false;
  const send = makeBeforeSend(() => granted);
  assert.deepEqual([...ANONYMOUS_EVENTS], ['$pageview', '$pageleave']);
  for (const event of ['$autocapture', '$$heatmap', '$snapshot', 'search', CONSENT_EVENT, '$identify']) {
    assert.equal(send({ event, properties: {} }), null, `${event} is dropped`);
  }
  const view = send({ event: '$pageview', properties: { $current_url: 'https://surplomb.app/globe?q=Lyon#v=2', title: '12 rue X' } });
  assert.equal(view.properties.$current_url, 'https://surplomb.app/globe');
  assert.equal('title' in view.properties, false);
  granted = true;
  const click = send({ event: '$autocapture', properties: { $current_url: 'https://surplomb.app/globe?q=Lyon#v=2' } });
  assert.equal(click.properties.$current_url, 'https://surplomb.app/globe?q=Lyon#v=2');
  assert.equal(send(null), null);
});

test('the showcase handing over to the globe is a page view; a camera hash is not', () => {
  const win = fakeWindow('/');
  const seen = [];
  assert.equal(watchPathname((path) => seen.push(path), win), true);
  win.history.replaceState(null, '', '/#v=2&lat=1');
  win.history.replaceState(null, '', '/globe?q=Lyon');
  win.history.replaceState(null, '', '/globe#v=3');
  win.history.pushState(null, '', '/globe?lat=1');
  assert.deepEqual(seen, ['/globe']);
  win.location.pathname = '/';
  win.fire('popstate');
  assert.deepEqual(seen, ['/globe', '/']);
});

test('a throwing listener never breaks the history call', () => {
  const win = fakeWindow('/');
  watchPathname(() => { throw new Error('boom'); }, win);
  assert.doesNotThrow(() => win.history.replaceState(null, '', '/globe'));
  assert.equal(win.location.pathname, '/globe');
});

test('without a token nothing is downloaded', async () => {
  let loads = 0;
  const started = await startAudienceMeasure({
    token: '', refused: false, load: async () => { loads += 1; }, schedule: now, win: fakeWindow(),
  });
  assert.equal(started, false);
  assert.equal(loads, 0);
});

test('a refused browser (button or Global Privacy Control) never downloads the SDK', async () => {
  let loads = 0;
  const started = await startAudienceMeasure({
    token: 'phc_test', refused: true, load: async () => { loads += 1; }, schedule: now, win: fakeWindow(),
  });
  assert.equal(started, false);
  assert.equal(loads, 0);
});

test('with a token: init once, then a page view per path change', async () => {
  const posthog = fakePosthog();
  const win = fakeWindow('/');
  const started = await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: 'denied', load: async () => posthog, schedule: now, win,
  });
  assert.equal(started, true);
  assert.equal(posthog.calls.init.length, 1);
  assert.equal(posthog.calls.init[0].token, 'phc_test');
  assert.equal(posthog.calls.init[0].config.opt_out_capturing_by_default, true);
  win.history.replaceState(null, '', '/globe');
  assert.deepEqual(posthog.calls.capture, ['$pageview']);
  assert.deepEqual(posthog.calls.optIn, [], 'a refusal is never turned into consent');
});

test('no answer yet: the banner asks; « Refuser » is stored and changes nothing else', async () => {
  const posthog = fakePosthog();
  const banner = fakeBanner();
  const stored = [];
  let extensions = 0;
  await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: null, load: async () => posthog, schedule: now, win: fakeWindow(),
    askConsent: banner.ask, storeConsent: (choice) => stored.push(choice), loadExtensions: async () => { extensions += 1; },
  });
  assert.equal(banner.shown, 1);
  banner.handlers.onRefuse();
  await flush();
  assert.deepEqual(stored, ['denied']);
  assert.equal(extensions, 0, 'no recorder downloaded');
  assert.deepEqual(posthog.calls.optIn, []);
});

test('an earlier answer, either way: no banner', async () => {
  for (const consent of ['granted', 'denied']) {
    const banner = fakeBanner();
    await startAudienceMeasure({
      token: 'phc_test', refused: false, consent, load: async () => fakePosthog(), schedule: now, win: fakeWindow(),
      askConsent: banner.ask, loadExtensions: async () => {},
    });
    assert.equal(banner.shown, 0, consent);
  }
});

test('« Accepter » during the visit: recorder fetched, detailed switches on, recording starts, consent recorded', async () => {
  const posthog = fakePosthog();
  const banner = fakeBanner();
  const stored = [];
  let extensions = 0;
  await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: null, load: async () => posthog, schedule: now, win: fakeWindow(),
    askConsent: banner.ask, storeConsent: (choice) => stored.push(choice), loadExtensions: async () => { extensions += 1; },
  });
  banner.handlers.onAccept();
  await flush();
  assert.deepEqual(stored, ['granted']);
  assert.equal(extensions, 1);
  assert.deepEqual(posthog.calls.setConfig, [{ ...DETAILED_SETTINGS }]);
  assert.deepEqual(posthog.calls.optIn, [{ captureEventName: CONSENT_EVENT }]);
  assert.equal(posthog.calls.recording, 1);
  // From now on before_send lets everything through.
  const send = posthog.calls.init[0].config.before_send;
  assert.ok(send({ event: '$autocapture', properties: {} }));
});

test('« Accepter » before the SDK arrives: it starts detailed, with the consent event', async () => {
  const posthog = fakePosthog();
  const banner = fakeBanner();
  let run;
  const pending = startAudienceMeasure({
    token: 'phc_test', refused: false, consent: null, load: async () => posthog, schedule: (fn) => { run = fn; },
    win: fakeWindow(), askConsent: banner.ask, storeConsent: () => true, loadExtensions: async () => {},
  });
  banner.handlers.onAccept();
  run();
  assert.equal(await pending, true);
  assert.equal(posthog.calls.init[0].config.persistence, 'localStorage+cookie');
  assert.deepEqual(posthog.calls.optIn, [{ captureEventName: CONSENT_EVENT }]);
  assert.equal(posthog.calls.recording, 1);
});

test('consent given on an earlier visit: detailed from the start, no second consent event', async () => {
  const posthog = fakePosthog();
  let extensions = 0;
  await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: 'granted', load: async () => posthog, schedule: now, win: fakeWindow(),
    loadExtensions: async () => { extensions += 1; },
  });
  assert.equal(extensions, 1, 'the recorder comes with the SDK');
  assert.equal(posthog.calls.init[0].config.autocapture, true);
  assert.deepEqual(posthog.calls.optIn, [{ captureEventName: false }]);
  assert.equal(posthog.calls.recording, 1);
});

test('a blocked recorder chunk still leaves the detailed count running', async () => {
  const posthog = fakePosthog();
  const started = await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: 'granted', load: async () => posthog, schedule: now, win: fakeWindow(),
    loadExtensions: async () => { throw new Error('blocked'); },
  });
  assert.equal(started, true);
  assert.equal(posthog.calls.init.length, 1);
});

test('named actions reach PostHog once it has started', async () => {
  const { track, setTrackSink } = await import('./analyticsEvents.js');
  setTrackSink(null); // earlier tests plugged their own fake in
  const posthog = fakePosthog();
  track('search', { query: 'Lyon' });
  await startAudienceMeasure({
    token: 'phc_test', refused: false, consent: 'granted', load: async () => posthog, schedule: now, win: fakeWindow(),
    loadExtensions: async () => {},
  });
  track('fiche_lookup', { found: true });
  assert.deepEqual(posthog.calls.capture, [['search', { query: 'Lyon' }], ['fiche_lookup', { found: true }]]);
});

test('a blocked SDK chunk costs the measurement, never the page', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const started = await startAudienceMeasure({
      token: 'phc_test', refused: false, load: async () => { throw new Error('blocked'); }, schedule: now, win: fakeWindow(),
    });
    assert.equal(started, false);
  } finally {
    console.warn = warn;
  }
});

test('both pages start it only when the build carries a token', () => {
  for (const file of ['./boot.js', './fiche.js']) {
    const source = read(file);
    assert.match(source, /if \(import\.meta\.env\.POSTHOG_PROJECT_TOKEN\)/, `${file} guards on the token`);
    assert.match(source, /import\('\.\/audienceMeasure\.js'\)/, `${file} imports the module lazily`);
    assert.doesNotMatch(source, /^import .*audienceMeasure/m, `${file} keeps it out of its entry chunk`);
  }
});

test('the pinned SDK is the one this module was written against', () => {
  const pkg = JSON.parse(read('../package.json'));
  assert.match(pkg.dependencies['posthog-js'], /^\d+\.\d+\.\d+$/, 'an exact version, not a range');
});
