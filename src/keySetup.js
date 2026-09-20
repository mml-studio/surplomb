/**
 * The POWER UP surface — paste a key, get a power.
 *
 * A small chip sits bottom-right whenever the app is running under the dev
 * server with keys still missing. It opens a dialog rendered ENTIRELY from
 * GET /api/setup/status (the registry lives in src/keySetupCore.mjs and this
 * module never duplicates it): one row per key, what it unlocks, where to get
 * it, and a paste field. SAVE posts to /api/setup/keys, which writes the
 * repo-root .env and restarts the dev server — Vite's client then reloads the
 * page itself, and the pasted key is simply *on*. No hand-edited env files.
 *
 * The surface self-destructs where it cannot work: a prod build (no endpoint)
 * or a LAN visitor (loopback-only endpoint) fails the status fetch, and both
 * the chip and the dialog are removed outright.
 *
 * Every word it prints comes from `src/keySetup.i18n.js`, read at call time.
 * What a key unlocks arrives from the server in English — the registry runs in
 * Node, which has no locale — and is relabelled here through `labelFor`.
 */

import { labelFor } from './i18n/messages.js';
import messages, { KEY_UNLOCKS } from './keySetup.i18n.js';

/** Chip label — pure, exported for tests. */
export function keySetupChipLabel(status) {
  const missing = Math.max(0, (status?.total || 0) - (status?.setCount || 0));
  const m = messages();
  return missing > 0 ? m.chip(missing) : m.chipDone;
}

/**
 * Collect a POST body from field descriptors — pure, exported for tests.
 * @param {Array<{envVar: string, value: string}>} fields
 * @returns {Record<string, string>} non-empty trimmed values only
 */
export function collectKeyUpdates(fields) {
  const updates = {};
  for (const field of fields || []) {
    const value = String(field?.value ?? '').trim();
    if (value && field?.envVar) updates[field.envVar] = value;
  }
  return updates;
}

/**
 * After the FIRST Google key lands, the restart's reload should boot the
 * photoreal default — not faithfully restore the auto-selected keyless OSM
 * basemap from the URL's live share hash. Strips only `map=osm`: a stack under
 * any other name was chosen or shared on purpose and survives, and so does
 * everything else in the hash (camera, style, layers). Pure, exported for tests.
 * @param {string} hash Location hash without the leading '#'.
 * @returns {string|null} The rewritten hash, or null when there is nothing to strip.
 */
export function stripKeylessBasemapFromHash(hash) {
  if (!hash) return null;
  try {
    const params = new URLSearchParams(hash);
    if (!['osm', 'esri-imagery'].includes(params.get('map'))) return null;
    params.delete('map');
    return params.toString();
  } catch {
    return null;
  }
}

const TIER_DOTS = Object.freeze({ metered: '🔴', free: '🟡' });

