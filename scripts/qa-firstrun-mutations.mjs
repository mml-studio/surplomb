#!/usr/bin/env node
/**
 * Are the first-run experience's pins actually load-bearing?
 *
 * A pin that only goes red when you delete the whole feature proves very little.
 * This reverts each decision INDIVIDUALLY — the smallest edit that reintroduces
 * a defect or contradicts the product rule — and requires the first-run unit
 * suites to go red for it. Every entry names what it restores, so the count is
 * reproducible rather than asserted in a commit message.
 *
 *   node scripts/qa-firstrun-mutations.mjs
 *   node scripts/qa-firstrun-mutations.mjs --dry   # anchors only, writes nothing
 *
 * Every touched file is restored on exit, including on failure. An anchor that
 * no longer exists is STALE and fails the run: a mutation that cannot apply
 * proves nothing, and silently skipping it would inflate the score.
 *
 * NOTE: mutations edit files a running dev server watches (two of them edit
 * vite.config.js, which restarts it). Writes are content-guarded so each file is
 * touched exactly twice per mutation — but a live QA session on the same tree
 * reloads under it. Run this before or after browser QA, never during.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const TESTS = [
  'src/firstRunExperience.test.mjs',
  'src/firstRunVariants.test.mjs',
  'src/firstRunHint.test.mjs',
  'src/locationSearchSeams.test.mjs',
];

const FILES = {
  module: path.join(ROOT, 'src', 'firstRunExperience.js'),
  variants: path.join(ROOT, 'src', 'firstRunVariants.js'),
  hint: path.join(ROOT, 'src', 'firstRunHint.js'),
  html: path.join(ROOT, 'index.html'),
  css: path.join(ROOT, 'style.css'),
  phone: path.join(ROOT, 'phone.css'),
  vite: path.join(ROOT, 'vite.config.js'),
  main: path.join(ROOT, 'src', 'main.js'),
  ui: path.join(ROOT, 'src', 'ui.js'),
  docs: path.join(ROOT, 'docs', 'CURRENT-STATE.md'),
};

/** @type {Array<{defect: string, file: keyof FILES, from: string, to: string}>} */
const MUTATIONS = [
  // ── Show policy: once per browser, one door for three variants ────────────
  {
    defect: 'a close stops writing the durable key, so the card returns every session',
    file: 'module',
    from: '    rememberFirstRunSessionDismissed(sessionStorageRef);\n    setFirstRunSuppressed(true, storage);\n  };',
    to: '    rememberFirstRunSessionDismissed(sessionStorageRef);\n  };',
  },
  {
    defect: 'a close stops writing the session key, so a browser refusing localStorage re-nags on reload',
    file: 'module',
    from: '    rememberFirstRunSessionDismissed(sessionStorageRef);\n    setFirstRunSuppressed(true, storage);\n  };',
    to: '    setFirstRunSuppressed(true, storage);\n  };',
  },
  {
    defect: 'the session dismissal lands in the wrong store',
    file: 'module',
    from: "writeStored('session', sessionStorageRef, FIRST_RUN_SESSION_KEY, 'dismissed');",
    to: "writeStored('local', sessionStorageRef, FIRST_RUN_STORAGE_KEY, 'suppressed');",
  },
  {
    defect: 'the durable write is a no-op, so nothing ever suppresses the card',
    file: 'module',
    from: "    ? writeStored('local', storage, FIRST_RUN_STORAGE_KEY, 'suppressed')",
    to: '    ? false',
  },
  {
    defect: 'clearing the durable key does nothing',
    file: 'module',
    from: "    : removeStored('local', storage, FIRST_RUN_STORAGE_KEY);",
    to: '    : true;',
  },
  {
    defect: 'the session flag is never read, so it re-nags on every reload',
    file: 'module',
    from: "if (readStored('session', sessionStorageRef, FIRST_RUN_SESSION_KEY) === 'dismissed') return false;",
    to: '// session check removed',
  },
  {
    defect: 'the durable flag is never read, so the card returns every session',
    file: 'module',
    from: "if (readStored('local', storage, FIRST_RUN_STORAGE_KEY) === 'suppressed') return false;",
    to: '// durable check removed',
  },
  {
    defect: '?welcome=1 no longer outranks suppression, so demos cannot replay it',
    file: 'module',
    from: "if (params.get('welcome') === '1') return true;",
    to: '// replay hatch removed',
  },
  {
    defect: '?welcome=B no longer replays past a close',
    file: 'module',
    from: "  if (FIRST_RUN_VARIANT_IDS.includes((params.get('welcome') || '').toUpperCase())) return true;\n",
    to: '',
  },
  {
    defect: '?welcome=0 stops suppressing',
    file: 'module',
    from: "if (params.get('welcome') === '0') return false;",
    to: '// suppression param removed',
  },
  {
    defect: 'a share link gets the card over the view its author chose',
    file: 'module',
    from: 'if (hasShareState) return false;',
    to: '// share bypass removed',
  },
  {
    defect: '?welcome=b stops forcing B (case-sensitive again)',
    file: 'module',
    from: "  const value = (new URLSearchParams(location?.search || '').get('welcome') || '').toUpperCase();",
    to: "  const value = new URLSearchParams(location?.search || '').get('welcome') || '';",
  },
  {
    defect: 'the assigned variant is ignored, so the A/B test can never show B or C',
    file: 'module',
    from: "    ?? (FIRST_RUN_VARIANT_IDS.includes(assigned) ? assigned : 'A');",
    to: "    ?? 'A';",
  },
  {
    defect: 'storage is read from a DEFAULT PARAMETER, outside every guard',
    file: 'module',
    from: 'export function rememberFirstRunSessionDismissed(sessionStorageRef) {',
    to: 'export function rememberFirstRunSessionDismissed(sessionStorageRef = globalThis.sessionStorage) {',
  },
  {
    defect: 'shouldShowFirstRun resolves storage in its parameter list again',
    file: 'module',
    from: 'export function shouldShowFirstRun({\n  hasShareState = false,\n  storage,\n  sessionStorageRef,',
    to: 'export function shouldShowFirstRun({\n  hasShareState = false,\n  storage = globalThis.localStorage,\n  sessionStorageRef = globalThis.sessionStorage,',
  },
  {
    defect: 'the guarded resolver stops catching, so a hostile getter escapes',
    file: 'module',
    from: "  try {\n    return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;\n  } catch {\n    // Privacy-restricted storage should not make first launch silent.\n    return null;\n  }",
    to: "  return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;",
  },
  {
    defect: 'a blocked getItem throws instead of reading as "nothing stored"',
    file: 'module',
    from: '    return resolveStore(kind, injected)?.getItem?.(key) ?? null;\n  } catch {\n    return null;\n  }',
    to: '    return resolveStore(kind, injected)?.getItem?.(key) ?? null;\n  } finally {\n    // no catch\n  }',
  },
  {
    defect: 'a missing storage area reports the write as saved',
    file: 'module',
    from: "    if (typeof store?.setItem !== 'function') return false;\n    store.setItem(key, value);\n    return true;",
    to: '    store?.setItem?.(key, value);\n    return true;',
  },
  {
    defect: 'a "no" from the policy leaves the bubble host behind, so C escapes the QA seed',
    file: 'module',
    from: '    root.remove();\n    hintHost?.remove();\n    discardTemplates();\n    return null;\n  }',
    to: '    root.remove();\n    discardTemplates();\n    return null;\n  }',
  },
  {
    defect: 'C keeps the card in the page, and phone.css hides the sheet the bubble points at',
    file: 'module',
    from: "  if (chosen === 'C') {\n    root.remove();\n",
    to: "  if (chosen === 'C') {\n",
  },
  {
    defect: 'a bubble close writes nothing, so C comes back every visit',
    file: 'module',
    from: '      onClose: rememberClosed,',
    to: '      onClose: () => {},',
  },
  {
    defect: 'the bubble opens over (and ignores) a screen-claiming surface',
    file: 'module',
    from: '      isBlocked: () => exclusiveSurfaceActive(documentRef),',
    to: '      isBlocked: () => false,',
  },

  // ── The event contract ────────────────────────────────────────────────────
  {
    defect: 'a throwing onEvent takes the card down with it',
    file: 'module',
    from: "    try {\n      onEvent(event);\n    } catch (error) {\n      console.warn('[First run] Event listener failed:', error);\n    }",
    to: '    onEvent(event);',
  },
  {
    defect: 'a card close stops naming its reason',
    file: 'module',
    from: "    emit({ type: 'dismiss', via: reason });\n    mounted?.teardown?.();",
    to: "    emit({ type: 'dismiss' });\n    mounted?.teardown?.();",
  },
  {
    defect: 'the impression is never counted',
    file: 'module',
    from: "      emit({ type: 'impression', shell });\n",
    to: '',
  },
  {
    defect: 'an unknown event type is emitted',
    file: 'hint',
    from: "  emit({ type: 'impression', shell: phoneShell ? 'phone' : 'desktop' });",
    to: "  emit({ type: 'bogus', shell: phoneShell ? 'phone' : 'desktop' });",
  },
  {
    defect: 'A reports what the visitor typed instead of its length',
    file: 'variants',
    from: '      text.length,\n    );',
    to: '      text,\n    );',
  },
  {
    defect: 'A names the destination in its event',
    file: 'variants',
    from: "      emit({ type: 'action', kind, outcome: 'found', ...length, layerIds: outcome.layerIds });",
    to: "      emit({ type: 'action', kind, outcome: 'found', ...length, layerIds: outcome.layerIds, label: outcome.label });",
  },

  // ── A: an address, then the bundle where the camera lands ─────────────────
  {
    defect: 'the A bundle loses the DPE',
    file: 'variants',
    from: "export const FIRST_RUN_ADDRESS_BUNDLE = Object.freeze(['dvf-sales', 'ads-fr', 'dpe-fr']);",
    to: "export const FIRST_RUN_ADDRESS_BUNDLE = Object.freeze(['dvf-sales', 'ads-fr']);",
  },
  {
    defect: 'the bundle is switched on BEFORE the flight, scanning the place being left',
    file: 'variants',
    from: '  let started;\n  try {\n    started = await startFlight(onArrival);',
    to: '  await enableLayers([...layerIds], setLayerEnabled);\n  let started;\n  try {\n    started = await startFlight(onArrival);',
  },
  {
    defect: 'an interrupted flight no longer gets the layers the visitor chose',
    file: 'variants',
    from: '  const onArrival = (why) => {\n    if (settle) settle(why);',
    to: "  const onArrival = (why) => {\n    if (why === 'cancelled') return;\n    if (settle) settle(why);",
  },
  {
    defect: 'the arrival deadline is gone, so a lost hook costs the layers',
    file: 'variants',
    from: "    timer = setTimer(() => settle('deadline'), deadlineMs) ?? null;",
    to: '    timer = null;',
  },
  {
    defect: 'the bundle is switched on twice',
    file: 'variants',
    from: '      if (done) return;\n      done = true;',
    to: '      done = true;',
  },
  {
    defect: 'an early landing is dropped, so the bundle waits for the deadline',
    file: 'variants',
    from: '    else if (early === null) early = why;',
    to: '    else if (early === null) void why;',
  },
  {
    defect: 'a flight that never started still switches the bundle on',
    file: 'variants',
    from: "  if (status !== 'flying') return { ok: false, status, message: started?.message };",
    to: "  if (status === 'refused') return { ok: false, status, message: started?.message };",
  },
  {
    defect: 'a start that throws escapes as a rejection',
    file: 'variants',
    from: "  } catch (error) {\n    console.warn('[First run] Flight could not start:', error);\n    return { ok: false, status: 'failed' };\n  }",
    to: '  } finally {\n    // no catch\n  }',
  },
  {
    defect: '"Introuvable" closes the card instead of offering another try',
    file: 'variants',
    from: "    if (outcome.ok) {\n      emit({ type: 'action', kind, outcome: 'found'",
    to: "    if (outcome.ok || outcome.status === 'not-found') {\n      emit({ type: 'action', kind, outcome: 'found'",
  },
  {
    defect: 'a found address leaves the card over the flight',
    file: 'variants',
    from: "      dismiss({ reason: 'choice' });\n      return;\n    }\n    const answered",
    to: '      return;\n    }\n    const answered',
  },
  {
    defect: 'the not-found line is never written',
    file: 'variants',
    from: "    if (outcome.status === 'not-found') setStatus(NOT_FOUND_TEXT);",
    to: '    void NOT_FOUND_TEXT;',
  },
  {
    defect: 'typed letters reach the app hotkeys (styles, detection)',
    file: 'variants',
    from: "    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();",
    to: '    void event;',
  },
  {
    defect: 'Escape is swallowed by the field and never closes the card',
    file: 'variants',
    from: "    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();",
    to: '    event.stopPropagation();',
  },
  {
    defect: 'a phone gets the caret, and the soft keyboard covers the sheet',
    file: 'variants',
    from: '    focusTarget: phoneShell ? null : field,',
    to: '    focusTarget: field,',
  },
  {
    defect: '"Autour de moi" is offered where it can only fail',
    file: 'variants',
    from: '  if (locate && canGeolocate()) locate.hidden = false;',
    to: '  if (locate) locate.hidden = false;',
  },
  {
    defect: 'the locate chip toasts behind the card instead of answering in it',
    file: 'variants',
    from: '(onArrival) => styleManager.locateMe({ onArrival, notify: false }),',
    to: '(onArrival) => styleManager.locateMe({ onArrival }),',
  },
  {
    defect: '"Regarder autour d’ici" switches a layer on',
    file: 'variants',
    from: "    emit({ type: 'action', kind: 'explore', outcome: 'found' });",
    to: "    void setLayerEnabled('traffic');\n    emit({ type: 'action', kind: 'explore', outcome: 'found' });",
  },
  {
    defect: 'an empty field still asks the geocoder',
    file: 'variants',
    from: '    if (!text) {\n      field?.focus({ preventScroll: true });\n      return;\n    }',
    to: '    if (!text) {\n      field?.focus({ preventScroll: true });\n    }',
  },

  // ── B: layers where the camera already is ─────────────────────────────────
  {
    defect: 'a refused layer is reported as a successful tile',
    file: 'variants',
    from: 'return { ok: failedLayerIds.length === 0, choice, layerIds, failedLayerIds };',
    to: 'return { ok: true, choice, layerIds, failedLayerIds };',
  },
  {
    defect: 'an unknown tile is treated as a success',
    file: 'variants',
    from: 'if (!tile) return { ok: false, choice };',
    to: 'if (!tile) return { ok: true, choice };',
  },
  {
    defect: 'the tile lookup reaches the prototype',
    file: 'variants',
    from: '  const tile = Object.hasOwn(tiles, choice) ? tiles[choice] : null;',
    to: '  const tile = tiles[choice];',
  },
  {
    defect: 'a throwing layer counts as switched on',
    file: 'variants',
    from: '    } catch {\n      return { layerId, ok: false };\n    }',
    to: '    } catch {\n      return { layerId, ok: true };\n    }',
  },
  {
    defect: 'the heavy parcel layer is switched on on a phone',
    file: 'variants',
    from: "        phoneSkipLayerIds: Object.freeze(['cadastre-fr']),",
    to: '        phoneSkipLayerIds: Object.freeze([]),',
  },
  {
    defect: 'the tile ignores the shell',
    file: 'variants',
    from: '  if (!phoneShell) return [...ids];',
    to: '  return [...ids];',
  },
  {
    defect: 'the phone subcopy keeps promising the parcel',
    file: 'variants',
    from: '      if (tile?.phoneSubcopy && small) small.textContent = tile.phoneSubcopy;',
    to: '      void small;',
  },
  {
    defect: '"Je regarde par moi-même" switches traffic on',
    file: 'variants',
    from: '      explore: Object.freeze({ layerIds: Object.freeze([]) }),',
    to: "      explore: Object.freeze({ layerIds: Object.freeze(['traffic']) }),",
  },
  {
    defect: 'a B tile moves the camera',
    file: 'variants',
    from: '    setBusy(true, tiles[choice].busyText);',
    to: "    ctx.styleManager?.flyToAddress?.('Paris');\n    setBusy(true, tiles[choice].busyText);",
  },
  {
    defect: 'a failed tile closes the card instead of offering a retry',
    file: 'variants',
    from: "    emit({ type: 'action', kind, outcome: 'cancelled', layerIds });\n    if (ctx.isClosed()) return;",
    to: "    emit({ type: 'action', kind, outcome: 'cancelled', layerIds });\n    dismiss({ reason: 'choice' });\n    if (ctx.isClosed()) return;",
  },

  // ── What a choice may persist ─────────────────────────────────────────────
  {
    defect: 'layer enables stop persisting, unlike the clicks they stand for',
    file: 'module',
    from: "dataManager.setEnabled(layerId, true, { origin: 'user' })",
    to: 'dataManager.setEnabled(layerId, true)',
  },
  {
    defect: 'a choice hand-edits detection and kills the style auto-preset contract',
    file: 'variants',
    from: '    if (ctx.isBusy()) return;\n    setBusy(true, busyText);',
    to: '    if (ctx.isBusy()) return;\n    styleManager._detectionUserOverridden = true;\n    setBusy(true, busyText);',
  },
  {
    defect: 'a tile persists a 3D-models choice nobody made',
    file: 'variants',
    from: '    setBusy(true, tiles[choice].busyText);',
    to: '    ctx.styleManager?._setModels3dEnabled?.(true);\n    setBusy(true, tiles[choice].busyText);',
  },
  {
    defect: 'a choice opens the Context panel again',
    file: 'module',
    from: "  mounted = chosen === 'B' ? mountVariantB(ctx) : mountVariantA(ctx);",
    to: "  styleManager?.setPanelCollapsed?.('global-context-panel', false, { explicit: true });\n  mounted = chosen === 'B' ? mountVariantB(ctx) : mountVariantA(ctx);",
  },
  {
    defect: 'a choice leaves France for the whole Earth',
    file: 'variants',
    from: "    emit({ type: 'action', kind: 'explore', outcome: 'found' });",
    to: "    styleManager.resetToGlobeView?.();\n    emit({ type: 'action', kind: 'explore', outcome: 'found' });",
  },
  {
    defect: 'the decision table is deleted, so the next editor re-litigates it blind',
    file: 'module',
    from: ' * CHOICE → APP STATE, AND WHAT IT IS ALLOWED TO PERSIST',
    to: ' * (notes removed)',
  },

  // ── C: a bubble, never a dialog ───────────────────────────────────────────
  {
    defect: 'the bubble claims Escape',
    file: 'hint',
    from: "  listen(windowRef, 'resize', place);",
    to: "  listen(windowRef, 'resize', place);\n  listen(documentRef, 'keydown', () => close('esc'));",
  },
  {
    defect: 'the bubble never times out',
    file: 'hint',
    from: "  timer = setTimer(() => close('timeout'), FIRST_RUN_HINT_TIMEOUT_MS) ?? null;",
    to: '  timer = null;',
  },
  {
    defect: 'a click away closes the bubble without recording the close',
    file: 'hint',
    from: '    try {\n      onClose();\n    } catch (error) {',
    to: '    try {\n      void onClose;\n    } catch (error) {',
  },
  {
    defect: 'the bubble opens over a surface already on screen',
    file: 'hint',
    from: '  if (isBlocked() || trayOpen()) return null;',
    to: '  if (trayOpen()) return null;',
  },
  {
    defect: 'the search opens under a bubble that is still closing',
    file: 'hint',
    from: "    close('choice');\n    openSearch();",
    to: "    openSearch();\n    close('choice');",
  },
  {
    defect: 'a click inside the bubble counts as a click away',
    file: 'hint',
    from: '    if (host.contains(event.target)) return;',
    to: '    void host;',
  },
  {
    defect: 'the caret stops pointing at the anchor once the bubble is clamped',
    file: 'hint',
    from: "    host.style.setProperty('--first-run-hint-caret', `${Math.round(anchorX - x)}px`);",
    to: '    void x;',
  },
  {
    defect: 'the closed bubble is never removed',
    file: 'hint',
    from: '  setTimer(() => host.remove(), FIRST_RUN_HINT_LEAVE_MS);',
    to: '  void FIRST_RUN_HINT_LEAVE_MS;',
  },
  {
    defect: 'the bubble opens on top of a LOCATION tray already open',
    file: 'hint',
    from: '  if (isBlocked() || trayOpen()) return null;',
    to: '  if (isBlocked()) return null;',
  },
  {
    defect: 'the LOCATION tray opens under a bubble that stays on top of it',
    file: 'hint',
    from: "        if (trayOpen()) close('yield');",
    to: '        void trayOpen;',
  },
  {
    defect: 'the bubble is never told which tray it points at',
    file: 'module',
    from: "      tray: phoneShell ? null : documentRef.getElementById('location-bar'),",
    to: '      tray: null,',
  },
  {
    defect: 'any body class change closes the bubble',
    file: 'hint',
    from: "      if (isBlocked()) close('yield');",
    to: "      close('yield');",
  },
  {
    defect: 'the bubble loses its cockpit hide rule',
    file: 'css',
    from: 'body.cockpit-mode #first-run-hint,',
    to: 'body.cockpit-mode-typo #first-run-hint,',
  },
  {
    defect: 'the bubble host defeats [hidden]',
    file: 'css',
    from: '#first-run-hint[hidden] {\n  display: none;\n}',
    to: '/* [hidden] rule removed */',
  },
  {
    defect: 'on a phone the bubble joins the rule that hides the sheet it points at',
    file: 'phone',
    from: 'html[data-shell="phone"] body:has(:is(#first-run-launcher, #coverage-briefing).visible) :is(#zoom-prompt, #phone-sheet) {',
    to: 'html[data-shell="phone"] body:has(:is(#first-run-launcher, #coverage-briefing).visible) :is(#zoom-prompt, #phone-sheet, #first-run-hint) {',
  },
  {
    defect: 'on a phone the bubble ignores the sheet height and lands on the tabs',
    file: 'phone',
    from: 'html[data-shell="phone"] #first-run-hint {\n  bottom: calc(var(--phone-sheet-height, 116px) + 10px);',
    to: 'html[data-shell="phone"] #first-run-hint {\n  bottom: 5.5rem;',
  },

  // ── ESC arbitration ───────────────────────────────────────────────────────
  {
    defect: 'the key handler trusts the CLASS, so an invisible card eats ESC',
    file: 'module',
    from: 'if (closing || !isTopmost()) return;',
    to: 'if (closing) return;',
  },
  {
    defect: 'the card stops yielding and fights Cockpit/Scenes for ESC',
    file: 'module',
    from: 'if (revealed && blocked) yieldToExclusiveSurface();\n    else if (!revealed && !blocked) reveal();',
    to: 'if (!revealed) reveal();',
  },
  {
    defect: 'nothing watches for another surface taking the screen',
    file: 'module',
    from: "surfaceObserver?.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });",
    to: '/* observer never attached */',
  },
  {
    defect: 'cockpit drops off the exclusive list and can stack with the card',
    file: 'module',
    from: "export const EXCLUSIVE_SURFACE_CLASSES = Object.freeze([\n  'cockpit-mode',",
    to: 'export const EXCLUSIVE_SURFACE_CLASSES = Object.freeze([',
  },
  {
    defect: 'a scene hides the card in CSS but the JS never learns of it',
    file: 'css',
    from: 'body.scene-playback-mode #first-run-launcher {',
    to: 'body.scene-playback-mode-typo #first-run-launcher {',
  },
  {
    defect: 'yielding steals focus back from the surface that just took over',
    file: 'module',
    from: "dismiss({ restoreFocus: false, reason: 'yield' });",
    to: "dismiss({ reason: 'yield' });",
  },
  {
    defect: 'isTopmost stops hit-testing, so an unclassed overlay buries the card again',
    file: 'module',
    from: '    && root.getClientRects().length > 0\n    && !coveredByOverlay();',
    to: '    && root.getClientRects().length > 0;',
  },
  {
    defect: 'an inconclusive hit test reads as COVERED, so ESC quietly stops working',
    file: 'module',
    from: '      return Boolean(hit) && !root.contains(hit);',
    to: '      return !root.contains(hit);',
  },
  {
    defect: 'the card stops honouring a key another surface already claimed',
    file: 'module',
    from: '    if (event.defaultPrevented) return;',
    to: '    /* belt removed */',
  },
  {
    // Anchored past the call so it cannot land on the cockpit disclosure's own
    // stopImmediatePropagation() a few lines below and prove nothing about this.
    defect: 'the radio disclosure returns to stopPropagation, so one ESC does two things',
    file: 'ui',
    from: '      event.stopImmediatePropagation();\n      setRadioDisclosure(false, { returnFocus: true });',
    to: '      event.stopPropagation();\n      setRadioDisclosure(false, { returnFocus: true });',
  },
  {
    defect: 'the "no timer" decision is deleted, so the next editor re-litigates it blind',
    file: 'module',
    from: '   * ACCEPTED, DELIBERATELY NOT TIMED OUT: a surface class that never clears',
    to: '   * (note removed)',
  },
  {
    defect: 'a bounded reveal timer punches the card through a recording in progress',
    file: 'module',
    from: '  const syncToExclusiveSurfaces = () => {\n    if (closing) return;',
    to: '  const syncToExclusiveSurfaces = () => {\n    if (closing) return;\n    globalThis.setTimeout?.(reveal, 45000);',
  },
  {
    defect: 'the accepted no-show vanishes from CURRENT-STATE and reads as a bug',
    file: 'docs',
    from: 'a surface class that never clears means no launcher for that page',
    to: 'the launcher always turns up eventually for that page',
  },
  {
    defect: 'ESC stops naming itself',
    file: 'module',
    from: "      dismiss({ reason: 'esc' });",
    to: '      dismiss();',
  },
  {
    defect: 'the scroll fade promises more list on a card where everything fits',
    file: 'module',
    from: 'choiceList.dataset.scrollable = String(overflows);',
    to: "choiceList.dataset.scrollable = 'true'; void overflows;",
  },
  {
    defect: 'the DISPLAY rail opens on first run again, stealing the impression',
    file: 'ui',
    from: "if (panelId === 'pp-toggles' && stored === null) collapsed = true;",
    to: "if (panelId === 'pp-toggles' && stored === null) collapsed = false;",
  },
  {
    defect: 'the first-run rail default overrides a stored user choice',
    file: 'ui',
    from: "if (panelId === 'pp-toggles' && stored === null) collapsed = true;",
    to: "if (panelId === 'pp-toggles') collapsed = true;",
  },

  // ── The search seams the card drives ──────────────────────────────────────
  {
    defect: 'an interrupted search flight never reports its end',
    file: 'ui',
    from: "        onCancel: () => onArrival?.('cancelled'),\n      });\n      if (this._disposed",
    to: '      });\n      if (this._disposed',
  },
  {
    defect: 'a searched arrival stops flushing the share link',
    file: 'ui',
    from: "          this.shareLinkManager?.flushHash?.();\n          onArrival?.('arrived');\n        },\n        onCancel: () => onArrival?.('cancelled'),\n      });",
    to: "          onArrival?.('arrived');\n        },\n        onCancel: () => onArrival?.('cancelled'),\n      });",
  },
  {
    defect: 'the search field is never settled after a lookup',
    file: 'ui',
    from: '    } finally {\n      this._settleLocationSearchUi(generation);\n    }\n  }\n\n  /**\n   * The landing state',
    to: '    } finally {\n      void generation;\n    }\n  }\n\n  /**\n   * The landing state',
  },
  {
    defect: 'the bubble opens LOCATION but the caret never lands once the tray fades in',
    file: 'ui',
    from: '      window.setTimeout(() => field.focus(), LOCATION_TRAY_FADE_MS);',
    to: '      void LOCATION_TRAY_FADE_MS;',
  },

  // ── Accessibility and the card chrome ─────────────────────────────────────
  {
    defect: 'disabling the focused control drops the keyboard to <body> mid-lookup',
    file: 'module',
    from: "for (const button of controls()) button.setAttribute('aria-disabled', String(next));",
    to: 'for (const button of controls()) button.disabled = next;',
  },
  {
    defect: 'Tab escapes into an app the visitor has not seen yet',
    file: 'module',
    from: "if (event.key !== 'Tab') return;",
    to: 'return;',
  },
  {
    defect: 'ESC no longer dismisses the card',
    file: 'module',
    from: "if (event.key === 'Escape') {",
    to: 'if (false) {',
  },
  {
    defect: 'focus is never returned to where the visitor left it',
    file: 'module',
    from: "if (typeof previouslyFocused?.focus === 'function' && previouslyFocused.isConnected) {",
    to: 'if (false) {',
  },
  {
    defect: 'app hotkeys eat the card keys (bubble instead of capture)',
    file: 'module',
    from: "documentRef.addEventListener('keydown', onKeyDown, true);",
    to: "documentRef.addEventListener('keydown', onKeyDown);",
  },
  {
    defect: 'the card stays clickable through its fade-out (double choice)',
    file: 'css',
    from: '  transition: opacity 220ms ease, transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);\n  /* Inert until revealed AND again while fading out, so a click during the\n     dismiss animation cannot launch a second choice behind the fade. */\n  pointer-events: none;',
    to: '  transition: opacity 220ms ease, transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);',
  },
  {
    defect: 'the card survives Clean-UI and recording mode',
    file: 'css',
    from: 'body.ui-clean-view #first-run-launcher,',
    to: 'body.never-matches-anything #first-run-launcher,',
  },
  {
    defect: 'the flex card defeats [hidden] and sits in the a11y tree pre-reveal',
    file: 'css',
    from: '#first-run-launcher[hidden] {\n  display: none;\n}',
    to: '/* [hidden] rule removed */',
  },
  {
    defect: 'the card loses its viewport cap and clips on a short landscape phone',
    file: 'css',
    from: '  max-height: calc(100dvh - 1.5rem);',
    to: '  /* cap removed */',
  },
  {
    defect: 'the tile list stops scrolling, so tiles overflow the capped card',
    file: 'css',
    // The full four lines: the first two alone first match `.map-legend-items`.
    from: '  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  scroll-behavior: smooth;',
    to: '  /* scroll removed */',
  },
  {
    // Anchored to the card's OWN selectors: style.css has other reduced-motion
    // blocks, and a bare `@media` anchor would mutate one of those instead.
    defect: "the card's reduced-motion opt-out is dropped",
    file: 'css',
    from: '  #first-run-launcher,\n  .first-run-choices button,\n  .first-run-arrow { transition: none; }\n  /* Scrolling a tile into view must not animate either. */\n  .first-run-choices { scroll-behavior: auto; }',
    to: '  .first-run-nothing { transition: none; }',
  },

  // ── Markup and copy ───────────────────────────────────────────────────────
  {
    defect: 'a B tile is dropped from the menu',
    file: 'html',
    from: '      <button type="button" data-first-run-choice="permits">',
    to: '      <button type="button" data-first-run-choice-disabled="permits">',
  },
  {
    defect: 'the B order stops matching the table',
    file: 'html',
    from: '<button type="button" data-first-run-choice="live">',
    to: '<button type="button" data-first-run-choice="zzz-live">',
  },
  {
    defect: 'the "Ne plus afficher" checkbox comes back',
    file: 'html',
    from: '    <div class="first-run-footer">\n',
    to: '    <div class="first-run-footer">\n      <label class="first-run-suppress"><input type="checkbox" data-first-run-suppress /><span>Ne plus afficher</span></label>\n',
  },
  {
    defect: 'the status line stops being a polite live region',
    file: 'html',
    from: 'data-first-run-status role="status" aria-live="polite"',
    to: 'data-first-run-status',
  },
  {
    defect: 'the card is no longer announced as a dialog',
    file: 'html',
    from: '<aside id="first-run-launcher" role="dialog"',
    to: '<aside id="first-run-launcher"',
  },
  {
    defect: 'the shell is marked English on a French page',
    file: 'html',
    from: '<aside id="first-run-launcher" role="dialog"',
    to: '<aside id="first-run-launcher" lang="en" role="dialog"',
  },
  {
    defect: 'the address field stops asking the soft keyboard for a search key',
    file: 'html',
    from: 'data-first-run-address type="search" enterkeyhint="search"',
    to: 'data-first-run-address type="search"',
  },
  {
    defect: '"Autour de moi" ships visible before anyone knows it can work',
    file: 'html',
    from: 'data-first-run-chip="locate" hidden>',
    to: 'data-first-run-chip="locate">',
  },
  {
    defect: 'a straight apostrophe slips into the French copy',
    file: 'html',
    from: 'Qu’est-ce qui est vrai à cette adresse ?',
    to: "Qu'est-ce qui est vrai à cette adresse ?",
  },
  {
    defect: 'a non-breaking space slips into the markup',
    file: 'html',
    from: 'à cette adresse ?</h2>',
    to: 'à cette adresse ?</h2>',
  },
  {
    defect: 'the card states a layer count the page description does not',
    file: 'html',
    from: '59 couches de données publiques · 56 sans clé',
    to: '60 couches de données publiques · 56 sans clé',
  },
  {
    defect: 'the bubble has no element to live in',
    file: 'html',
    from: '  <div id="first-run-hint" hidden></div>\n',
    to: '',
  },

  // ── Startup ordering ──────────────────────────────────────────────────────
  {
    defect: 'the card is revealed before the loading cover yields',
    file: 'main',
    from: "      loadingScreen.classList.add('hidden');",
    to: "      initFirstRunExperience({ styleManager, dataManager, variant: 'A', phoneSheet });\n      loadingScreen.classList.add('hidden');",
  },
  {
    defect: 'the card is revealed mid-descent, over the boot flight',
    file: 'main',
    from: "        whenBootFlightEnds(() => {\n          initFirstRunExperience({ styleManager, dataManager, variant: 'A', phoneSheet });\n        });",
    to: "        initFirstRunExperience({ styleManager, dataManager, variant: 'A', phoneSheet });",
  },
  {
    defect: 'the loading veil waits for the boot flight',
    file: 'main',
    from: '      new Promise((resolve) => setTimeout(resolve, 1000)),\n    ]).finally(() => {',
    to: '      new Promise((resolve) => setTimeout(resolve, 1000)),\n      new Promise((resolve) => whenBootFlightEnds(resolve)),\n    ]).finally(() => {',
  },
  {
    defect: 'the card loses its DataManager and cannot switch a layer on',
    file: 'main',
    from: "initFirstRunExperience({ styleManager, dataManager, variant: 'A', phoneSheet });",
    to: "initFirstRunExperience({ styleManager, variant: 'A', phoneSheet });",
  },

  // ── Voice: schema must not drift ──────────────────────────────────────────
  {
    defect: 'the voice TOOL SCHEMA is edited (a Realtime prompt-cache bust)',
    file: 'vite',
    from: "            'earthquakes',\n            'local-firms',",
    to: "            'earthquakes',\n            'infrastructure-mode',\n            'local-firms',",
  },
  {
    defect: 'the instruction mapping is dropped, so voice cannot reach the named views',
    file: 'vite',
    from: "\n  'NAMED VIEWS are shorthand",
    to: "\n  // 'NAMED VIEWS are shorthand",
  },
];

