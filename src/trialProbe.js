// One read of `/api/trial` per page, shared.
//
// Three boot-time readers want the same answer: the voice crown
// (src/voicePremium.js); when the hosted A/B test runs, the first-run card
// (src/firstRunAb.js) — which has to know whether the test is on BEFORE it
// shows anything; and the list of sources the deployment switched off
// (`sourcesOff`, src/nonCommercialSources.js, read in src/main.js). One request
// serves all three: the edge in front of the hosted origin counts `/api` calls
// per address, and a boot already makes about six.
//
// The probe starts early (src/main.js) and never rejects: a failed or absent
// endpoint reads as `null`, which every caller already treats as "no trial, no
// test". `within(ms)` bounds the wait for a caller that must not hold the page.
//
// The waitlist card does NOT use it: it opens after the trial has been spent,
// and needs today's count, not the boot's.

export const TRIAL_PROBE_URL = '/api/trial';

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Function} [options.setTimer]
 * @param {Function} [options.clearTimer]
 * @returns {{read: () => Promise<object|null>, within: (ms: number) => Promise<object|null>}}
 */
export function createTrialProbe({
  fetchImpl = (...args) => globalThis.fetch(...args),
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
} = {}) {
  let pending = null;
  const read = () => {
    pending ??= Promise.resolve()
      .then(() => fetchImpl(TRIAL_PROBE_URL, { cache: 'no-store', headers: { Accept: 'application/json' } }))
      .then((response) => (response?.ok ? response.json() : null))
      .then((body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : null))
      .catch(() => null);
    return pending;
  };
  const within = (ms) => new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimer(() => finish(null), ms);
    read().then((body) => {
      clearTimer(timer);
      finish(body);
    });
  });
  return { read, within };
}

/** The page's probe. */
export const trialProbe = createTrialProbe();