/** Build one key row. All content is our own registry text, set via textContent. */
function buildRow(documentRef, key) {
  const m = messages();
  const row = documentRef.createElement('section');
  row.className = 'key-setup-row';
  row.dataset.keyId = key.id;
  row.dataset.set = String(Boolean(key.set));
  if (key.managed) row.dataset.managed = key.managed;
  const external = key.managed === 'external';

  const head = documentRef.createElement('div');
  head.className = 'key-setup-row-head';
  const led = documentRef.createElement('span');
  led.className = 'key-setup-led';
  led.setAttribute('aria-hidden', 'true');
  const title = documentRef.createElement('strong');
  title.textContent = key.title;
  const tier = documentRef.createElement('span');
  tier.className = 'key-setup-tier';
  tier.textContent = TIER_DOTS[key.tier] || '';
  tier.title = key.tier === 'metered' ? m.tierMetered : m.tierFree;
  head.append(led, title, tier);
  if (key.clientExposed) {
    const exposed = documentRef.createElement('span');
    exposed.className = 'key-setup-exposed';
    exposed.textContent = m.browserSide;
    exposed.title = m.browserSideTitle;
    head.append(exposed);
  }
  if (external) {
    // Externally supplied credentials (shell env, Keychain, a launcher) are
    // facts this panel reports, never values it rewrites or deletes.
    const badge = documentRef.createElement('span');
    badge.className = 'key-setup-external';
    badge.textContent = m.external;
    badge.title = m.externalTitle;
    head.append(badge);
  }
  const get = documentRef.createElement('a');
  get.className = 'key-setup-get';
  get.href = key.getUrl;
  get.target = '_blank';
  get.rel = 'noopener noreferrer';
  get.textContent = key.set ? m.manage : m.getKey;
  head.append(get);

  const unlocks = documentRef.createElement('p');
  unlocks.className = 'key-setup-unlocks';
  // The server sends the registry's English; a known id is relabelled, an
  // unknown one is shown exactly as it arrived rather than as a blank line.
  unlocks.textContent = labelFor(KEY_UNLOCKS, key.id) === key.id ? key.unlocks : labelFor(KEY_UNLOCKS, key.id);

  row.append(head, unlocks);
  if (!external) {
    const fields = documentRef.createElement('div');
    fields.className = 'key-setup-fields';
    for (const envVar of key.envVars) {
      const input = documentRef.createElement('input');
      // Passwords-style so a pasted key never shows on a shared or recorded
      // screen — this app gets screen-recorded a lot.
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.envVar = envVar;
      input.setAttribute('aria-label', envVar);
      input.placeholder = key.set ? m.savedPlaceholder(envVar) : m.pastePlaceholder(envVar);
      fields.append(input);
    }
    if (key.managed === 'file') {
      const remove = documentRef.createElement('button');
      remove.type = 'button';
      remove.className = 'key-setup-remove';
      remove.dataset.keySetupRemove = JSON.stringify(key.envVars);
      remove.textContent = m.remove;
      remove.title = m.removeTitle(key.title);
      fields.append(remove);
    }
    row.append(fields);
  }
  return row;
}

/**
 * Wire the chip + dialog. Fire-and-forget from main.js; resolves to null when
 * the surface has no business existing (prod build, LAN visitor, no markup).
 */
