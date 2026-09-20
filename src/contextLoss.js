/**
 * contextLoss.js — the one failure that ends the session in English.
 *
 * ── WHAT HAPPENS TODAY ──────────────────────────────────────────────────────
 *
 * A browser may take a WebGL context back at any moment: iOS does it under
 * memory pressure, Android does it when the tab goes to the background and the
 * GPU is wanted elsewhere, and every desktop does it when a driver resets.
 * CesiumJS listens for none of this. It has no `webglcontextlost` handler
 * anywhere: the next `render()` throws, `CesiumWidget` catches the throw and
 * replaces the canvas with its own English panel — "An error occurred while
 * rendering. Rendering has stopped." — and the only cure is a reload the
 * reader has to think of themselves, on a page whose interface is in French
 * and whose globe has just turned into a grey rectangle.
 *
 * ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────
 *
 * Catch the event before Cesium can throw, stop the render loop so nothing
 * tries to draw on a dead context, and then decide — with the same three
 * questions `src/staleBuildRecovery.js` asks about a stale chunk, because it
 * is the same question: may this tab reload itself without being asked?
 *
 *   `countdown` — the reader is looking at it and the budget is free. Say what
 *                 happened, in French, and reload in six seconds unless they
 *                 stop it. This is the common case and the path that makes
 *                 doing nothing the working path.
 *   `defer`     — the tab is hidden. A countdown nobody can see is not consent,
 *                 and a tab in the background is exactly where a phone loses
 *                 its context. Reload when they come back.
 *   `manual`    — the budget is spent, or storage refused to hold the mark
 *                 (Safari private mode). Offer the button and do nothing else:
 *                 a context that dies again right after a reload is a reload
 *                 loop, and a loop is worse than a still picture.
 *
 * The budget is its own key, not the stale-build one. See
 * {@link CONTEXT_LOST_RELOAD_STORAGE_KEY}: sharing it would let a chunk 404 in
 * the morning strand a reader on a dead canvas in the afternoon.
 *
 * ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
 *
 * No `webglcontextrestored` path. Restoring a context means rebuilding every
 * texture, buffer, shader and tile the scene holds, and Cesium has no API that
 * does it — a half-restored scene is a scene that lies about what is on it.
 * A reload is the honest recovery, and it is the one this file automates.
 *
 * @module contextLoss
 */

import {
  CONTEXT_LOST_RELOAD_STORAGE_KEY,
  STALE_BUILD_COUNTDOWN_MS,
  STALE_BUILD_MANUAL_DWELL_MS,
  claimStaleBuildAutoReload,
  staleBuildSecondsLeft,
} from './staleBuildRecovery.js';
import messages from './contextLoss.i18n.js';

export { CONTEXT_LOST_RELOAD_STORAGE_KEY };

/**
 * Which of the three recoveries a lost context gets.
 *
 * Pure, and separate from the wiring below, because the whole decision is four
 * lines of policy that a test can drive and a live GPU cannot.
 *
 * @param {{visibility?: string, claimed?: boolean}} input
 * @returns {'countdown'|'defer'|'manual'}
 */
export function contextLossPlan({ visibility = 'visible', claimed = false } = {}) {
  if (visibility !== 'visible') return 'defer';
  return claimed ? 'countdown' : 'manual';
}

/**
 * The notice, in the interface's own language.
 *
 * Says WHAT happened before what will be done about it: a reader whose globe
 * just went grey is owed the cause, and "le système" is the honest actor —
 * nothing the app or the reader did caused this.
 *
 * @param {{plan: string, secondsLeft?: number}} input
 * @returns {string}
 */
export function contextLossNotice({ plan, secondsLeft = 0 }) {
  const m = messages();
  return plan === 'countdown' ? m.countdown(secondsLeft) : m.manual;
}

/**
 * Listen for the context going away, and handle it.
 *
 * @param {object} viewer - Cesium viewer.
 * @param {object} [options]
 * @param {(text: string, options: object) => void} [options.showNotice] - The
 *   toast, as `StyleManager.showNotice`.
 * @param {() => void} [options.reload] - Injected so the test never navigates.
 * @param {{getItem: Function, setItem: Function}|null} [options.storage]
 * @param {() => number} [options.now]
 * @param {number} [options.countdownMs]
 * @returns {{destroy: () => void, getDiagnostics: () => object}}
 */
