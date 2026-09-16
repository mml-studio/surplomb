#!/usr/bin/env node
/**
 * qa:phone-touch — what a finger can reach, measured on a handset and on a
 * desktop in the same run.
 *
 * WHY EVERY CHECK IS A PAIR. Volet B's whole contract is "the coarse path
 * gains, the fine path does not change". A harness that only opened a phone
 * could prove the first half and would never notice the second — and the
 * second is the one that breaks forty layers at once. So this script opens two
 * pages against the same build and asserts the phone's gain AND the desktop's
 * stillness, side by side, in the same check.
 *
 * WHAT IT CANNOT MEASURE, AND WHY THE NUMBERS ARE READ INSTEAD.
 * No Cesium entity ever paints in headless Chromium (measured: a witness
 * polygon at the centre of the screen renders nothing), and `scene.pick`
 * answers nothing for the bare globe under SwiftShader. "The tap selected the
 * charging station" is therefore unprovable here at any effort. What IS
 * provable is what the app will ASK the scene for, which is why the pick seam
 * publishes `getPickDiagnostics()` — see check 2. The selection itself is
 * pinned by `src/data/pickAt.test.mjs`, and on a real device by the checklist
 * in `docs/KNOWN-ISSUES.md`.
 *
 * WHAT THIS RUN COSTS. Nothing. Both pages open with photoreal off, no layer
 * is enabled, and no geocode is issued: the geolocation check injects its own
 * fix through CDP.
 *
 * Run:  npm run build && npm run preview
 *       node scripts/qa-phone-touch.mjs --url http://localhost:4173
 */
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', process.env.QA_BASE_URL || 'http://localhost:4173');

