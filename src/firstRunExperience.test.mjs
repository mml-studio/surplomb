import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  EXCLUSIVE_SURFACE_CLASSES,
  FIRST_RUN_SESSION_KEY,
  FIRST_RUN_STORAGE_KEY,
  FIRST_RUN_VARIANT_IDS,
  exclusiveSurfaceActive,
  forcedFirstRunVariant,
  rememberFirstRunSessionDismissed,
  setFirstRunSuppressed,
  shouldShowFirstRun,
} from './firstRunExperience.js';
import { variantLayerIds } from './firstRunVariants.js';

const FIRST_RUN_MODULES = ['./firstRunExperience.js', './firstRunVariants.js', './firstRunHint.js'];

function memoryStorage(key, value = null) {
  const values = new Map(value == null ? [] : [[key, value]]);
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, next) => values.set(name, next),
    removeItem: (name) => values.delete(name),
    read: () => values.get(key) ?? null,
  };
}

const fresh = () => ({
  storage: memoryStorage(FIRST_RUN_STORAGE_KEY),
  sessionStorageRef: memoryStorage(FIRST_RUN_SESSION_KEY),
  location: { search: '' },
});

// ── Show policy ──────────────────────────────────────────────────────────────

test('a fresh browser receives it once', () => {
  assert.equal(shouldShowFirstRun(fresh()), true);
  // Once per browser (2026-09-17): a close in an earlier session wrote the
  // durable key, so a new session with an empty sessionStorage stays quiet.
  const returning = {
    storage: memoryStorage(FIRST_RUN_STORAGE_KEY, 'suppressed'),
    sessionStorageRef: memoryStorage(FIRST_RUN_SESSION_KEY),
    location: { search: '' },
  };
  assert.equal(shouldShowFirstRun(returning), false);
});

test('any close writes BOTH keys; a refused durable write still leaves the session key', () => {
  const session = memoryStorage(FIRST_RUN_SESSION_KEY);
  const storage = memoryStorage(FIRST_RUN_STORAGE_KEY);
  rememberFirstRunSessionDismissed(session);
  assert.equal(setFirstRunSuppressed(true, storage), true);
  assert.equal(session.read(), 'dismissed');
  assert.equal(storage.read(), 'suppressed');
  // Gone for this session, and for the next one.
  assert.equal(shouldShowFirstRun({ storage, sessionStorageRef: session, location: { search: '' } }), false);
  assert.equal(shouldShowFirstRun({
    storage,
    sessionStorageRef: memoryStorage(FIRST_RUN_SESSION_KEY),
    location: { search: '' },
  }), false);

  // A browser that refuses localStorage: the durable write fails, and the
  // session key is what keeps the card from coming back on the next reload.
  const refusing = {
    getItem: () => null,
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const tab = memoryStorage(FIRST_RUN_SESSION_KEY);
  rememberFirstRunSessionDismissed(tab);
  assert.equal(setFirstRunSuppressed(true, refusing), false);
  assert.equal(shouldShowFirstRun({ storage: refusing, sessionStorageRef: tab, location: { search: '' } }), false);

  // Every close path in the module writes both, through one helper.
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  assert.match(
    module,
    /const rememberClosed = \(\) => \{\s*rememberFirstRunSessionDismissed\(sessionStorageRef\);\s*setFirstRunSuppressed\(true, storage\);\s*\};/,
  );
  const dismiss = module.slice(module.indexOf('const dismiss = ({'), module.indexOf('const setBusy = ('));
  assert.match(dismiss, /rememberClosed\(\);/, 'a card close must write both keys');
  assert.match(module, /onClose: rememberClosed,/, 'a bubble close must write both keys');
});

test('a storage reset shows it again — an accepted, documented cost', () => {
  const storage = memoryStorage(FIRST_RUN_STORAGE_KEY);
  setFirstRunSuppressed(true, storage);
  assert.equal(shouldShowFirstRun({
    storage,
    sessionStorageRef: memoryStorage(FIRST_RUN_SESSION_KEY),
    location: { search: '' },
  }), false);
  // Clearing it (support, tests) brings it back.
  assert.equal(setFirstRunSuppressed(false, storage), true);
  assert.equal(storage.read(), null);
  // A cleared/hard-reset profile is a new browser as far as the card knows.
  setFirstRunSuppressed(true, storage);
  assert.equal(shouldShowFirstRun({
    storage: memoryStorage(FIRST_RUN_STORAGE_KEY),
    sessionStorageRef: memoryStorage(FIRST_RUN_SESSION_KEY),
    location: { search: '' },
  }), true);
});

test('welcome params work in both directions and outrank both suppressions', () => {
  const suppressed = memoryStorage(FIRST_RUN_STORAGE_KEY, 'suppressed');
  const dismissed = memoryStorage(FIRST_RUN_SESSION_KEY, 'dismissed');
  // ?welcome=1 replays past the checkbox AND past a session dismissal.
  assert.equal(shouldShowFirstRun({
    storage: suppressed, sessionStorageRef: dismissed, location: { search: '?welcome=1' },
  }), true);
  // ?welcome=0 suppresses a session that would otherwise see it.
  assert.equal(shouldShowFirstRun({ ...fresh(), location: { search: '?welcome=0' } }), false);
  // A share link outranks everything, including the replay hatch.
  assert.equal(shouldShowFirstRun({
    hasShareState: true, ...fresh(), location: { search: '?welcome=1' },
  }), false);
  // Naming a variant is a replay too, whatever the case.
  for (const search of ['?welcome=B', '?welcome=b', '?welcome=C', '?welcome=a']) {
    assert.equal(shouldShowFirstRun({
      storage: suppressed, sessionStorageRef: dismissed, location: { search },
    }), true, search);
    assert.equal(shouldShowFirstRun({
      hasShareState: true, ...fresh(), location: { search },
    }), false, `a share link outranks ${search}`);
  }
  assert.equal(shouldShowFirstRun({
    storage: suppressed, sessionStorageRef: dismissed, location: { search: '?welcome=D' },
  }), false, 'an unknown variant replays nothing');
});

test('?welcome= forces a variant, and only a known one', () => {
  assert.deepEqual([...FIRST_RUN_VARIANT_IDS], ['A', 'B', 'C']);
  assert.equal(forcedFirstRunVariant({ search: '?welcome=b' }), 'B');
  assert.equal(forcedFirstRunVariant({ search: '?welcome=C' }), 'C');
  assert.equal(forcedFirstRunVariant({ search: '?x=1&welcome=a' }), 'A');
  for (const search of ['', '?welcome=1', '?welcome=0', '?welcome=D', '?welcome=AB', '?other=B']) {
    assert.equal(forcedFirstRunVariant({ search }), null, search);
  }
  assert.equal(forcedFirstRunVariant(null), null);
  // The forced variant outranks the assigned one, and an unknown assignment
  // falls back to A rather than to nothing.
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  assert.match(module, /const chosen = forcedFirstRunVariant\(location\)\s*\?\? \(FIRST_RUN_VARIANT_IDS\.includes\(assigned\) \? assigned : 'A'\);/);
});

test('a share link never sees the launcher — its author already chose the view', () => {
  assert.equal(shouldShowFirstRun({ hasShareState: true, ...fresh() }), false);
});

test('privacy-restricted storage fails open and every write stays best-effort', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(shouldShowFirstRun({ storage: blocked, sessionStorageRef: blocked }), true);
  assert.doesNotThrow(() => setFirstRunSuppressed(true, blocked));
  assert.doesNotThrow(() => rememberFirstRunSessionDismissed(blocked));
});