export function installContextLossRecovery(viewer, {
  showNotice = null,
  reload = () => globalThis.location?.reload?.(),
  storage = sessionStorageRef(),
  documentRef = globalThis.document,
  now = () => Date.now(),
  countdownMs = STALE_BUILD_COUNTDOWN_MS,
} = {}) {
  const canvas = viewer?.scene?.canvas;
  const diagnostics = { losses: 0, plan: null, reloaded: false };
  let timer = null;
  let deferred = false;
  let destroyed = false;

  const stopTimer = () => {
    if (timer !== null) { clearInterval(timer); timer = null; }
  };

  const doReload = () => {
    stopTimer();
    diagnostics.reloaded = true;
    reload();
  };

  const onVisible = () => {
    if (destroyed || !deferred) return;
    if (documentRef?.visibilityState !== 'visible') return;
    deferred = false;
    doReload();
  };

  const onLost = (event) => {
    if (destroyed) return;
    // WITHOUT THIS the browser never fires `webglcontextrestored` and, more to
    // the point, Cesium's next frame throws into its own English panel. The
    // default action is what has to be prevented, not the propagation.
    event?.preventDefault?.();
    // Nothing may draw on a dead context. `useDefaultRenderLoop = false` is
    // also what `main.js` uses to suspend a hidden tab, so the two paths agree.
    if (viewer) viewer.useDefaultRenderLoop = false;
    diagnostics.losses += 1;
    console.warn('[contextLoss] the WebGL context was taken back by the system');

    const visibility = documentRef?.visibilityState ?? 'visible';
    const claimed = claimStaleBuildAutoReload({
      storage,
      nowMs: now(),
      visibility,
      voiceStatus: documentRef?.getElementById?.('gev-voice-control')?.dataset?.status || null,
      storageKey: CONTEXT_LOST_RELOAD_STORAGE_KEY,
    });
    const plan = contextLossPlan({ visibility, claimed });
    diagnostics.plan = plan;

    if (plan === 'defer') {
      // No notice: there is nobody to read it, and one shown now would be
      // stale by the time the tab comes back. The reload happens on return.
      deferred = true;
      return;
    }
    if (plan === 'manual') {
      showNotice?.(contextLossNotice({ plan }), {
        owner: 'context-lost',
        durationMs: STALE_BUILD_MANUAL_DWELL_MS,
        action: { label: messages().reload, onClick: doReload },
      });
      return;
    }

    const deadline = now() + countdownMs;
    const render = () => {
      showNotice?.(
        contextLossNotice({ plan: 'countdown', secondsLeft: staleBuildSecondsLeft(deadline, now()) }),
        {
          owner: 'context-lost',
          durationMs: Infinity,
          action: {
            label: messages().cancel,
            onClick: () => {
              // The reader said no. The cure stays in reach and stops acting
              // on its own — the same shape as a declined stale-build reload.
              stopTimer();
              diagnostics.plan = 'manual';
              showNotice?.(contextLossNotice({ plan: 'manual' }), {
                owner: 'context-lost',
                durationMs: STALE_BUILD_MANUAL_DWELL_MS,
                action: { label: messages().reload, onClick: doReload },
              });
            },
          },
        },
      );
    };
    render();
    // Quarter-second ticks so the printed second is never a second stale.
    timer = setInterval(() => {
      if (now() >= deadline) doReload();
      else render();
    }, 250);
  };

  canvas?.addEventListener?.('webglcontextlost', onLost, false);
  documentRef?.addEventListener?.('visibilitychange', onVisible);

  return {
    destroy() {
      destroyed = true;
      stopTimer();
      canvas?.removeEventListener?.('webglcontextlost', onLost, false);
      documentRef?.removeEventListener?.('visibilitychange', onVisible);
    },
    getDiagnostics: () => ({ ...diagnostics }),
  };
}

/** `sessionStorage` that never throws — Safari private mode does. */
function sessionStorageRef() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}