/** Bordeaux, Place de la Bourse — the fix this harness injects. */
const FIX = { latitude: 44.8412, longitude: -0.5697, accuracy: 30 };

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
};
const skip = (name, why) => {
  results.push({ name, pass: true, skipped: true });
  console.log(`  [SKIP] ${name} — ${why}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click through the DOM: real Puppeteer input hangs on this app (measured). */
const domClick = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true }));
  el.click();
  return true;
}, selector);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

try {
  const phone = await newPhoneQaPage(browser, { photoreal: false });
  const desk = await newQaPage(browser, { photoreal: false });
  await desk.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // The share sheet and the microphone, stubbed before the app runs: a harness
  // must never open a real system sheet, and there is no microphone here.
  for (const page of [phone, desk]) {
    await page.evaluateOnNewDocument(() => {
      window.__qaShared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (payload) => { window.__qaShared.push(payload); return Promise.resolve(); },
      });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      // The clipboard is unavailable on an unfocused page; record instead.
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: (text) => { window.__qaCopied = text; return Promise.resolve(); } },
        });
      } catch { /* some builds seal it */ }
      // A toast dwells for two to four seconds, and a check that reads it after
      // a twenty-second wait reads an empty node and reports "no error" for a
      // run that failed loudly. Record every one as it appears instead.
      window.__qaToasts = [];
      document.addEventListener('DOMContentLoaded', () => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        new MutationObserver(() => {
          const text = toast.textContent.trim();
          if (text && window.__qaToasts.at(-1) !== text) window.__qaToasts.push(text);
        }).observe(toast, { childList: true, subtree: true, characterData: true });
      });
    });
  }

  const pageErrors = [];
  phone.on('pageerror', (error) => {
    const message = String(error?.message || error);
    // Cesium's own `handlePointerDown` calls `setPointerCapture` unguarded, and
    // a synthetic PointerEvent has no active pointer. A real finger always has
    // one; this is a harness artifact, not an app fault.
    if (/setPointerCapture/.test(message)) return;
    pageErrors.push(message.slice(0, 200));
  });

  // Granted before the first navigation: `_initLocateButton` decides whether to
  // offer the button at boot, and a permission handed over afterwards would be
  // measuring a different session than the one that mounted the control.
  await browser.defaultBrowserContext().overridePermissions(new URL(APP_URL).origin, ['geolocation']);
  await phone.setGeolocation(FIX);

  await Promise.all([
    phone.goto(phoneUrl(APP_URL), { waitUntil: 'domcontentloaded', timeout: 120_000 }),
    desk.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 }),
  ]);
  await Promise.all([
    phone.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 }),
    desk.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 }),
  ]);

  // ── 1. The two answers, on the two devices ───────────────────────────────
  const readMode = (page) => page.evaluate(() => ({
    input: document.documentElement.getAttribute('data-input'),
    shell: document.documentElement.getAttribute('data-shell'),
    coarse: window.__godsEyeView.getInputModeDiagnostics().input === 'coarse',
  }));
  const [phoneMode, deskMode] = await Promise.all([readMode(phone), readMode(desk)]);
  check(
    'the handset answers coarse and the desktop answers fine, from the same build',
    phoneMode.input === 'coarse' && phoneMode.shell === 'phone'
      && deskMode.input === 'fine' && deskMode.shell === null,
    { phone: phoneMode, desktop: deskMode },
  );

  // ── 2. What the next tap will ask the scene for ──────────────────────────
  // The side is asked for in DRAWING BUFFER pixels, and the lite profile's
  // `resolutionScale` leaves that buffer SMALLER than the canvas — so a correct
  // 24 CSS-pixel reach reads as 19 buffer pixels here, not 25. What has to hold
  // is the reach, which is the side converted back through the live ratio.
  const readPick = (page) => page.evaluate(() => {
    const scene = window.__godsEyeView.viewer.scene;
    const diagnostics = window.__godsEyeView.getPickDiagnostics?.() ?? null;
    if (!diagnostics) return null;
    const ratio = scene.drawingBufferWidth / scene.canvas.clientWidth;
    return { ...diagnostics, ratio: Number(ratio.toFixed(3)), reachCssPx: Number((diagnostics.sidePx / ratio).toFixed(1)) };
  });
  const [phonePick, deskPick] = await Promise.all([readPick(phone), readPick(desk)]);
  check(
    'a finger reaches 24 CSS pixels and drills; a cursor keeps Cesium’s 3 px and one pick',
    phonePick?.coarse === true && phonePick.cssPx === 24 && phonePick.drillLimit === 3
      && Math.abs(phonePick.reachCssPx - 24) <= 3 && phonePick.sidePx % 2 === 1
      && deskPick?.coarse === false && deskPick.sidePx === 3 && deskPick.drillLimit === 1,
    { phone: phonePick, desktop: deskPick },
  );

  // ── 3. The camera, for two fingers ───────────────────────────────────────
  const readCamera = (page) => page.evaluate(() => {
    const c = window.__godsEyeView.viewer.scene.screenSpaceCameraController;
    return {
      tiltCount: (c.tiltEventTypes || []).length,
      zoomCount: (c.zoomEventTypes || []).length,
      enableLook: c.enableLook,
      inertiaSpin: Number(c.inertiaSpin.toFixed(2)),
      minimumZoomDistance: c.minimumZoomDistance,
    };
  });
  const [phoneCam, deskCam] = await Promise.all([readCamera(phone), readCamera(desk)]);
  check(
    'pinch zooms without pitching on a handset, and the desktop controller is untouched',
    phoneCam.tiltCount === 0 && phoneCam.zoomCount === 1 && phoneCam.enableLook === false
      && phoneCam.inertiaSpin === 0.7 && phoneCam.minimumZoomDistance === 40
      && deskCam.tiltCount > 0 && deskCam.enableLook === true
      && deskCam.inertiaSpin === 0.9 && deskCam.minimumZoomDistance === 1,
    { phone: phoneCam, desktop: deskCam },
  );

  // ── 4. The grabbing surfaces the browser must not claim ──────────────────
  const touchActions = await phone.evaluate(() => {
    const seen = [];
    for (const selector of ['.panel-drag-handle', '[data-fiche-grip]', '[data-cmp-grip]', '[data-pulse-grip]', '.velo-pulse-hud.panel-draggable']) {
      for (const el of document.querySelectorAll(selector)) {
        seen.push({ selector, touchAction: getComputedStyle(el).touchAction });
      }
    }
    return seen;
  });
  if (!touchActions.length) {
    skip('every grab surface refuses the compositor', 'no draggable panel is mounted at boot');
  } else {
    check(
      'every grab surface on screen refuses the compositor’s claim on the gesture',
      touchActions.every((entry) => entry.touchAction === 'none'),
      { n: touchActions.length, offenders: touchActions.filter((e) => e.touchAction !== 'none') },
    );
  }

  // ── 5. The globe canvas refuses the callout and the loupe ────────────────
  // `-webkit-touch-callout` is a WebKit property; Chromium drops it at parse
  // time, so `getComputedStyle` answers '' here however correct the sheet is.
  // The declaration itself is pinned by `src/data/trackingClickGesture.test.mjs`,
  // which reads style.css. What IS measurable is the selection half, and that
  // the guard applied to the canvas at all.
  const [phoneCanvas, deskCanvas] = await Promise.all([phone, desk].map((page) => page.evaluate(() => {
    const canvas = document.querySelector('#cesiumContainer canvas');
    if (!canvas) return null;
    const style = getComputedStyle(canvas);
    return { select: style.userSelect || style.webkitUserSelect };
  })));
  check(
    'a drag on the globe cannot start a text selection, and a desktop drag still can',
    phoneCanvas?.select === 'none' && deskCanvas?.select !== 'none',
    { phone: phoneCanvas, desktop: deskCanvas, note: '-webkit-touch-callout is unreadable in Chromium' },
  );

  // The key badges only exist once a city row is open, and `.btn-key` is
  // already hidden by the dock layout on a desktop — so the honest comparison
  // is the POI row, opened on both pages, and `.poi-pill-key` inside it.
  const [phonePill, deskPill] = await Promise.all([
    domClick(phone, '.location-pill'),
    domClick(desk, '.location-pill'),
  ]);
  await wait(800);

  // ── 6. The controls that only existed behind a key ───────────────────────
  const controls = await phone.evaluate(() => {
    const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
    const field = document.getElementById('location-search');
    return {
      form: !!document.getElementById('location-search-form'),
      enterkeyhint: field?.getAttribute('enterkeyhint') ?? null,
      submitShown: shown(document.getElementById('location-search-submit')),
      poiKeys: document.querySelectorAll('.poi-pill-key').length,
      badgesShown: [...document.querySelectorAll('.poi-pill-key')].some(shown),
      trackingRelease: !!document.getElementById('tracking-release'),
      trackingReleaseHidden: document.getElementById('tracking-release')?.hidden ?? null,
      locateShown: shown(document.getElementById('locate-me')),
      voiceHelpShown: shown(document.getElementById('gev-voice-help-btn')),
    };
  });
  const deskControls = await desk.evaluate(() => {
    const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
    return {
      submitShown: shown(document.getElementById('location-search-submit')),
      poiKeys: document.querySelectorAll('.poi-pill-key').length,
      badgesShown: [...document.querySelectorAll('.poi-pill-key')].some(shown),
      voiceHelpShown: shown(document.getElementById('gev-voice-help-btn')),
    };
  });
  if (!phonePill || !deskPill || controls.poiKeys === 0 || deskControls.poiKeys === 0) {
    skip('the search submits and the key badges are gone', 'no location pill is mounted at boot');
  } else {
    check(
      'the search submits, the key badges are gone, and the desktop keeps every one of them',
      controls.form && controls.enterkeyhint === 'search' && controls.submitShown
        && controls.badgesShown === false && controls.trackingRelease
        && controls.trackingReleaseHidden === true && controls.locateShown
        && deskControls.submitShown === false && deskControls.badgesShown === true
        && deskControls.voiceHelpShown === false,
      { phone: controls, desktop: deskControls },
    );
  }

  // ── 7. ORBIT has a surface, and the indicator is a way out ───────────────
  const orbit = await phone.evaluate(() => {
    const pill = document.getElementById('orbit-toggle');
    const indicator = document.getElementById('orbit-indicator');
    return {
      pill: !!pill,
      pressed: pill?.getAttribute('aria-pressed') ?? null,
      indicatorPointerEvents: indicator ? getComputedStyle(indicator).pointerEvents : null,
    };
  });
  if (!phonePill) {
    skip('ORBIT has a surface', 'no location pill is mounted at boot');
  } else {
    check(
      'a tap on a city puts ORBITE in the row, and the indicator is reachable',
      orbit.pill === true && orbit.pressed === 'false',
      orbit,
    );
  }

  // ── 8. The audio grant is taken during the tap ───────────────────────────
  // The panel shell is built at boot; the handlers arrive with the 360 kB
  // controller. Clicking before it lands measures the harness's own impatience.
  await phone.evaluate(() => window.__godsEyeView.loadVoice?.()).catch(() => {});
  await phone.waitForFunction(() => !!window.__gevVoiceCommands, { timeout: 60_000 }).catch(() => {});
  await domClick(phone, '#gev-voice-help-btn');
  await domClick(phone, '#gev-voice-button');
  await wait(1_500);
  const voice = await phone.evaluate(() => {
    const el = document.querySelector('audio[data-gev-realtime-audio="true"]');
    return {
      helpOpen: document.getElementById('gev-voice-control')?.dataset.help === 'open',
      audioPresent: !!el,
      playsinline: el?.hasAttribute('playsinline') ?? null,
    };
  });
  check(
    'the mic tap opens the help tray and takes an inline-playable audio element',
    voice.helpOpen === true && voice.audioPresent === true && voice.playsinline === true,
    voice,
  );

  // ── 9. "Autour de moi" ───────────────────────────────────────────────────
  // Focused first, and this matters: with two pages open only one is the active
  // tab, and Chrome does not hand a position to a page it considers hidden. A
  // run without this reads as "the reader tapped and nothing happened", which
  // is indistinguishable from the bug the button exists to fix.
  await phone.bringToFront();
  await domClick(phone, '#locate-me');
  let arrived = null;
  try {
    // The ADDRESS is the assertion, not the camera: `camera.changed` is quiet
    // until `moveEnd`, so a hash that already names the fix proves both that
    // the flight landed and that `flushHash` closed the gap behind it.
    await phone.waitForFunction(
      () => /[#&]lat=44\.8/.test(location.hash),
      { timeout: 25_000, polling: 250 },
    );
    arrived = await phone.evaluate(() => ({
      hash: location.hash.slice(0, 80),
      height: Math.round(window.__godsEyeView.viewer.camera.positionCartographic.height),
    }));
  } catch { /* reported by the check */ }
  const locateReport = arrived ?? await phone.evaluate(() => ({
    toasts: window.__qaToasts?.slice(-4) ?? null,
    busy: document.getElementById('locate-me')?.getAttribute('aria-busy') ?? null,
    hidden: document.getElementById('locate-me')?.hidden ?? null,
    secure: globalThis.isSecureContext,
    geo: typeof navigator.geolocation?.getCurrentPosition,
    height: Math.round(window.__godsEyeView.viewer.camera.positionCartographic.height),
  }));
  check(
    'a tap on "Autour de moi" lands on the injected fix, and the address follows it',
    arrived !== null && /[#&]lat=44\.8/.test(arrived.hash),
    locateReport,
  );

  // ── 10. The link goes through the sheet on a phone, the clipboard on a desk ─
  await domClick(phone, '#share-btn');
  await domClick(desk, '#share-btn');
  await wait(1_000);
  const [phoneShare, deskShare] = await Promise.all([
    phone.evaluate(() => ({ shared: window.__qaShared.length, url: window.__qaShared[0]?.url ?? null })),
    desk.evaluate(() => ({ shared: window.__qaShared.length, copied: typeof window.__qaCopied === 'string' })),
  ]);
  check(
    'the handset opens the system sheet and the desktop keeps its clipboard',
    phoneShare.shared === 1 && /[#&]lat=/.test(String(phoneShare.url))
      && deskShare.shared === 0 && deskShare.copied === true,
    { phone: phoneShare, desktop: deskShare },
  );

  check('no uncaught error while touching the app', pageErrors.length === 0, pageErrors.slice(0, 5));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nqa:phone-touch ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
