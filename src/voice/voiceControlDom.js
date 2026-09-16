/**
 * voiceControlDom.js — the mic panel's markup, and nothing else.
 *
 * WHY IT IS ITS OWN FILE. The voice stack is 360 kB of the boot bundle
 * (measured 2026-09-09 on rollup's module graph: the realtime controller, the
 * action runner, the annotation renderers and the scene director), and none of
 * it is needed to open a map. It is loaded on demand — `lazyVoice.js` — but the
 * PANEL cannot wait for that: it is part of the cockpit, and a mic that
 * materialises a second after everything else reads as a page still loading.
 *
 * So the shell is built at boot, from here, and the controller adopts it later
 * by rebuilding the same markup with `reset: true`. Both callers import THIS
 * function rather than each keeping a copy — a second copy of sixty lines of
 * markup would drift the day someone adds a button, and the drift would show
 * as a control that exists before the voice loads and disappears after.
 *
 * @module voice/voiceControlDom
 */

import { isCoarseInput } from '../inputMode.js';

/**
 * What the mic panel tells the reader to do with it.
 *
 * It lives HERE, next to the markup, because the same sentence is written in
 * three places — the button's `aria-label`, the help tray's text, and the
 * status line — and on a phone all three were wrong: there is no Space key to
 * hold, so the only instructions the app offers named a key that does not
 * exist. A touchscreen session is open-mic with server-side turn detection,
 * which is a toggle, so that is what the words say.
 *
 * @param {boolean} pushToTalkMode
 * @param {boolean} pushToTalkKeyHeld
 * @param {boolean} [coarse] Defaults to the session's input mode.
 * @returns {string}
 */
export function resolveVoiceControlHint(pushToTalkMode, pushToTalkKeyHeld, coarse = isCoarseInput()) {
  if (coarse) return 'Touchez le micro pour parler · touchez à nouveau pour arrêter';
  return pushToTalkMode && pushToTalkKeyHeld
    ? 'Release Space to send'
    : 'Hold Space to speak · click mic to toggle voice';
}

/**
 * The markup below is a template literal, so anything interpolated into an
 * attribute has to survive being read as HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Build (or find) the voice control panel and return its live element handles.
 *
 * @param {{reset?: boolean}} [options] `reset` tears down an existing panel
 *   first — the controller does that so its handles cannot point at nodes a
 *   previous session already abandoned.
 * @returns {object} Named handles onto the panel's parts.
 */
