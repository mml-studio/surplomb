// First-run card.
//
// The map deliberately does not auto-enable live feeds on every visit: doing so
// would spend optional API quotas, surprise returning operators, and fight share
// links. A new visitor instead gets one compact, explicit invitation once the
// boot flight has landed.
//
// THREE VARIANTS, ONE DOOR (2026-09-17). A asks for an address (the default),
// B offers three questions answered where the camera already is, C shows no
// card at all — only a bubble on the search field. The card bodies and what a
// choice does live in src/firstRunVariants.js, the bubble in
// src/firstRunHint.js. `?welcome=a|b|c` forces one; the caller's `variant`
// picks otherwise. All three pass through the show policy below, so whatever
// suppresses one suppresses them all — the QA fleet's session seed included.
//
// SHOW POLICY (product decision, 2026-09-17 — replaces "every fresh session
// until ticked" of 2026-08-23). Once per browser:
//
//   - a share link never sees it — its author already chose the experience;
//   - `?welcome=0` suppresses, `?welcome=1` (or `=A|B|C`) replays — it outranks
//     BOTH the session flag and the durable one, so support can always demo it;
//   - EVERY close — a choice, Échap, a yield, the bubble's click-away or
//     timeout — writes BOTH keys: the durable one, so the next visit starts on
//     the globe, and the session one, which still holds for this tab when a
//     browser refuses localStorage (and is the key the QA fleet seeds);
//   - there is no "don't show this again" box any more: nothing needs it.
//
// One impression per browser is also what makes the variants comparable: an
// impression is a visitor.

import { mountVariantA, mountVariantB } from './firstRunVariants.js';
import { initFirstRunHint } from './firstRunHint.js';

/** Durable suppression. Written by every close since 2026-09-17. */
export const FIRST_RUN_STORAGE_KEY = 'gev:first-run-mission:v1';
/** Per-session dismissal. Written by every close; scoped to sessionStorage. */
export const FIRST_RUN_SESSION_KEY = 'gev:first-run-mission-session:v1';

/** The variants, in the order the experiment names them. A is the default. */
export const FIRST_RUN_VARIANT_IDS = Object.freeze(['A', 'B', 'C']);

/**
 * The variant `?welcome=` forces, if any. Case-insensitive; anything else
 * (`1`, `0`, absent, unknown) forces nothing.
 * @param {{search?: string}|null} [location]
 * @returns {'A'|'B'|'C'|null}
 */
export function forcedFirstRunVariant(location = globalThis.location) {
  const value = (new URLSearchParams(location?.search || '').get('welcome') || '').toUpperCase();
  return FIRST_RUN_VARIANT_IDS.includes(value) ? value : null;
}

/*
 * CHOICE → APP STATE, AND WHAT IT IS ALLOWED TO PERSIST
 * ─────────────────────────────────────────────────────────────────────────────
 * Product decision: a choice on the card carries the same weight as clicking
 * the toggles it represents — durable where those clicks are durable — but it
 * must never write a preference the visitor did not effectively choose by
 * making it. Layer enablement IS durable in this app (`gev:layer-state:v2`,
 * written by LayerStateCoordinator._commitExplicit only for origin
 * user/voice/tool), so:
 *
 *   TOUCHED, DURABLE      layer enables for the choice's OWN layers, at
 *                         `origin: 'user'` — identical to clicking those rows.
 *                         A switches its address bundle on where the flight
 *                         lands; a B tile switches its layers on where the
 *                         camera already is. Choosing them IS choosing them.
 *   TOUCHED, DURABLE      nothing else. No panel opens: the card used to reveal
 *                         the Context panel for two global missions, and those
 *                         missions are gone.
 *   TOUCHED, SESSION      the camera — A only, through the search box's own
 *                         seam (StyleManager.flyToAddress / locateMe). Never
 *                         persisted by anything. B and C never move it.
 *   NOT TOUCHED           detection mode + density. The reasonable-defaults
 *                         landing owns the BALANCED/50 start
 *                         (FIRST_RUN_DETECTION_PRESET, src/ui.js). A choice
 *                         has no opinion.
 *   NOT TOUCHED           `_detectionUserOverridden`. Setting it would mean "the
 *                         operator hand-edited detection" and would silently
 *                         kill the CRT/NVG/FLIR auto-preset contract for the
 *                         whole session. Choices run through the search seams
 *                         and DataManager.setEnabled, neither of which writes it.
 *   NOT TOUCHED           detection allocation (`gev:detection-allocation:v1`),
 *                         3D aircraft models, scope feather. All are defaults or
 *                         separate durable prefs the visitor did not choose here.
 *                         In particular nothing calls `_setModels3dEnabled` /
 *                         `_setModels3dMode`, which default to origin 'user' and
 *                         would persist a 3D choice nobody made.
 */