test('a THROWING storage getter still fails open — Safari private mode', () => {
  // The harder case, and the one a default parameter cannot survive: it is not
  // getItem that throws, it is reading `globalThis.localStorage` AT ALL. A
  // default like `storage = globalThis.localStorage` evaluates that getter
  // before the function body starts, so the SecurityError escapes every
  // try/catch in the module and the launcher silently never appears.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const hostile = {
    configurable: true,
    get() { throw new Error('SecurityError: The operation is insecure.'); },
  };
  Object.defineProperty(globalThis, 'localStorage', hostile);
  Object.defineProperty(globalThis, 'sessionStorage', hostile);
  try {
    // No storage arguments at all: this is exactly how the app calls it.
    assert.doesNotThrow(
      () => shouldShowFirstRun({ location: { search: '' } }),
      'a hostile storage getter must not escape shouldShowFirstRun',
    );
    assert.equal(
      shouldShowFirstRun({ location: { search: '' } }),
      true,
      'a visitor whose storage throws must still SEE the launcher',
    );
    assert.doesNotThrow(() => setFirstRunSuppressed(true));
    assert.doesNotThrow(() => setFirstRunSuppressed(false));
    assert.doesNotThrow(() => rememberFirstRunSessionDismissed());
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
    if (savedSession) Object.defineProperty(globalThis, 'sessionStorage', savedSession);
    else delete globalThis.sessionStorage;
  }
});

test('no storage is touched from a default parameter position', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  // Comments stripped first: the block explaining this very defect quotes the
  // bad pattern, and matching prose instead of code would make the pin a liar.
  const code = module.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /=\s*globalThis\.(local|session)Storage/,
    'storage must be resolved lazily inside a try, never as a default parameter',
  );
  // The only reads of the global areas live inside the guarded resolver.
  const globalReads = [...code.matchAll(/globalThis\.(local|session)Storage/g)];
  assert.equal(globalReads.length, 2, 'exactly two global storage reads, both in resolveStore');
  const resolver = code.slice(code.indexOf('function resolveStore'), code.indexOf('function readStored'));
  assert.equal(
    [...resolver.matchAll(/globalThis\.(local|session)Storage/g)].length,
    2,
    'both global storage reads must be inside resolveStore, inside its try',
  );
  assert.match(resolver, /try \{[\s\S]*globalThis\.sessionStorage[\s\S]*\} catch/);
  assert.match(code, /function readStored\(kind, injected, key\)/);
  assert.match(code, /function writeStored\(kind, injected, key, value\)/);
});

// ── ESC arbitration: one surface, one key, never an invisible handler ────────

