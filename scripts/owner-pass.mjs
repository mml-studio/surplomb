#!/usr/bin/env node
/**
 * Print a single-use link that exempts one browser from the hosted trial.
 *
 * The link lives ten minutes and works once; opening it shows one button, and
 * the button writes the `gev_owner` cookie (400 days) for the site and its
 * `www.` name. See « The owner is not a visitor » in src/trialQuota.js.
 *
 * It needs GEV_OWNER_PASS_SECRET, so it runs where the server's environment
 * is — on this deployment, inside the container, over SSH:
 *
 *   ssh vps 'docker exec gev node scripts/owner-pass.mjs'
 *   ssh vps 'docker exec gev node scripts/owner-pass.mjs https://www.surplomb.app'
 *
 * Usage: node scripts/owner-pass.mjs [origin]
 *   origin defaults to GEV_PUBLIC_ORIGIN, then https://surplomb.app.
 */
import { pathToFileURL } from 'node:url';
import { mintOwnerLink, resolveTrialConfig } from '../src/trialQuota.js';

const DEFAULT_ORIGIN = 'https://surplomb.app';

/**
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 * @returns {{code: number, out: string}}
 */
export function ownerPassCommand(argv, env) {
  const config = resolveTrialConfig(env, () => '');
  if (!config.enabled) {
    return { code: 1, out: 'GEV_TRIAL_LIMIT is not set here: there is no trial to exempt anyone from.' };
  }
  if (!config.ownerSecret) {
    return { code: 1, out: 'GEV_OWNER_PASS_SECRET is unset or shorter than 32 characters — owner passes are off.' };
  }
  const origin = argv[0] || String(env.GEV_PUBLIC_ORIGIN || '').trim() || DEFAULT_ORIGIN;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return { code: 1, out: `Not an origin: ${origin}` };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { code: 1, out: `Not an http(s) origin: ${origin}` };
  return {
    code: 0,
    out: `${mintOwnerLink(parsed.origin, config.ownerSecret)}\n(single use, expires in 10 minutes)`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { code, out } = ownerPassCommand(process.argv.slice(2), process.env);
  (code ? console.error : console.log)(out);
  process.exit(code);
}