/*
 * STORAGE ACCESS IS LAZY AND GUARDED — NEVER A DEFAULT PARAMETER.
 *
 * `globalThis.localStorage` is a GETTER, and in Safari's private mode (and under
 * some enterprise policies) reading it THROWS SecurityError. A default parameter
 * like `storage = globalThis.localStorage` evaluates that getter before the
 * function body starts, so it throws outside every try/catch this module has —
 * the exception escapes, initFirstRunExperience never runs, and the launcher
 * silently never appears. That is the exact opposite of failing open.
 *
 * So the storage AREA is resolved inside a try, at the moment it is used, and an
 * injected stub (tests, callers) short-circuits the global entirely.
 */

/**
 * Resolve a Web Storage area without letting a hostile getter escape.
 * @param {'local'|'session'} kind
 * @param {object|null|undefined} injected Explicit store; `undefined` means "use the global".
 * @returns {{getItem?: Function, setItem?: Function, removeItem?: Function}|null}
 */
function resolveStore(kind, injected) {
  if (injected !== undefined) return injected;
  try {
    return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    // Privacy-restricted storage should not make first launch silent.
    return null;
  }
}

/** Read one key, treating every failure as "nothing stored". */
function readStored(kind, injected, key) {
  try {
    return resolveStore(kind, injected)?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Write one key, best-effort. Never throws; REPORTS whether the value landed so
 * a caller that showed the visitor a promise ("don't show this again") can take
 * it back rather than display a preference nothing stored.
 * @returns {boolean} true only if the value was actually written.
 */
function writeStored(kind, injected, key, value) {
  try {
    const store = resolveStore(kind, injected);
    if (typeof store?.setItem !== 'function') return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove one key, best-effort.
 * @returns {boolean} true only if the removal actually happened.
 */
function removeStored(kind, injected, key) {
  try {
    const store = resolveStore(kind, injected);
    if (typeof store?.removeItem !== 'function') return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide whether the launcher belongs in this page load.
 * @param {object} input
 * @param {boolean} [input.hasShareState]
 * @param {{getItem: Function}|null} [input.storage] Durable (localStorage).
 * @param {{getItem: Function}|null} [input.sessionStorageRef] Per-session.
 * @param {{search?: string}|null} [input.location]
 * @returns {boolean}
 */
export function shouldShowFirstRun({
  hasShareState = false,
  storage,
  sessionStorageRef,
  location = globalThis.location,
} = {}) {
  if (hasShareState) return false;
  const params = new URLSearchParams(location?.search || '');
  if (params.get('welcome') === '0') return false;
  // The demo/support escape hatch outranks both suppressions on purpose.
  if (params.get('welcome') === '1') return true;
  if (FIRST_RUN_VARIANT_IDS.includes((params.get('welcome') || '').toUpperCase())) return true;
  if (readStored('local', storage, FIRST_RUN_STORAGE_KEY) === 'suppressed') return false;
  if (readStored('session', sessionStorageRef, FIRST_RUN_SESSION_KEY) === 'dismissed') return false;
  return true;
}

/**
 * Write (or clear) the durable suppression. Every close writes it; clearing it
 * is for support and tests. Storage is best-effort — a blocked store still
 * closes the card for this session through the session key — and the outcome
 * is RETURNED, so a caller can tell a saved "once" from a refused one.
 * @param {boolean} suppressed
 * @param {{setItem: Function, removeItem?: Function}|null} [storage]
 * @returns {boolean} true if the durable state now matches what was asked.
 */
export function setFirstRunSuppressed(suppressed, storage) {
  return suppressed
    ? writeStored('local', storage, FIRST_RUN_STORAGE_KEY, 'suppressed')
    : removeStored('local', storage, FIRST_RUN_STORAGE_KEY);
}

/**
 * Record that this browser session has seen and closed the launcher.
 * @param {{setItem: Function}|null} [sessionStorageRef]
 * @returns {void}
 */
export function rememberFirstRunSessionDismissed(sessionStorageRef) {
  writeStored('session', sessionStorageRef, FIRST_RUN_SESSION_KEY, 'dismissed');
}

/**
 * Body classes that mean "another surface owns the screen". Each of these also
 * hides the launcher in CSS, and the observer below turns that into a yield —
 * see the ESC ARBITRATION note on initFirstRunExperience.
 */
export const EXCLUSIVE_SURFACE_CLASSES = Object.freeze([
  'cockpit-mode',
  'scene-playback-mode',
  'recording-mode',
  'ui-clean-view',
]);

/**
 * Is some other surface currently claiming the screen?
 * @param {Document} [documentRef]
 * @returns {boolean}
 */
export function exclusiveSurfaceActive(documentRef = globalThis.document) {
  const list = documentRef?.body?.classList;
  if (!list) return false;
  return EXCLUSIVE_SURFACE_CLASSES.some((name) => list.contains(name));
}

/**
 * Wire and reveal the first-run experience.
 *
 * Called once the boot flight has landed (src/main.js), so the card never
 * covers the descent the boot just paid for.
 *
 * @param {object} input
 * @param {object} input.styleManager Initialized StyleManager.
 * @param {object} [input.dataManager] DataManager, for the layers a choice switches on.
 * @param {'A'|'B'|'C'} [input.variant] The assigned variant; `?welcome=` outranks it.
 * @param {((event: object) => void)|null} [input.onEvent] Receives
 *   `{type: 'impression', shell}`, `{type: 'action', kind, outcome, queryLength?, layerIds?}`
 *   and `{type: 'dismiss', via}` — never the typed text, never a coordinate.
 * @param {{selectTab?: Function}|null} [input.phoneSheet] The phone sheet controller (C opens its Recherche tab).
 * @param {Document} [input.documentRef]
 * @param {Storage} [input.storage]
 * @param {Storage} [input.sessionStorageRef]
 * @param {Location} [input.location]
 * @returns {null|{dismiss?: Function, isTopmost?: Function, close?: Function, isOpen?: Function, variant?: string}}
 */
export function initFirstRunExperience({
  styleManager,
  dataManager = styleManager?._dataManager,
  variant = 'A',
  onEvent = null,
  phoneSheet = null,
  documentRef = globalThis.document,
  storage,
  sessionStorageRef,
  location = globalThis.location,
} = {}) {
  const root = documentRef?.getElementById?.('first-run-launcher');
  if (!root || root.dataset.initialized === 'true') return null;
  root.dataset.initialized = 'true';
  const hintHost = documentRef.getElementById('first-run-hint');
  const templates = [...documentRef.querySelectorAll('template[data-first-run-variant]')];
  const templateFor = (id) => templates.find((node) => node.dataset.firstRunVariant === id) || null;
  const assigned = String(variant || '').toUpperCase();
  const chosen = forcedFirstRunVariant(location)
    ?? (FIRST_RUN_VARIANT_IDS.includes(assigned) ? assigned : 'A');
  const template = templateFor(chosen);
  const discardTemplates = () => { for (const node of templates) node.remove(); };

  // ONE door for all three variants: the same decision removes the card AND
  // the bubble, which is what makes the QA fleet's session seed hide C too.
  if (!template || !shouldShowFirstRun({
    hasShareState: styleManager?.hasShareState,
    storage,
    sessionStorageRef,
    location,
  })) {
    root.remove();
    hintHost?.remove();
    discardTemplates();
    return null;
  }

  // A listener that throws must never take the card down with it.
  const emit = (event) => {
    if (typeof onEvent !== 'function') return;
    try {
      onEvent(event);
    } catch (error) {
      console.warn('[First run] Event listener failed:', error);
    }
  };
  // Read off the root the input-mode module already stamped, rather than
  // importing it: the shell is decided long before this runs.
  const phoneShell = documentRef.documentElement?.dataset?.shell === 'phone';
  const shell = phoneShell ? 'phone' : 'desktop';
  const rememberClosed = () => {
    rememberFirstRunSessionDismissed(sessionStorageRef);
    setFirstRunSuppressed(true, storage);
  };

  if (chosen === 'C') {
    root.remove();
    const hint = initFirstRunHint({
      host: hintHost,
      template,
      anchor: phoneShell
        ? documentRef.getElementById('phone-tab-search')
        : documentRef.querySelector('#location-bar .location-toolbar-label'),
      phoneShell,
      openSearch: phoneShell
        ? () => {
          phoneSheet?.selectTab?.('search');
          documentRef.getElementById('location-search')?.focus?.({ preventScroll: true });
        }
        : () => styleManager?.openLocationSearch?.(),
      emit,
      onClose: rememberClosed,
      isBlocked: () => exclusiveSurfaceActive(documentRef),
      tray: phoneShell ? null : documentRef.getElementById('location-bar'),
      documentRef,
    });
    discardTemplates();
    if (!hint) {
      hintHost?.remove();
      return null;
    }
    return { ...hint, variant: chosen };
  }

  const footer = root.querySelector('.first-run-footer');
  root.insertBefore(template.content.cloneNode(true), footer);
  root.dataset.firstRunVariant = chosen;
  hintHost?.remove();
  discardTemplates();

  const status = root.querySelector('[data-first-run-status]');
  const controls = () => [...root.querySelectorAll(
    '[data-first-run-choice], [data-first-run-submit], [data-first-run-chip], [data-first-run-look-around]',
  )];
  const defaultStatus = status?.textContent || '';
  const previouslyFocused = documentRef.activeElement;
  let busy = false;
  let closing = false;
  let mounted = null;

  const focusables = () => [
    ...root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
  ].filter((node) => !node.hasAttribute('disabled') && node.getClientRects().length > 0);

  /**
   * Is something painted OVER the card? A measurable box is not a visible card.
   * The attribution lightbox is a full-screen overlay at `z-index: 200` against
   * this card's 175 and announces itself with NO body class, so it left the
   * launcher measurable but buried: ESC dismissed a card the visitor could not
   * see — and burned the session flag — behind a lightbox that stayed open.
   *
   * Watching one more class would have fixed one more overlay. Hit-testing the
   * card's own centre answers it for ANY overlay, classed or not, shipped or
   * future, which is why this is the general guard and the class list stays the
   * yield mechanism rather than the visibility test.
   *
   * Inconclusive answers count as UNCOVERED on purpose — no elementFromPoint, a
   * zero-sized box, a centre outside the viewport, a null hit. This guard exists
   * to stop the launcher acting while something is demonstrably on top of it; it
   * must never become the reason ESC quietly stops working.
   */
  const coveredByOverlay = () => {
    if (typeof documentRef.elementFromPoint !== 'function') return false;
    const rect = root.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    try {
      const hit = documentRef.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return Boolean(hit) && !root.contains(hit);
    } catch {
      return false;
    }
  };

  /**
   * Is the launcher REALLY the thing on screen right now? Not "did we add the
   * class" — the class survives while CSS hides the card behind an exclusive
   * surface, and a handler that trusts the class alone consumes keys for an
   * invisible element. getClientRects() is empty under `display: none`, which
   * is exactly how every one of those surfaces hides this card; the hit test
   * then covers the overlays that leave the box intact and simply sit on top.
   */
  const isTopmost = () => root.isConnected
    && root.classList.contains('visible')
    && root.getClientRects().length > 0
    && !coveredByOverlay();

  const dismiss = ({ restoreFocus = true, reason = 'esc' } = {}) => {
    if (closing) return;
    closing = true;
    rememberClosed();
    emit({ type: 'dismiss', via: reason });
    mounted?.teardown?.();
    root.classList.remove('visible');
    root.setAttribute('aria-hidden', 'true');
    documentRef.removeEventListener('keydown', onKeyDown, true);
    globalThis.removeEventListener?.('resize', onViewportResize);
    surfaceObserver?.disconnect();
    const remove = () => root.remove();
    root.addEventListener('transitionend', remove, { once: true });
    // `transitionend` never fires under prefers-reduced-motion (no transition),
    // so a bounded fallback is what actually removes the node there.
    globalThis.setTimeout?.(remove, 400);
    // Return the keyboard where it was, not to a node that is being removed —
    // but never when yielding, because the surface taking over owns focus now.
    if (!restoreFocus) return;
    if (typeof previouslyFocused?.focus === 'function' && previouslyFocused.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    } else {
      documentRef.body?.focus?.({ preventScroll: true });
    }
  };

  const setBusy = (next, busyText = 'Un instant…') => {
    busy = next;
    root.dataset.state = next ? 'loading' : 'ready';
    root.setAttribute('aria-busy', String(next));
    // aria-disabled, not `disabled`: disabling the focused button drops focus to
    // <body> mid-lookup and strands a keyboard visitor outside the launcher.
    for (const button of controls()) button.setAttribute('aria-disabled', String(next));
    // Read-only, for the same reason: the field keeps the caret.
    for (const field of root.querySelectorAll('[data-first-run-address]')) field.readOnly = next;
    if (!status) return;
    if (next) {
      delete status.dataset.sticky;
      status.textContent = busyText;
    } else if (status.dataset.sticky !== 'true') {
      status.textContent = defaultStatus;
    }
  };

  // A sticky status survives setBusy(false): it is the answer to what was tried.
  const setStatus = (text) => {
    if (!status) return;
    status.dataset.sticky = 'true';
    status.textContent = text;
  };

  function onKeyDown(event) {
    // THE ARBITRATION RULE: never consume input for a card nobody can see.
    // The observer below normally removes the launcher before another surface
    // finishes engaging, but MutationObserver callbacks are microtasks, so a
    // keydown can still arrive in the window between the class landing and the
    // yield running. This check closes that window deterministically.
    if (closing || !isTopmost()) return;
    // AND THE BELT FOR THE COOPERATIVE HALF. A surface that owns this key marks
    // it handled (preventDefault) and silences the rest of us on the way past
    // (stopImmediatePropagation). If one of them ever ships only the first half,
    // the mark alone still keeps ONE key to ONE action — which is precisely what
    // the compact Radio disclosure did with a plain stopPropagation(), a call
    // that never blocks later listeners on the same document.
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      // ESC is an exit, not a choice: it must work even mid-lookup. The
      // launcher is the topmost surface while it is up, so it consumes the key
      // rather than also closing a panel the visitor cannot see behind it.
      event.preventDefault();
      event.stopPropagation();
      dismiss({ reason: 'esc' });
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep Tab inside the launcher while it is up. The rest of the page is
    // deliberately still live to the mouse, so this stops short of claiming
    // `aria-modal` — it confines the keyboard without asserting the map is inert.
    const order = focusables();
    if (!order.length) return;
    const first = order[0];
    const last = order[order.length - 1];
    const active = documentRef.activeElement;
    // Plain focus(), NOT preventScroll: on a short viewport the tile list
    // scrolls inside the card, and a tile the keyboard just reached has to be
    // brought into view rather than focused somewhere off-screen.
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
  }

  const ctx = {
    root,
    styleManager,
    phoneShell,
    emit,
    setBusy,
    setStatus,
    dismiss,
    isBusy: () => busy || closing,
    isClosed: () => closing,
    // `origin: 'user'` on purpose: a choice on the card is a real person
    // choosing these layers, so it persists exactly as clicking those rows would.
    setLayerEnabled: (layerId) => dataManager.setEnabled(layerId, true, { origin: 'user' }),
  };
  mounted = chosen === 'B' ? mountVariantB(ctx) : mountVariantA(ctx);

  // Capture phase: the app binds its own global hotkeys (including bare letters
  // that cycle detection and styles), and the launcher owns the keyboard first.
  documentRef.addEventListener('keydown', onKeyDown, true);

  // The scroll fade is an affordance, so it may only appear when the list really
  // overflows. On a viewport where all four tiles fit, a faded bottom edge would
  // promise a fifth one that does not exist.
  const choiceList = root.querySelector('.first-run-choices');
  const syncScrollAffordance = () => {
    if (!choiceList) return;
    const overflows = choiceList.scrollHeight > choiceList.clientHeight + 1;
    choiceList.dataset.scrollable = String(overflows);
  };

  let revealed = false;
  const reveal = () => {
    if (revealed || closing) return;
    revealed = true;
    root.hidden = false;
    globalThis.requestAnimationFrame?.(() => {
      if (closing) return;
      root.classList.add('visible');
      syncScrollAffordance();
      mounted?.focusTarget?.focus?.({ preventScroll: true });
      emit({ type: 'impression', shell });
    });
  };

  /*
   * ESC ARBITRATION — the launcher never competes for the key.
   *
   * Two real defects motivated this. Cockpit registers its capture-phase
   * keydown listener at construction, long before this module runs, and calls
   * stopImmediatePropagation() — so with both up, ESC exited Cockpit BEHIND the
   * card. And a Scene starting merely hid the launcher in CSS while its handler
   * stayed armed, so ESC dismissed an invisible launcher (writing the session
   * flag) while the Scene played on.
   *
   * Rather than fight over listener order, the launcher YIELDS. Every exclusive
   * surface announces itself with a body class that already hides this card, so
   * one observer turns "something else took the screen" into "step aside for
   * this session". The stacking question then never arises: the launcher is
   * gone before the other surface can receive a key. And if a surface is
   * already up when this runs, the launcher waits rather than appearing over it.
   *
   * Yielding covers the surfaces that TAKE THE SCREEN and say so. Two more kinds
   * of contender exist, and each is answered where it actually lives:
   *
   *   an overlay that takes the screen SILENTLY — the attribution lightbox sits
   *     at z-index 200 with no class to watch. isTopmost() hit-tests the card's
   *     own centre, so an unclassed overlay disarms the handler exactly like a
   *     classed one, with nothing to keep in step;
   *   a small control that claims only the KEY — a disclosure or popover the
   *     launcher is not hiding behind and must not yield to. Whoever handles ESC
   *     first marks it (preventDefault) and stops the rest (stopImmediatePropagation);
   *     the launcher honours the mark. One key, one action, no ordering fight.
   */
  const yieldToExclusiveSurface = () => {
    if (closing) return;
    // Like any other close, it counts: the visitor saw the card. Focus stays
    // with whatever just took the screen.
    dismiss({ restoreFocus: false, reason: 'yield' });
  };

  /*
   * ACCEPTED, DELIBERATELY NOT TIMED OUT: a surface class that never clears
   * means the launcher never appears in that page load.
   *
   * A "reveal anyway after N seconds" timer was considered and rejected. None of
   * the four classes is restored at startup — every one is toggled by a live
   * action (cockpit entry, a scene run, the recording toggle, the clean-view
   * toggle) — so an already-blocked init is an error path, while a genuinely
   * long recording or clean-view session is completely ordinary. A timer would
   * trade a benign no-show for the launcher punching through a recording in
   * progress, which is the worse of the two failures.
   *
   * And the no-show IS benign: the card stays hidden, the key handler is inert
   * (isTopmost() is false), neither key is written, and the observer is still
   * watching — so it appears the moment the class clears, and a visit that never
   * saw it still gets it next time. Documented in docs/CURRENT-STATE.md.
   */
  const syncToExclusiveSurfaces = () => {
    if (closing) return;
    const blocked = exclusiveSurfaceActive(documentRef);
    if (revealed && blocked) yieldToExclusiveSurface();
    else if (!revealed && !blocked) reveal();
  };

  // A rotated phone changes which tiles fit, so the affordance re-measures.
  const onViewportResize = () => syncScrollAffordance();
  globalThis.addEventListener?.('resize', onViewportResize);

  const surfaceObserver = typeof globalThis.MutationObserver === 'function'
    ? new globalThis.MutationObserver(syncToExclusiveSurfaces)
    : null;
  // Attributes only, no subtree: this is a class watch on one element, so it
  // costs nothing per frame and never asks the render governor for a frame.
  if (documentRef.body) {
    surfaceObserver?.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });
  }
  syncToExclusiveSurfaces();

  return { dismiss, isTopmost, variant: chosen };
}