test('the JS and CSS lists of screen-claiming surfaces stay in step', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  assert.deepEqual(
    [...EXCLUSIVE_SURFACE_CLASSES].sort(),
    ['cockpit-mode', 'recording-mode', 'scene-playback-mode', 'ui-clean-view'],
  );
  // A surface that hides the card in CSS but is missing from the JS list would
  // leave an invisible launcher holding the ESC handler — blocker 2 exactly.
  const hideRule = css.slice(
    css.indexOf('body.ui-clean-view #first-run-launcher'),
    css.indexOf('display: none', css.indexOf('body.ui-clean-view #first-run-launcher')),
  );
  const inCss = [...hideRule.matchAll(/body\.([a-z-]+) #first-run-launcher/g)].map((m) => m[1]);
  assert.deepEqual(
    inCss.sort(),
    [...EXCLUSIVE_SURFACE_CLASSES].sort(),
    'every screen-claiming surface must appear in BOTH lists',
  );
  assert.match(module, /export const EXCLUSIVE_SURFACE_CLASSES = Object\.freeze\(\[/);
});

test('exclusiveSurfaceActive reads the live body classes', () => {
  const make = (classes) => ({ body: { classList: { contains: (name) => classes.includes(name) } } });
  assert.equal(exclusiveSurfaceActive(make([])), false);
  for (const name of EXCLUSIVE_SURFACE_CLASSES) {
    assert.equal(exclusiveSurfaceActive(make([name])), true, `${name} must count as exclusive`);
  }
  assert.equal(exclusiveSurfaceActive(make(['some-other-class'])), false);
  assert.equal(exclusiveSurfaceActive(undefined), false);
  assert.equal(exclusiveSurfaceActive({}), false);
});

test('the key handler refuses to act for a card that is not really on screen', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  // Real visibility, not just the class: the class survives while CSS hides the
  // card, which is precisely how a Scene left an invisible ESC handler armed.
  assert.match(module, /const isTopmost = \(\) => root\.isConnected/);
  assert.match(module, /&& root\.getClientRects\(\)\.length > 0\s*\n\s*&& !coveredByOverlay\(\);/);
  const handler = module.slice(module.indexOf('function onKeyDown(event) {'));
  assert.match(
    handler.slice(0, handler.indexOf("if (event.key === 'Escape')")),
    /if \(closing \|\| !isTopmost\(\)\) return;/,
    'the handler must bail before consuming anything when it is not topmost',
  );
});

test('an overlay with NO class to watch still disarms the launcher', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  // The repro, pinned as the stacking it actually is: the attribution lightbox
  // is full-screen ABOVE the card and announces itself with nothing. The card
  // keeps its box, so getClientRects() alone called it visible, ESC dismissed a
  // buried launcher and wrote the session flag while the lightbox stayed open.
  const overlay = css.slice(css.indexOf('.cesium-credit-lightbox-overlay {'));
  assert.match(overlay.slice(0, overlay.indexOf('}')), /z-index: 200 !important/);
  const launcher = css.slice(css.indexOf('#first-run-launcher {'));
  assert.match(launcher.slice(0, launcher.indexOf('}')), /z-index: 175/);

  // Answered generically — a hit test at the card's own centre, NOT one more
  // class to keep in step with one more overlay.
  const covered = module.slice(
    module.indexOf('const coveredByOverlay = () => {'),
    module.indexOf('const isTopmost = ()'),
  );
  assert.ok(covered.length > 0, 'coveredByOverlay must exist');
  assert.match(covered, /rect\.left \+ rect\.width \/ 2/);
  assert.match(covered, /rect\.top \+ rect\.height \/ 2/);
  assert.match(covered, /return Boolean\(hit\) && !root\.contains\(hit\);/);

  // ...and every inconclusive answer is UNCOVERED, so a guard added to stop the
  // launcher acting under an overlay can never become why ESC stopped working.
  assert.match(covered, /if \(typeof documentRef\.elementFromPoint !== 'function'\) return false;/);
  assert.match(covered, /if \(!\(rect\.width > 0 && rect\.height > 0\)\) return false;/);
  assert.match(covered, /\} catch \{\s*\n\s*return false;\s*\n\s*\}/);
});

test('one ESC does one thing — the radio disclosure stops the launcher outright', () => {
  const ui = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');

  // stopPropagation() does NOT stop later listeners on the SAME document, so the
  // disclosure's earlier capture handler closed the disclosure and the launcher
  // dismissed itself off the same key. The earlier listener is the only one that
  // can stop the later one — and only the immediate form does it.
  const radioEsc = ui.slice(ui.indexOf("if (event.key !== 'Escape' || !this._contextRadioDock"));
  const claim = radioEsc.slice(0, radioEsc.indexOf('setRadioDisclosure(false'));
  assert.match(claim, /event\.preventDefault\(\);/);
  assert.match(claim, /event\.stopImmediatePropagation\(\);/);
  assert.doesNotMatch(claim, /event\.stopPropagation\(\);/,
    'the plain form leaves the launcher listening and is the defect itself');

  // Belt on the launcher side: a key another surface already marked is not ours,
  // whether or not that surface remembered to silence us.
  const handler = module.slice(module.indexOf('function onKeyDown(event) {'));
  assert.match(
    handler.slice(0, handler.indexOf("if (event.key === 'Escape')")),
    /if \(event\.defaultPrevented\) return;/,
    'a marked key must be somebody else\'s key',
  );
});

