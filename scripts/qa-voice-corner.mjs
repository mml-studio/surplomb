#!/usr/bin/env node
/**
 * qa-voice-corner — the desktop mic in each of its states (2026-09-23).
 *
 * On a desktop the mic rests in the bottom-right corner as « Parler à
 * Surplomb » and opens into a card while it is used (src/globeShell.js,
 * src/voice/voiceControlDom.js). No microphone exists in a headless browser,
 * so the states are painted through the controller's own entry points —
 * `setStatus`, `setMicrophoneEnabled`'s flag, `setHeardText`, `setSpokenText`
 * — exactly as a live session paints them, and each one is shot and measured.
 *
 * Usage: node scripts/qa-voice-corner.mjs [--url http://localhost:4173] [--out qa-shots]
 *        [--width 1600 --height 900] [--lang en] [--phone] [--coarse]
 *
 * `--coarse` boots a touchscreen that is not a phone (a tablet): the « ? »
 * must stand beside the button at rest, and open the help tray.
 *
 * Fails (exit 1) when the panel is not in its corner after the controller's
 * rebuild, when a state's card leaves the viewport, when the card is wider
 * than the navigation bar's clearance allows (256 px), or — with `--phone` —
 * when the phone's mic left the dock.
 */
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv;
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const url = arg('--url', 'http://localhost:4173').replace(/\/$/, '');
const outDir = arg('--out', 'qa-shots');
const width = Number(arg('--width', 1600));
const height = Number(arg('--height', 900));
const lang = arg('--lang', null);
const coarse = argv.includes('--coarse');
const tag = `${width}x${height}${lang ? `-${lang}` : ''}${coarse ? '-coarse' : ''}`;
const CARD_MAX_WIDTH = 256;
mkdirSync(outDir, { recursive: true });

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', `--window-size=${width},${height}`,
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

