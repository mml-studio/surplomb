// The visitor's right to refuse the first-run A/B measurement.
//
// The CNIL audience-measurement exemption holds only if a visitor can object.
// Two ways, both honoured by `assignFirstRunVariant` (src/firstRunAb.js) on the
// next boot — which then shows A, sends nothing, and forgets the draw:
//
//   - the « Ne pas être mesuré » button on /confidentialite, which stores one
//     key in this browser (this module, wired by src/firstRunOptOutPage.js);
//   - the Global Privacy Control signal (`navigator.globalPrivacyControl`),
//     which needs no click at all.
//
// Kept apart from src/firstRunExperience.js on purpose: the privacy page loads
// this and nothing of the globe.

export const FIRST_RUN_OPTOUT_KEY = 'gev:first-run-optout:v1';

/** Resolve localStorage inside a try: Safari's private-mode getter throws. */
function resolveStore(injected) {
  if (injected !== undefined) return injected;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Has this browser refused the measurement?
 * @param {{storage?: Storage|null, nav?: {globalPrivacyControl?: boolean}|null}} [options]
 * @returns {boolean}
 */
export function firstRunMeasureRefused({ storage, nav = globalThis.navigator } = {}) {
  if (nav?.globalPrivacyControl === true) return true;
  try {
    return resolveStore(storage)?.getItem?.(FIRST_RUN_OPTOUT_KEY) === 'refused';
  } catch {
    return false;
  }
}

/**
 * Record (or withdraw) the refusal.
 * @param {boolean} refused
 * @param {Storage|null} [storage]
 * @returns {boolean} true only if the browser kept it.
 */
export function setFirstRunMeasureRefused(refused, storage) {
  try {
    const store = resolveStore(storage);
    if (!store) return false;
    if (refused) store.setItem(FIRST_RUN_OPTOUT_KEY, 'refused');
    else store.removeItem(FIRST_RUN_OPTOUT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The button on the privacy page: says where this browser stands, and flips it.
 * @param {Document} [doc]
 * @param {{storage?: Storage|null, nav?: object|null}} [options]
 * @returns {boolean} Whether a button was found and wired.
 */
export function wireFirstRunOptOut(doc = globalThis.document, { storage, nav = globalThis.navigator } = {}) {
  const button = doc?.querySelector?.('[data-first-run-optout]');
  const status = doc?.querySelector?.('[data-first-run-optout-status]');
  if (!button) return false;
  const paint = (note = '') => {
    const byGpc = nav?.globalPrivacyControl === true;
    const refused = firstRunMeasureRefused({ storage, nav });
    button.textContent = refused ? 'Accepter d’être mesuré' : 'Ne pas être mesuré';
    button.setAttribute('aria-pressed', String(refused));
    button.hidden = byGpc;
    if (!status) return;
    status.textContent = note || (byGpc
      ? 'Votre navigateur envoie le signal Global Privacy Control : il n’est pas mesuré.'
      : refused
        ? 'Ce navigateur n’est pas mesuré.'
        : 'Ce navigateur peut être mesuré.');
  };
  button.addEventListener('click', () => {
    const next = !firstRunMeasureRefused({ storage, nav });
    const kept = setFirstRunMeasureRefused(next, storage);
    paint(kept ? '' : 'Ce navigateur refuse d’enregistrer ce choix.');
  });
  paint();
  return true;
}