test('the durable write reports whether it landed', () => {
  // The write stays best-effort; the OUTCOME is reported, so a caller can tell
  // a saved "once" from a refused one.
  const blocked = {
    getItem: () => null,
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(setFirstRunSuppressed(true, blocked), false);
  assert.equal(setFirstRunSuppressed(false, blocked), false);
  // No storage area at all is a refusal too — nothing was persisted either way.
  assert.equal(setFirstRunSuppressed(true, null), false);
  assert.equal(setFirstRunSuppressed(false, null), false);
  // ...and a working store still reports success.
  const working = memoryStorage(FIRST_RUN_STORAGE_KEY);
  assert.equal(setFirstRunSuppressed(true, working), true);
  assert.equal(working.read(), 'suppressed');
  assert.equal(setFirstRunSuppressed(false, working), true);
  assert.equal(working.read(), null);

  // The checkbox that needed the answer is gone (once per browser).
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /onSuppressChange|data-first-run-suppress/);
});

test('a surface class that never clears is an ACCEPTED no-show, not a timer', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const state = fs.readFileSync(new URL('../docs/CURRENT-STATE.md', import.meta.url), 'utf8');

  // A "reveal anyway after N seconds" would trade a benign no-show for the card
  // punching through a recording in progress — recordings run long, and none of
  // the four classes is restored at startup, so a blocked init is an error path.
  // The slice deliberately spans the note AND the function it governs: a pin
  // that stopped at the comment would let a timer be added one line below the
  // paragraph saying there isn't one.
  const accepted = module.slice(
    module.indexOf('ACCEPTED, DELIBERATELY NOT TIMED OUT'),
    module.indexOf('  const onViewportResize'),
  );
  assert.ok(accepted.length > 0, 'the acceptance must be written where the next editor will read it');
  assert.match(accepted, /const syncToExclusiveSurfaces = \(\) => \{/,
    'the pin must cover the function the note governs, not just the note');
  assert.doesNotMatch(accepted, /setTimeout|setInterval/,
    'the acceptance is the decision NOT to time this out');
  assert.match(accepted, /docs\/CURRENT-STATE\.md/);
  assert.match(state, /a surface class that never clears means no launcher for that page/i);
});

test('the scroll fade only appears when the list really overflows', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  // A fade on a card where all five tiles fit promises a sixth mission that does
  // not exist, which is worse than no affordance at all.
  assert.match(module, /const overflows = choiceList\.scrollHeight > choiceList\.clientHeight \+ 1;/);
  assert.match(module, /choiceList\.dataset\.scrollable = String\(overflows\);/);
  // ...and the CSS must be gated on that flag, never on the media query alone.
  assert.match(css, /\.first-run-choices\[data-scrollable='true'\] \{[\s\S]*?mask-image/);
  const bareFade = css.match(/^\s*\.first-run-choices \{[\s\S]*?\n\}/m)?.[0] || '';
  assert.doesNotMatch(bareFade, /mask-image/, 'the fade must never apply unconditionally');
  // Rotating a phone changes which tiles fit, so it re-measures.
  assert.match(module, /addEventListener\?\.\('resize', onViewportResize\)/);
  assert.match(module, /removeEventListener\?\.\('resize', onViewportResize\)/);
});

test('the launcher yields on engage and waits when a surface is already up', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  // Both directions from one observer: yield if it is up and something takes
  // the screen; wait to reveal if something already has it.
  assert.match(
    module,
    /if \(revealed && blocked\) yieldToExclusiveSurface\(\);\s*\n\s*else if \(!revealed && !blocked\) reveal\(\);/,
  );
  // A yield is a close like any other, and must not steal focus from the new surface.
  assert.match(module, /dismiss\(\{ restoreFocus: false, reason: 'yield' \}\)/);
  // A cheap attribute watch, not a per-frame poll — the render governor must
  // not see a new hold because of onboarding chrome.
  assert.match(module, /attributes: true, attributeFilter: \['class'\]/);
  assert.match(module, /surfaceObserver\?\.disconnect\(\)/);
  assert.doesNotMatch(module, /setInterval|requestAnimationFrame\(function poll/);
});

// ── Defaults interplay: what a choice is allowed to persist ─────────────────