export function createVoiceControl({ reset = false } = {}) {
  let root = document.getElementById('gev-voice-control');
  if (root && reset) {
    root.remove();
    root = null;
  }
  if (!root) {
    root = document.createElement('div');
    root.id = 'gev-voice-control';
    root.dataset.status = 'idle';
    root.dataset.speaker = 'idle';
    root.innerHTML = `
      <div class="gev-voice-heading">
        <div class="gev-voice-kicker">AI AGENT</div>
        <div id="gev-voice-status">OFF</div>
        <!--
          The help tray is the ONLY place that says how the mic is used, and it
          opens on hover or on a focus ring — neither of which a touchscreen
          produces. On a phone the feature was documented in a surface nobody
          could reach. This button is that surface; it is hidden for a cursor,
          which already gets the tray by pointing at the panel.
        -->
        <button id="gev-voice-help-btn" class="gev-voice-help-btn" type="button" aria-label="Aide vocale" aria-expanded="false" aria-controls="gev-voice-help" title="Aide vocale">?</button>
        <div class="gev-voice-cost">
          <button id="gev-voice-tier" class="gev-voice-tier-btn" type="button" aria-pressed="false" title="Voice model tier — applies next session">STD</button>
          <span id="gev-voice-cost-value" class="gev-voice-cost-value" data-level="ok" title="Estimated session cost">~$0.00</span>
        </div>
      </div>
      <button id="gev-voice-button" type="button" aria-label="${escapeAttribute(`Voice control — ${resolveVoiceControlHint(false, false)}`)}" aria-describedby="gev-voice-help">
        <span class="gev-mic-orbit"><img src="/mic.svg" alt="" /></span>
        <span class="gev-mic-label">ON/OFF</span>
      </button>
      <div class="gev-voice-visualizer" aria-hidden="true">
        ${Array.from({ length: 15 }, (_, index) => `<span style="--bar:${index}"></span>`).join('')}
      </div>
      <div class="gev-voice-readout">
        <div id="gev-voice-detail">VOICE STANDBY</div>
      </div>
      <div id="gev-voice-help" class="gev-voice-help-tray" role="tooltip">
        <span class="gev-voice-help-kicker">VOICE CONTROL</span>
        <span class="gev-voice-help-detail">${escapeAttribute(resolveVoiceControlHint(false, false))}</span>
        <ul class="gev-voice-help-examples"></ul>
      </div>
      <div class="gev-voice-transcript" hidden>
        <div class="gev-voice-transcript-row" data-role="heard">
          <span class="gev-voice-transcript-kicker">HEARD</span>
          <span class="gev-voice-transcript-text"></span>
        </div>
        <div class="gev-voice-transcript-row" data-role="said">
          <span class="gev-voice-transcript-kicker">SAID</span>
          <span class="gev-voice-transcript-text"></span>
        </div>
        <div class="gev-voice-transcript-hint" hidden></div>
        <label class="gev-voice-transcript-voice" hidden>
          <span class="gev-voice-transcript-kicker">VOICE</span>
          <select class="gev-voice-picker"></select>
          <button class="gev-voice-preview" type="button" title="Hear this voice">▶</button>
        </label>
      </div>
      <div class="gev-voice-error-tray" role="alert" aria-live="assertive">
        <div class="gev-voice-error-header">
          <span>VOICE SYSTEM ERROR</span>
          <button class="gev-voice-error-dismiss" type="button">DISMISS</button>
        </div>
        <div id="gev-voice-error-detail"></div>
        <div class="gev-voice-error-hint">Check microphone permission and network access, then try again.</div>
      </div>
    `;
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      const locationBar = document.getElementById('location-bar');
      const controlPanel = document.getElementById('control-panel');
      commandDock.appendChild(root);
      if (locationBar) commandDock.insertBefore(locationBar, root);
      if (controlPanel) commandDock.appendChild(controlPanel);
    } else {
      document.body.appendChild(root);
    }
    root.querySelector('.gev-voice-error-dismiss')?.addEventListener('click', () => {
      root.classList.add('error-dismissed');
    });
  }
  return {
    root,
    button: root.querySelector('#gev-voice-button'),
    buttonLabel: root.querySelector('.gev-mic-label'),
    status: root.querySelector('#gev-voice-status'),
    detail: root.querySelector('#gev-voice-detail'),
    helpDetail: root.querySelector('.gev-voice-help-detail'),
    helpExamples: root.querySelector('.gev-voice-help-examples'),
    errorDetail: root.querySelector('#gev-voice-error-detail'),
    errorHint: root.querySelector('.gev-voice-error-hint'),
    transcript: root.querySelector('.gev-voice-transcript'),
    heardText: root.querySelector('[data-role="heard"] .gev-voice-transcript-text'),
    spokenText: root.querySelector('[data-role="said"] .gev-voice-transcript-text'),
    transcriptHint: root.querySelector('.gev-voice-transcript-hint'),
    voiceRow: root.querySelector('.gev-voice-transcript-voice'),
    voicePicker: root.querySelector('.gev-voice-picker'),
    voicePreview: root.querySelector('.gev-voice-preview'),
    helpButton: root.querySelector('#gev-voice-help-btn'),
    tierButton: root.querySelector('#gev-voice-tier'),
    costValue: root.querySelector('#gev-voice-cost-value'),
  };
}