export async function initKeySetup({ documentRef = globalThis.document, fetchImpl } = {}) {
  const chip = documentRef?.getElementById?.('key-setup-chip');
  const root = documentRef?.getElementById?.('key-setup');
  if (!chip || !root || root.dataset.initialized === 'true') return null;
  root.dataset.initialized = 'true';
  const doFetch = fetchImpl || globalThis.fetch?.bind(globalThis);

  let status = null;
  try {
    const response = await doFetch('/api/setup/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    status = await response.json();
  } catch {
    // Prod build or non-loopback visitor: the surface cannot function, so it
    // does not exist. (The README covers .env for headless/self-host setups.)
    chip.remove();
    root.remove();
    return null;
  }

  const rowsHost = root.querySelector('[data-key-setup-rows]');
  const applyButton = root.querySelector('[data-key-setup-apply]');
  const closeButton = root.querySelector('[data-key-setup-close]');
  const chipLabel = chip.querySelector('[data-key-setup-chip-label]') || chip;
  const statusLine = root.querySelector('[data-key-setup-status]');
  const defaultStatusText = statusLine?.textContent || '';
  let busy = false;
  let open = false;
  let previouslyFocused = null;

  const render = (nextStatus) => {
    status = nextStatus;
    chipLabel.textContent = keySetupChipLabel(status);
    // Fully powered is the owner's clean screen: the chip retires. The dialog
    // stays reachable this session (and via ?setup=1) to swap or verify keys.
    chip.hidden = status.setCount >= status.total;
    if (!rowsHost) return;
    rowsHost.textContent = '';
    for (const key of status.keys || []) rowsHost.append(buildRow(documentRef, key));
  };

  const visible = () => root.isConnected
    && root.classList.contains('visible')
    && root.getClientRects().length > 0;

  const focusables = () => [
    ...root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
  ].filter((node) => !node.hasAttribute('disabled') && node.getClientRects().length > 0);

  const onKeyDown = (event) => {
    if (!open || !visible()) return;
    // Cooperative ESC contract (see firstRunExperience.js): whoever handles a
    // key first marks it, and everyone else honours the mark.
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const order = focusables();
    if (!order.length) return;
    const first = order[0];
    const last = order[order.length - 1];
    const active = documentRef.activeElement;
    if (!root.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openDialog = () => {
    if (open) return;
    open = true;
    previouslyFocused = documentRef.activeElement;
    root.hidden = false;
    documentRef.addEventListener('keydown', onKeyDown, true);
    globalThis.requestAnimationFrame?.(() => {
      if (!open) return;
      root.classList.add('visible');
      root.querySelector('input')?.focus?.({ preventScroll: true });
    });
  };

  const close = () => {
    if (!open) return;
    open = false;
    documentRef.removeEventListener('keydown', onKeyDown, true);
    root.classList.remove('visible');
    const hide = () => { if (!open) root.hidden = true; };
    root.addEventListener('transitionend', hide, { once: true });
    globalThis.setTimeout?.(hide, 400);
    if (statusLine) statusLine.textContent = defaultStatusText;
    if (typeof previouslyFocused?.focus === 'function' && previouslyFocused.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };

  const say = (text) => { if (statusLine) statusLine.textContent = text; };

  const storeLabel = () => (status?.store === 'pinokio-environment'
    ? messages().storeApp
    : messages().storeEnv);

  /**
   * POST the updates, then say what happened.
   * @param {Record<string, string|null>} updates
   * @param {'savedTo'|'removedFrom'} done Which sentence closes the exchange:
   *   the whole sentence is one message per language, never a verb glued to a
   *   store name (docs/i18n/CONVENTIONS.md § 2).
   */
  const submitUpdates = async (updates, done) => {
    if (busy) return;
    const googleWasUnset = !status?.keys?.find((key) => key.id === 'google-maps')?.set;
    busy = true;
    applyButton?.setAttribute('aria-disabled', 'true');
    say(messages().saving);
    try {
      const response = await doFetch('/api/setup/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        say(payload.error || messages().saveFailedStatus(response.status));
        return;
      }
      for (const input of root.querySelectorAll('input[data-env-var]')) input.value = '';
      render(payload.status);
      if (googleWasUnset && payload.saved?.includes('GOOGLE_MAPS_API_KEY')) {
        const strip = () => {
          try {
            const next = stripKeylessBasemapFromHash(globalThis.location?.hash?.slice(1) || '');
            if (next !== null) globalThis.history?.replaceState?.(null, '', `#${next}`);
          } catch {
            // Continuity is a nicety, never a blocker.
          }
        };
        strip();
        // The live share writer may re-serialize the still-OSM stack before
        // the restart's reload lands, so strip again at the door.
        globalThis.addEventListener?.('pagehide', strip, { once: true });
      }
      say(messages()[done](storeLabel()));
    } catch (error) {
      say(messages().saveFailed(error?.message || error));
    } finally {
      busy = false;
      applyButton?.setAttribute('aria-disabled', 'false');
    }
  };

  const onApply = async () => {
    if (busy) return;
    const inputs = [...root.querySelectorAll('input[data-env-var]')];
    const updates = collectKeyUpdates(
      inputs.map((input) => ({ envVar: input.dataset.envVar, value: input.value })),
    );
    if (!Object.keys(updates).length) {
      say(messages().pasteFirst);
      return;
    }
    await submitUpdates(updates, 'savedTo');
  };

  chip.addEventListener('click', openDialog);
  closeButton?.addEventListener('click', close);
  applyButton?.addEventListener('click', onApply);
  // Remove buttons are rendered per row; delegate so re-renders stay wired.
  rowsHost?.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-key-setup-remove]');
    if (!button || busy) return;
    let envVars = [];
    try {
      envVars = JSON.parse(button.dataset.keySetupRemove || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(envVars) || !envVars.length) return;
    // Removal is destructive and — behind a framing defense that should already
    // stop it — a clickjack target. A confirm turns a single aligned click into
    // a deliberate two-step the lure cannot pre-satisfy.
    const ok = typeof globalThis.confirm !== 'function'
      || globalThis.confirm(messages().confirmRemove);
    if (!ok) return;
    void submitUpdates(
      Object.fromEntries(envVars.map((name) => [name, null])),
      'removedFrom',
    );
  });

  render(status);

  // Re-entry for a fully-keyed setup, demos, and support: ?setup=1 opens the
  // dialog even though the chip has retired.
  try {
    if (new URLSearchParams(globalThis.location?.search || '').get('setup') === '1') openDialog();
  } catch {
    // An unparsable location never blocks init.
  }

  return { open: openDialog, close, render };
}