test('no choice writes a preference the visitor did not choose by making it', () => {
  const core = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const code = core.slice(core.indexOf('export function shouldShowFirstRun'));

  // Layer enables ARE durable in this app and a choice IS that choice, so they
  // run at the same origin a click on those rows uses — and only here.
  assert.match(code, /setEnabled\(layerId, true, \{ origin: 'user' \}\)/);

  for (const file of FIRST_RUN_MODULES) {
    // Code only: the decision table itself names what is NOT touched.
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // Detection is owned by the reasonable-defaults landing. A choice has no
    // opinion on any of it.
    for (const forbidden of [
      '_detectionUserOverridden',
      '_setDetectionMode',
      '_applyDetectionPreset',
      '_setDetectionAllocation',
      'setDetectionTuning',
      // 3D models and feather default to origin 'user' and would persist a
      // choice nobody made.
      '_setModels3dEnabled',
      '_setModels3dMode',
      '_setModels3dParams',
      'setFeather',
    ]) {
      assert.doesNotMatch(source, new RegExp(forbidden), `${file} must never touch ${forbidden}`);
    }
    // The global missions are gone, and with them every panel write and every
    // pull-out to the whole Earth.
    assert.equal((source.match(/setPanelCollapsed/g) || []).length, 0, `${file} opens no panel`);
    assert.doesNotMatch(source, /setContextMode|resetToGlobeView|flyToGlobe/, `${file} leaves France`);
  }
});

test('the three variants share one door, and C never becomes the card', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const init = module.slice(module.indexOf('export function initFirstRunExperience'));
  // The policy is asked BEFORE any variant branches, and a "no" removes the
  // card AND the bubble — which is what makes the QA fleet's seed hide C.
  const policy = init.indexOf('!shouldShowFirstRun({');
  const branch = init.indexOf("if (chosen === 'C') {");
  assert.ok(policy > 0 && branch > policy, 'the show policy must run before the variant branch');
  assert.match(init, /\}\)\) \{\s*root\.remove\(\);\s*hintHost\?\.remove\(\);\s*discardTemplates\(\);\s*return null;/);
  // C removes the card outright: phone.css hides the sheet while it is visible.
  assert.match(init, /if \(chosen === 'C'\) \{\s*root\.remove\(\);/);
  // The bubble closes on the same surfaces the card yields to.
  assert.match(init, /isBlocked: \(\) => exclusiveSurfaceActive\(documentRef\),/);
  // ...and on a desktop, when the LOCATION tray opens where the bubble sits.
  assert.match(init, /tray: phoneShell \? null : documentRef\.getElementById\('location-bar'\),/);
});

test('the event contract: a throwing listener is contained, and closes name their reason', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  const hint = fs.readFileSync(new URL('./firstRunHint.js', import.meta.url), 'utf8');
  assert.match(module, /try \{\s*onEvent\(event\);\s*\} catch \(error\) \{/);
  assert.match(module, /emit\(\{ type: 'dismiss', via: reason \}\);/);
  assert.match(hint, /emit\(\{ type: 'dismiss', via: reason \}\);/);
  // An impression is a card that was PAINTED: counted where `.visible` lands.
  assert.match(
    module,
    /root\.classList\.add\('visible'\);[\s\S]{0,200}?emit\(\{ type: 'impression', shell \}\);/,
  );
  // ESC names itself.
  assert.match(module, /dismiss\(\{ reason: 'esc' \}\);/);
});

test('the decision table is written down where the next editor will read it', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  assert.match(module, /CHOICE → APP STATE, AND WHAT IT IS ALLOWED TO PERSIST/);
  for (const row of ['TOUCHED, DURABLE', 'TOUCHED, SESSION', 'NOT TOUCHED']) {
    assert.ok(module.includes(row), `decision table is missing its "${row}" rows`);
  }
  assert.match(module, /SHOW POLICY/);
});

// ── Markup, startup ordering, accessibility ─────────────────────────────────

/** The markup of one variant template, or the static shell. */
function templateOf(html, variant) {
  const start = html.indexOf(`<template data-first-run-variant="${variant}">`);
  assert.ok(start > 0, `template ${variant} is gone`);
  return html.slice(start, html.indexOf('</template>', start));
}

/** What a reader sees: markup without comments or tags. */
function visibleText(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
}