const originals = new Map();
for (const [key, file] of Object.entries(FILES)) originals.set(key, fs.readFileSync(file, 'utf8'));

/** Write only on a real change: a no-op write still wakes every file watcher. */
const write = (file, next) => {
  if (fs.readFileSync(file, 'utf8') !== next) fs.writeFileSync(file, next);
};
const restoreAll = () => {
  if (DRY) return;
  for (const [key, file] of Object.entries(FILES)) write(file, originals.get(key));
};
process.on('exit', restoreAll);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restoreAll();
    process.exit(130);
  });
}

let caught = 0;
const missed = [];

console.log(`\nFirst-run pin strength — ${MUTATIONS.length} individual reverts${DRY ? ' (anchors only)' : ''}\n`);
for (const { defect, file, from, to } of MUTATIONS) {
  const original = originals.get(file);
  if (!original.includes(from)) {
    missed.push(`${defect} (ANCHOR MISSING — the mutation no longer applies)`);
    console.log(`  \x1b[31mSTALE\x1b[0m ${defect}`);
    continue;
  }
  if (from === to) {
    missed.push(`${defect} (the mutation changes nothing)`);
    console.log(`  \x1b[31mNO-OP\x1b[0m ${defect}`);
    continue;
  }
  if (DRY) {
    caught += 1;
    continue;
  }
  write(FILES[file], original.replace(from, to));
  let red = false;
  let by = '';
  try {
    execFileSync('node', ['--test', '--test-timeout=20000', ...TESTS], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    red = true;
    const failed = String(error.stdout || '').split('\n')
      .filter((line) => line.trim().startsWith('✖') && line.includes('('))
      .map((line) => line.trim().slice(2).split(' (')[0]);
    by = [...new Set(failed)].slice(0, 2).join('; ');
  }
  write(FILES[file], original);
  if (red) {
    caught += 1;
    console.log(`  \x1b[32mRED  \x1b[0m ${defect}\n         caught by: ${by}`);
  } else {
    missed.push(defect);
    console.log(`  \x1b[31mGREEN\x1b[0m ${defect}  <-- no pin covers this`);
  }
}
restoreAll();

console.log(`\n  ${caught}/${MUTATIONS.length} ${DRY ? 'anchors present' : 'defects caught by the pins'}`);
if (missed.length) {
  console.log('\n  uncovered:');
  for (const item of missed) console.log(`    - ${item}`);
}
console.log('');
process.exitCode = missed.length ? 1 : 0;