try {
  if (argv.includes('--phone')) {
    const phone = await newPhoneQaPage(browser);
    await phone.goto(phoneUrl(`${url}/globe?welcome=0&photoreal=0`), { waitUntil: 'domcontentloaded' });
    // A phone never preloads the voice (lazyVoice.js): the boot panel is all there is.
    await phone.waitForFunction(() => !!window.__godsEyeView?.viewer && !!document.getElementById('gev-voice-control'), { timeout: 120_000 });
    await pause(4_000);
    const where = await phone.evaluate(() => ({
      parent: document.getElementById('gev-voice-control')?.parentElement?.id || null,
      cornerHidden: document.getElementById('voice-corner')?.hidden,
    }));
    check(where.parent === 'command-dock', `phone: the mic stays in the dock (parent: ${where.parent})`);
    check(where.cornerHidden === true, 'phone: the desktop corner stays hidden');
    // Reaching for the mic loads the voice, whose controller rebuilds the
    // panel. The rebuild used to pull #location-bar back into the dock, out
    // of the sheet's search tab; it now only replaces the panel.
    const barBefore = await phone.evaluate(() => document.getElementById('location-bar')?.parentElement?.id || null);
    await phone.evaluate(() => document.getElementById('gev-voice-control')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await phone.waitForFunction(() => !!window.__gevVoiceCommands, { timeout: 120_000 });
    await pause(1_000);
    const after = await phone.evaluate(() => ({
      bar: document.getElementById('location-bar')?.parentElement?.id || null,
      mic: document.getElementById('gev-voice-control')?.parentElement?.id || null,
    }));
    check(after.mic === 'command-dock', `phone: the rebuilt mic is in the dock (${after.mic})`);
    check(after.bar === barBefore, `phone: #location-bar stays where the sheet put it (${barBefore} → ${after.bar})`);
    const file = path.join(outDir, 'voice-corner-phone.png');
    await phone.screenshot({ path: file });
    console.log(`saved ${file}`);
  } else {
    // The QA fleet pins the locale before any page script (qa-first-run.mjs).
    const page = await newQaPage(browser, lang ? { locale: lang } : {});
    await page.setViewport({ width, height });
    page.on('pageerror', (error) => console.log('pageerror', error.message));
    // `?input=coarse` is how a desktop run asks for the tablet case (src/inputMode.js).
    await page.goto(`${url}/globe?welcome=0&photoreal=0${coarse ? '&input=coarse' : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
    // The controller rebuilds the panel when it loads: wait for it, then
    // check the rebuild stayed in the corner.
    await page.waitForFunction(() => !!window.__gevVoiceCommands, { timeout: 120_000 });
    await pause(10_000);
    await page.evaluate(() => {
      const viewer = window.__godsEyeView.viewer;
      viewer.camera.cancelFlight();
      const dest = viewer.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: 2.37 * Math.PI / 180, latitude: 48.815 * Math.PI / 180, height: 1400,
      });
      viewer.camera.setView({ destination: dest, orientation: { heading: 0.35, pitch: -0.55, roll: 0 } });
    });
    await page.evaluate(() => new Promise((resolve) => {
      const viewer = window.__godsEyeView.viewer;
      let ticks = 0;
      const tick = () => { viewer.scene.requestRender?.(); if (++ticks < 240) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    }));

    const where = await page.evaluate(() => ({
      parent: document.getElementById('gev-voice-control')?.parentElement?.id || null,
      panels: document.querySelectorAll('#gev-voice-control').length,
      shell: document.documentElement.classList.contains('globe-shell'),
    }));
    check(where.shell, 'desktop shell is on');
    check(where.parent === 'voice-corner', `the rebuilt panel is in its corner (parent: ${where.parent})`);
    check(where.panels === 1, `one panel on the page (${where.panels})`);

    const measure = () => page.evaluate(() => {
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) return null;
        return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      const root = document.getElementById('gev-voice-control');
      return {
        status: root?.dataset.status,
        phase: root?.querySelector('.gev-voice-phase')?.textContent || '',
        caption: root?.querySelector('.gev-mic-caption')?.textContent || '',
        root: box(root),
        button: box(document.getElementById('gev-voice-button')),
        stop: box(root?.querySelector('.gev-voice-stop')),
        transcript: box(root?.querySelector('.gev-voice-transcript')),
        help: box(root?.querySelector('.gev-voice-help-tray')),
        error: box(root?.querySelector('.gev-voice-error-tray')),
        bars: box(root?.querySelector('.gev-voice-visualizer')),
        detail: box(document.getElementById('gev-voice-detail')),
        rail: box(document.getElementById('right-context-rail')),
        nav: box(document.querySelector('#globe-nav .globe-nav-row')),
        credits: box(document.querySelector('#cesium-credits .cesium-credit-logoContainer')),
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    const shoot = async (name) => {
      const full = path.join(outDir, `voice-corner-${tag}-${name}.png`);
      await page.screenshot({ path: full });
      const clip = { x: Math.max(0, width - 480), y: Math.max(0, height - 380), width: Math.min(480, width), height: Math.min(380, height) };
      const crop = path.join(outDir, `voice-corner-${tag}-${name}-crop.png`);
      await page.screenshot({ path: crop, clip });
      console.log(`saved ${full}`);
    };
    const inViewport = (rect, viewport) => !rect
      || (rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height);
    const paint = (fn) => page.evaluate(fn);
    // The navigation bar (#350) shares the bottom line: nothing of the mic may touch it.
    const clearOfNav = (m, label) => {
      if (!m.nav) return;
      const hits = [m.root, m.transcript, m.help, m.error].filter(Boolean)
        .filter((r) => r.left < m.nav.right && r.right > m.nav.left && r.top < m.nav.bottom && r.bottom > m.nav.top);
      check(hits.length === 0, `${label}: clear of the navigation bar (bar ${m.nav.left}–${m.nav.right}, mic from ${m.root?.left})`);
    };

    // 1. At rest.
    await page.mouse.move(Math.round(width * 0.5), Math.round(height * 0.4));
    await pause(500);
    let m = await measure();
    console.log('idle', JSON.stringify(m));
    check(m.status === 'idle', 'idle: status idle');
    check(Boolean(m.caption) && m.button?.height === 48, `idle: one 48 px button « ${m.caption} » (${m.button?.width}×${m.button?.height})`);
    check(m.stop === null && m.bars === null && m.detail === null, 'idle: no stop, no meter, no caption line');
    check(m.root && m.root.right <= width - 20 && m.root.bottom <= height - 10, `idle: in the bottom-right corner (${JSON.stringify(m.root)})`);
    check(!m.nav || Math.abs(m.nav.bottom - m.root.bottom) <= 2 || width < 980, `idle: on the navigation bar's line (${m.nav?.bottom} / ${m.root?.bottom})`);
    clearOfNav(m, 'idle');
    await shoot('idle');

    // 2. Hovered: the help tray. A touchscreen gets it from its « ? ».
    if (coarse) {
      const help = await page.evaluate(() => {
        const button = document.getElementById('gev-voice-help-btn');
        const rect = button?.getBoundingClientRect();
        button?.click();
        return rect ? { width: Math.round(rect.width), left: Math.round(rect.left) } : null;
      });
      await pause(500);
      m = await measure();
      check(Boolean(help?.width) && help.left < m.button.left, `coarse: « ? » beside the button at rest (${JSON.stringify(help)})`);
      check(Boolean(m.help) && inViewport(m.help, m.viewport), 'coarse: the « ? » opens the help tray');
      await shoot('help');
      await page.evaluate(() => document.getElementById('gev-voice-help-btn')?.click());
    } else {
      await page.mouse.move(m.button.left + m.button.width / 2, m.button.top + m.button.height / 2);
      await pause(500);
      m = await measure();
      check(Boolean(m.help) && inViewport(m.help, m.viewport), `hover: help tray shown, in the viewport (${JSON.stringify(m.help)})`);
      await shoot('hover');
      await page.mouse.move(Math.round(width * 0.5), Math.round(height * 0.4));
    }

    // 3. Listening, with what was heard so far.
    await paint(() => {
      const c = window.__gevVoiceCommands;
      c.microphoneLive = true;
      c.setStatus('listening');
      c.setVoiceSpeaker('user');
      c.setHeardText('Montre-moi les bus autour de la gare Saint-Jean', { interim: true });
      const levels = [8, 14, 22, 30, 26, 18, 24, 32, 20, 12, 16, 10, 6, 5, 5];
      document.querySelectorAll('#gev-voice-control .gev-voice-visualizer span').forEach((bar, index) => {
        bar.style.setProperty('--audio-level', `${levels[index]}px`);
        bar.style.setProperty('--audio-opacity', '0.95');
      });
    });
    await pause(400);
    m = await measure();
    console.log('listening', JSON.stringify(m));
    check(m.status === 'listening' && Boolean(m.phase), `listening: « ${m.phase} »`);
    check(Boolean(m.bars) && m.detail === null, 'listening: the level, not the caption');
    check(Boolean(m.stop), 'listening: « Arrêter » is there');
    check(m.root.width <= CARD_MAX_WIDTH, `listening: card ${m.root.width} px wide (≤ ${CARD_MAX_WIDTH})`);
    clearOfNav(m, 'listening');
    check(inViewport(m.transcript, m.viewport) && inViewport(m.root, m.viewport), 'listening: card and transcript in the viewport');
    await shoot('listening');

    // 4. Answering: Surplomb speaks.
    await paint(() => {
      const c = window.__gevVoiceCommands;
      c.microphoneLive = false;
      c.responseActive = true;
      c.setHeardText('Montre-moi les bus autour de la gare Saint-Jean');
      c.setStatus('listening');
      c.setVoiceSpeaker('ai');
      c.setSpokenText('Voici les bus de Bordeaux autour de la gare Saint-Jean, en direct. Il y en a une douzaine en ce moment.');
    });
    await pause(400);
    m = await measure();
    console.log('answering', JSON.stringify(m));
    check(m.status === 'answering', `answering: « ${m.phase} »`);
    check(inViewport(m.transcript, m.viewport), `answering: transcript in the viewport (${JSON.stringify(m.transcript)})`);
    await shoot('answering');

    // 5. Ready: the session waits for the next request.
    await paint(() => {
      const c = window.__gevVoiceCommands;
      c.responseActive = false;
      c.setStatus('listening');
      c.setVoiceSpeaker('idle');
    });
    await pause(400);
    m = await measure();
    console.log('ready', JSON.stringify(m));
    check(m.status === 'ready' && Boolean(m.detail), `ready: « ${m.phase} » with its caption`);
    await shoot('ready');

    // 5b. A hosted trial draws no « Arrêter »: closing it would lose the rest.
    await paint(() => {
      const c = window.__gevVoiceCommands;
      c.beginTrialSession(2);
      c.setStatus('listening');
    });
    await pause(300);
    m = await measure();
    check(m.status === 'ready' && m.stop === null, `trial: no « Arrêter » (${m.status})`);
    await shoot('trial');

    // 6. « Arrêter »: back to the button, transcript gone.
    await paint(() => {
      window.__gevVoiceCommands.clearTrialSession();
      document.querySelector('#gev-voice-control .gev-voice-stop').click();
    });
    await pause(400);
    m = await measure();
    check(m.status === 'idle' && m.transcript === null && m.button?.height === 48, `stop: back to the button at rest (${m.status})`);

    // 7. A failure.
    await paint(() => {
      const c = window.__gevVoiceCommands;
      c.nextErrorHint = null;
      c.setStatus('error', 'L’autorisation du micro a été refusée.');
    });
    await pause(400);
    m = await measure();
    console.log('error', JSON.stringify(m));
    check(m.status === 'error' && Boolean(m.error) && m.stop === null, `error: « ${m.phase} », tray shown, nothing to stop`);
    check(inViewport(m.error, m.viewport), 'error: tray in the viewport');
    await shoot('error');
    await paint(() => document.querySelector('#gev-voice-control .gev-voice-error-dismiss').click());
    await pause(300);
    m = await measure();
    check(m.error === null, 'error: the × closes the tray');
    await paint(() => window.__gevVoiceCommands.setStatus('idle'));

    // 8. The clean view hides the corner.
    const clean = await page.evaluate(async () => {
      document.getElementById('clean-view-toggle')?.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const visible = getComputedStyle(document.getElementById('voice-corner')).visibility;
      document.getElementById('clean-view-exit')?.click();
      return visible;
    });
    check(clean === 'hidden', `clean view hides the corner (${clean})`);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall checks passed');