test('markup, startup ordering and accessibility remain pinned', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(html, /id="first-run-launcher" role="dialog"[^>]*aria-labelledby="first-run-title"[^>]*hidden/);
  assert.match(html, /data-first-run-status[^>]*role="status"[^>]*aria-live="polite"/);
  // Once per browser: the checkbox is gone, and so is every tile of the old
  // global missions.
  assert.doesNotMatch(html, /data-first-run-suppress/);
  assert.doesNotMatch(html, /data-first-run-environmental-title|forbidden cockpit/);
  assert.doesNotMatch(html, /data-first-run-choice="(contacts|space-missions|environmental|infrastructure)"/);

  const shellStart = html.indexOf('<aside id="first-run-launcher"');
  const shell = html.slice(shellStart, html.indexOf('</aside>', shellStart));
  const a = templateOf(html, 'A');
  const b = templateOf(html, 'B');
  const c = templateOf(html, 'C');

  // B: exactly four tiles, in this order. A and C have none.
  assert.equal((b.match(/data-first-run-choice=/g) || []).length, 4);
  assert.equal((a.match(/data-first-run-choice=/g) || []).length, 0);
  assert.equal((c.match(/data-first-run-choice=/g) || []).length, 0);
  const order = [...b.matchAll(/data-first-run-choice="([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['sales', 'permits', 'live', 'explore']);

  // A: one field that tells the soft keyboard what it wants, one submit, the
  // three chips, and the way out.
  const field = a.match(/<input[^>]*data-first-run-address[^>]*>/);
  assert.ok(field, 'the address field is gone');
  for (const attribute of ['type="search"', 'enterkeyhint="search"', 'inputmode="search"', 'autocapitalize="off"', 'autocorrect="off"']) {
    assert.ok(field[0].includes(attribute), `the address field lost ${attribute}`);
  }
  assert.match(field[0], /aria-label="[^"]+"/);
  assert.match(a, /<form[^>]*data-first-run-form/);
  assert.match(a, /data-first-run-submit type="submit"/);
  assert.match(a, /data-first-run-chip="locate" hidden/, 'geolocation is offered only once the module knows it can work');
  assert.match(a, /data-first-run-chip="Tour Eiffel, Paris"/);
  assert.match(a, /data-first-run-chip="Vieux-Port, Marseille"/);
  assert.match(a, /data-first-run-look-around/);
  for (const template of [a, b]) {
    // The card is labelled by these two ids; they also carry a `data-i18n`
    // key now, so the attribute list is open-ended.
    assert.match(template, /<h2 id="first-run-title"[^>]*>/);
    assert.match(template, /<p id="first-run-description"[^>]*>/);
  }

  // C: its own element, never the card.
  assert.match(html, /<div id="first-run-hint" hidden><\/div>/);
  assert.match(c, /data-first-run-hint-open/);
  assert.match(visibleText(c), /Première visite \? Tapez une adresse ici\./);

  // French typography, as on every other French surface: a curly apostrophe,
  // no non-breaking spaces in the markup, and a plain space before ? : ;
  for (const [name, markup] of [['shell', shell], ['A', a], ['B', b], ['C', c]]) {
    const text = visibleText(markup);
    assert.doesNotMatch(text, /[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/, `${name} uses a straight apostrophe`);
    assert.doesNotMatch(markup, /[\u00a0\u202f]/, `${name} carries a non-breaking space`);
    for (const match of text.matchAll(/[?:;]/g)) {
      assert.equal(text[match.index - 1], ' ', `${name}: "${text.slice(match.index - 12, match.index + 1)}" needs a space before its mark`);
    }
    assert.doesNotMatch(markup, /lang="en"/, `${name} is French`);
  }
  assert.doesNotMatch(shell, /lang="/);

  // The two numbers the card states are the ones the share card states. (The
  // page description is the showcase's since 2026-09-17 and carries no count:
  // a number is not an argument for its reader.)
  const meta = html.match(/<meta property="og:description" content="[^"]*?(\d+) couches[^"]*?(\d+) ne demandent aucune clé/);
  assert.ok(meta, 'the share description no longer states the layer counts');
  const [, total, keyless] = meta;
  assert.ok(visibleText(shell).includes(`${total} couches de données publiques · ${keyless} sans clé`));
  assert.ok(visibleText(c).includes(`${total} couches · ${keyless} sans clé`));

  const startup = main.slice(main.indexOf('void Promise.all(['), main.indexOf('// Expose for debugging'));
  assert.match(startup, /styleManager\.initialRestorePromise/);
  const veil = startup.indexOf("loadingScreen.classList.add('hidden')");
  assert.ok(veil >= 0 && veil < startup.indexOf('startFirstRunExperience'));
  // Revealed once the boot flight has LANDED — inside the reveal, never in the
  // Promise.all above, which is what lifts the loading veil. The variant and
  // its measurement are src/firstRunBoot.js's, which hands the card both.
  assert.match(startup, /whenBootFlightEnds\(\(\) => \{\s*void startFirstRunExperience\(\{\s*styleManager,\s*dataManager,\s*phoneSheet,\s*probe: trialProbe \}\);/);
  const boot = fs.readFileSync(new URL('./firstRunBoot.js', import.meta.url), 'utf8');
  assert.match(boot, /init\(\{\s*styleManager,\s*dataManager,\s*variant: assignment\.variant,\s*onEvent: telemetry\.record,/);
  assert.ok(startup.indexOf('whenBootFlightEnds(') > veil);
  assert.doesNotMatch(
    main.slice(main.indexOf('void Promise.all(['), main.indexOf(']).finally(')),
    /whenBootFlightEnds/,
    'the veil must not wait for the flight',
  );
  assert.match(main, /import \{[^}]*\bwhenBootFlightEnds\b[^}]*\} from '\.\/bootFlight\.js';/);

  assert.match(css, /body\.ui-clean-view #first-run-launcher/);
  assert.match(css, /body\.recording-mode #first-run-launcher/);
  // Scoped, not a bare search: style.css has other reduced-motion blocks, and
  // matching one of THOSE would let the launcher's own opt-out be deleted.
  const reducedMotion = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1]);
  assert.ok(
    reducedMotion.some((block) => block.includes('#first-run-launcher') && block.includes('.first-run-choices')),
    'the launcher must keep its OWN prefers-reduced-motion block, covering the card and the scrolling list',
  );
  // The card must be click-through until revealed and again while it fades out.
  const base = css.slice(css.indexOf('#first-run-launcher {'), css.indexOf('#first-run-launcher.visible'));
  assert.match(base, /pointer-events: none/);
  assert.match(css, /#first-run-launcher\.visible \{[\s\S]*?pointer-events: auto/);
  // The card is a flex column so its mission list can scroll on a short
  // viewport — and an AUTHOR `display` on this id outranks the UA's
  // `[hidden] { display: none }`, which would strand the card in the
  // accessibility tree until it is revealed or removed.
  assert.match(base, /display: flex/);
  assert.match(base, /max-height: calc\(100dvh/);
  assert.match(css, /#first-run-launcher\[hidden\] \{\s*display: none;\s*\}/);
  // Only the mission list may scroll: the heading, checkbox and status line
  // have to stay on screen at every height.
  // Within ONE block: a lazy match across blocks finds another list's scroll.
  assert.match(css, /\.first-run-choices \{[^}]*min-height: 0;[^}]*overflow-y: auto/);
});

test('the launcher keeps focus, restores it, and never disables the focused button', () => {
  const module = fs.readFileSync(new URL('./firstRunExperience.js', import.meta.url), 'utf8');
  // aria-disabled, never the `disabled` property: disabling a focused button
  // drops the keyboard to <body> and strands the visitor outside the launcher.
  assert.match(module, /button\.setAttribute\('aria-disabled', String\(next\)\)/);
  assert.doesNotMatch(module, /button\.disabled = /);
  // Tab is confined to the launcher, and ESC always releases it.
  assert.match(module, /event\.key !== 'Tab'/);
  assert.match(module, /event\.key === 'Escape'/);
  assert.match(module, /previouslyFocused\?\.focus/);
  // Capture phase, so the app's global letter hotkeys cannot eat the launcher's keys.
  assert.match(module, /addEventListener\('keydown', onKeyDown, true\)/);
});

test('the DISPLAY rail starts collapsed on a first run, and a stored choice wins', () => {
  const ui = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  // The rail opened by default to advertise HUD / DETECT / 3D. Those default ON
  // now, so it was opening to offer controls for things already happening —
  // while competing with the mission card for the one first impression there is.
  assert.match(
    ui,
    /if \(panelId === 'pp-toggles' && stored === null\) collapsed = true;/,
    'first run must leave DISPLAY collapsed',
  );
  // The first-run default may only apply when NOTHING is stored: a visitor who
  // opened the rail keeps it open, and one who closed it keeps it closed.
  const block = ui.slice(ui.indexOf('stored = localStorage.getItem(this._panelCollapseStorageKey(panelId))'));
  const guard = block.slice(0, block.indexOf('panelEl.classList.toggle'));
  assert.match(guard, /if \(stored === '1'\) collapsed = true;/);
  assert.match(guard, /if \(stored === '0'\) collapsed = false;/);
  assert.ok(
    guard.indexOf("stored === '0'") < guard.indexOf('pp-toggles'),
    'the stored-state reads must come before the first-run default',
  );
});

// ── Voice: instruction-only, tool schema byte-unchanged ─────────────────────

test('the voice TOOL SCHEMA is byte-identical to main — the mission mapping is instructions only', () => {
  const src = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const start = src.indexOf('const GEV_REALTIME_TOOLS = [');
  assert.ok(start > 0, 'GEV_REALTIME_TOOLS must still be a single literal array');
  const end = src.indexOf('\n];\n', start);
  const block = src.slice(start, end + 4);

  // Baseline re-frozen when the maritime layers landed: `local-ports` (NGA
  // World Port Index) and `marine-buoys` (NOAA NDBC) were added to the layer
  // enums, which is a real schema edit and does bust the Realtime session
  // cache. That is the cost of shipping a voice-reachable layer, and it is
  // exactly what this guard exists to make visible. What it still forbids is
  // the thing it was written for: a FIRST-RUN MISSION quietly growing the
  // schema instead of riding the tools that already exist.
  //
  // Re-frozen a second time, for the same reason and at the same price:
  // `local-airports` (OurAirports) joined the three layer enums and the
  // common-name mapping, so "show me the airports" resolves without an
  // instruction. +148 bytes, one cache bust, still a deliberate schema edit.
  //
  // Re-frozen a third time, this one SHRINKING the schema: the global bloom
  // pass was removed from the product, so `set_post_processing` lost its
  // `bloom` object and now controls sharpen alone. -263 bytes, one cache bust.
  //
  // Re-frozen a fourth time: `fly_to_location`'s preset enum gained the seven
  // French cities this fork had already added to CITY_POIS but never exposed to
  // the model. Until now it could not NAME them, so "va à Marseille" fell
  // through to a geocode instead of the hand-tuned framing sitting right there.
  // +550 bytes, one cache bust, and src/locations.test.mjs now fails if the two
  // lists drift again.
  //
  // Re-frozen a FIFTH time, and this is the largest edit the guard has ever
  // recorded: the layer vocabulary. `set_layer_visibility` and
  // `show_data_layers_menu` carried 17 hand-written ids while the fork had
  // registered 60 layers, so 43 of them — every French one, including the
  // médecins layer an operator asked for by name — could not be NAMED by the
  // model, which then reported them as nonexistent. All four layer enums are
  // now derived from src/voice/layerVocabulary.js, `list_layers` was added so
  // "I don't have that" becomes a checkable claim, and four instruction lines
  // state the reading and diction rules. +5904 bytes, one cache bust, and
  // src/voice/layerVocabulary.test.mjs fails if an enum drifts from the
  // registry again.
  //
  // Re-frozen a SIXTH time, and for a measured refusal: asked for the average
  // price per square metre around a Bordeaux bike station, the model answered
  // that analytical queries did not cover DVF — which was true. `dvf-sales`
  // now publishes records, so it joins the `analyst_query` and
  // `get_entity_context` enums, and both descriptions name the one rule that
  // makes an answer honest: count and rank the SALES here, read the MARKET
  // from the layer's own median (carried on `layerSummaries`), never average
  // rows whose price the register withheld. +364 bytes, one cache bust — and
  // the wording was cut to the bone because this session prefix is re-sent on
  // every response against a 40 000 tokens-per-minute ceiling.
  //
  // Re-frozen a SEVENTH time: `gironde-megafire-2026` joined the two layer
  // enums, plus one clause of common-name mapping. The clause is not optional
  // padding — without it "montre-moi l'incendie de Gironde" resolves to
  // `local-firms`, which is the LIVE fire row and draws nothing over Gironde in
  // September, so the model would confidently report an empty map for a fire
  // the pack holds in full. +238 bytes, one cache bust. It is NOT in the
  // `analyst_query` or `get_entity_context` enums: the layer publishes no
  // queryable per-entity records, only perimeters and a clock.
  //
  // Re-frozen an EIGHTH time, and only the second edit that SHRINKS the schema:
  // `idfm-frequency` left both layer enums because it stopped being a layer —
  // it and `idfm-network` drew the same Paris stops and were merged into one
  // module on 2026-09-10. One clause of common-name mapping was added in its
  // place, so "la fréquence des transports" and "la desserte" still resolve,
  // now onto `idfm-network`. Net −5 bytes, one cache bust. A voice-reachable
  // subject must never disappear because its implementation was merged.
  //
  // Re-frozen a NINTH time, the third edit that SHRINKS the schema and the
  // first for a product decision rather than an implementation one:
  // `velo-pulse-fr` left `set_layer_visibility` and `show_data_layers_menu`
  // because the « Semaine type » chip was withdrawn from the Data Layers panel
  // on 2026-09-14 (`DISABLED_LAYER_IDS`). The layer is still registered and
  // still drivable in code — what it no longer has is a control, and a voice
  // enum that kept it would let the model put on the globe something the reader
  // cannot switch back off. −58 bytes, one cache bust. No common-name clause
  // takes its place: there is nothing to resolve TO.
  //
  // Re-frozen a TENTH time, for the product's name and nothing else: five
  // descriptions (`fly_to_location`, `set_layer_visibility`, `set_panel_open`,
  // `set_visual_style`, `get_entity_context`) still called the app "God's Eye
  // View" or "GEV" after the fork was renamed Surplomb on 2026-09-15. No enum,
  // no parameter, no tool moved. −3 bytes, one cache bust.
  assert.equal(block.length, 38198, 'tool schema byte length drifted from the frozen baseline');
  assert.equal(
    crypto.createHash('sha256').update(block).digest('hex'),
    '11ac6c78659ebab1e3095c016dad5a8bce34121025665a263f251e44b0697893',
    'the first-run missions must ride EXISTING tools: no schema edit, no cache bust',
  );

  // ...and the mapping that makes them reachable by voice is one instruction
  // string, whose rollback is deleting that string. Anchored to a LIVE array
  // entry — a quote at the start of its own line — so commenting the paragraph
  // out reads as the removal it is, not as a passing substring match.
  assert.match(
    src,
    /\n\s+'NAMED VIEWS are shorthand/,
    'the mission mapping must be an active instruction entry, not commented out',
  );
  const mapping = src.slice(src.indexOf('NAMED VIEWS are shorthand'));
  const paragraph = mapping.slice(0, mapping.indexOf("',\n"));
  for (const layerId of [
    'local-datacenters', 'local-dams', 'telegeography-submarine-cables', 'local-firms', 'earthquakes',
  ]) {
    assert.ok(paragraph.includes(layerId), `mapping must name the existing ${layerId} enum value`);
  }
  assert.ok(paragraph.includes('zoom_to_globe'));
  assert.ok(paragraph.includes('set_layer_visibility'));
});

test('every layer a choice drives is already in the shipped set_layer_visibility enum', () => {
  const src = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const tool = src.slice(src.indexOf("name: 'set_layer_visibility'"), src.indexOf("name: 'show_data_layers_menu'"));
  const choiceLayerIds = [...new Set([...variantLayerIds('A'), ...variantLayerIds('B')])];
  assert.equal(choiceLayerIds.length, 8);
  for (const layerId of choiceLayerIds) {
    assert.ok(tool.includes(`'${layerId}'`), `${layerId} must already be an allowed enum value`);
  }
});
