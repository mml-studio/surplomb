/**
 * Is the permit archive still being written? A daily verdict on every family.
 *
 * The archive (`.gev-cache/archive/<family>/<insee>.json`, one file per
 * municipality, plus the family's `sweep.json`) is the one thing the service
 * cannot rebuild: a notice taken off a board never comes back. Until
 * 2026-11-15 nothing watched it. That day an audit found 736 of 1 854 Cart@DS
 * municipalities unread since 22-25 October (their hosts had started refusing
 * robots) and 16 municipal lists stopped, Marseille since 17 October, while
 * every `sweep.json` still said the night's sweep had run. A sweep that runs
 * is not a sweep that reads; this module looks at what each municipality's own
 * file says it last read.
 *
 * The rules are fixed here, before any night is judged:
 * - a family whose `sweep.json` is older than its tolerated lag did not sweep;
 * - a municipality whose `lastDay` is two days or more behind has STOPPED
 *   (one missed night can be a host's bad night; two is a pattern). Stopped
 *   municipalities are grouped by the instance that reads them;
 * - a stop of three days or fewer is NEW, anything older is ONGOING;
 * - an instance the sweep was refused by robots.txt is named as such (once:
 *   on its stop when its municipalities have stopped, on its own before);
 * - a municipality its register names that has no file at all after a sweep
 *   was NEVER ARCHIVED, grouped by instance. Bayonne went so from 2 October to
 *   16 November 2026 and no rule above could see it: a stop needs a file.
 * Any of these makes the verdict `act`; none of them makes it `ok`.
 * Failures of a single night (the stamp's `failed`) are counted, not judged.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { CARTDS_INSTANCES } from '../../src/data/cartdsFeed.js';
import { EPERMIS_INSTANCES } from '../../src/data/epermisFeed.js';
import { MMM_COMMUNES } from '../../src/data/mmmPermitsFeed.js';
import { PERMIT_LISTS } from '../../src/data/permitListsFeed.js';
import { SIRAP_INSTANCES } from '../../src/data/sirapFeed.js';
import { LOCAL_ADS_PORTALS } from '../../src/data/adsFeed.js';
import { portalArchiveFiles } from '../../src/data/portalArchive.js';
import { PUBLICATION_ACTES_COMMUNES } from '../../src/data/publicationActesFeed.js';

/** Days a municipality may lag before it counts as stopped. */
export const STOPPED_AFTER_DAYS = 2;

/** A stop this recent is new. */
export const NEW_STOP_MAX_DAYS = 3;

/**
 * Days a family's `sweep.json` may lag the judged day. Montpellier's
 * open-data edition is swept at ~08:00 and the open-data portals at ~11:00,
 * after the morning check has run, so their stamps are yesterday's at that
 * hour; every board family sweeps at ~00:40.
 */
export const STAMP_LAG_DAYS = Object.freeze({ mmm: 1, portals: 1 });

const SWEEP_STAMP = 'sweep.json';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The municipalities each family's nightly sweep is configured to read, from
 * the same registers `vite.config.js` hands to the sweeps, each with the key of
 * the instance that reads it. Keys are the archive's directory names.
 *
 * @returns {Record<string, Map<string, string>>} INSEE code → instance key.
 */
export function expectedPermitArchive() {
  const owners = (pairs) => new Map(pairs.map(([code, key]) => [String(code).toUpperCase(), key]));
  const ofInstances = (instances) => owners(instances.flatMap((instance) => instance.communes.map((code) => [code, instance.key])));
  return {
    cartds: ofInstances(CARTDS_INSTANCES),
    sirap: ofInstances(SIRAP_INSTANCES),
    epermis: ofInstances(EPERMIS_INSTANCES),
    'permit-lists': owners(PERMIT_LISTS.map((city) => [city.insee, city.key])),
    mmm: owners(MMM_COMMUNES.map((commune) => [commune.insee, 'mmm'])),
    portals: owners(LOCAL_ADS_PORTALS.flatMap((portal) => portalArchiveFiles(portal).map((code) => [code, portal.key]))),
    'publication-actes': owners(PUBLICATION_ACTES_COMMUNES.map((commune) => [commune.insee, 'publication-actes'])),
  };
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Read every family of an archive directory: its stamp and, for each
 * municipality, only what the verdict needs. An unreadable file is counted,
 * never thrown on — it may be the only copy of something.
 *
 * @param {string} dir The archive root, e.g. `.gev-cache/archive`.
 * @returns {Promise<Record<string, {stamp: ?object, communes: Array<object>, unreadable: number}>>}
 */
export async function readPermitArchive(dir) {
  const families = {};
  let names;
  try {
    names = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return families;
  }
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const familyDir = path.join(dir, entry.name);
    const family = { stamp: null, communes: [], unreadable: 0 };
    for (const name of await fsp.readdir(familyDir)) {
      if (!name.endsWith('.json')) continue;
      let document;
      try {
        document = JSON.parse(await fsp.readFile(path.join(familyDir, name), 'utf8'));
      } catch {
        if (name !== SWEEP_STAMP) family.unreadable += 1;
        continue;
      }
      if (name === SWEEP_STAMP) { family.stamp = document; continue; }
      family.communes.push({
        insee: document?.insee ?? name.slice(0, -5),
        instance: document?.instance ?? 'unknown',
        firstDay: document?.firstDay ?? null,
        lastDay: document?.lastDay ?? null,
        rows: Array.isArray(document?.rows) ? document.rows.length : 0,
      });
    }
    families[entry.name] = family;
  }
  return families;
}

/**
 * Judge an archive as read by `readPermitArchive` on `day`.
 *
 * `expected` is what the sweeps are configured to read, family by family
 * (`expectedPermitArchive()` builds it from the registries). A file whose
 * municipality is no longer in its family's register is RETIRED, counted and
 * not judged: the 4 October board rescan moved or dropped a handful, and their
 * files stay because they are history. Without `expected`, every file is judged.
 *
 * @param {Record<string, {stamp: ?object, communes: Array<object>, unreadable: number}>} families
 * @param {string} day The judged day, `YYYY-MM-DD`, in France.
 * @param {Record<string, Map<string, string>|Set<string>>} [expected] INSEE codes each
 *   family sweeps, mapped to the instance that reads them when known.
 * @returns {{day: string, verdict: 'ok'|'act', families: object, problems: Array<object>, text: string}}
 */
export function assessPermitArchive(families, day, expected = {}) {
  if (!DAY_RE.test(day)) throw new Error(`not a day: ${day}`);
  const problems = [];
  const summary = {};
  for (const name of Object.keys(families).sort()) {
    const { stamp, unreadable } = families[name];
    const register = expected[name];
    const communes = register ? families[name].communes.filter((c) => register.has(String(c.insee).toUpperCase())) : families[name].communes;
    const retired = families[name].communes.length - communes.length;
    const neverArchived = register ? register.size - communes.length : null;
    const archived = new Set(communes.map((c) => String(c.insee).toUpperCase()));
    const unarchivedBy = new Map();
    for (const code of register?.keys() ?? []) {
      if (archived.has(code)) continue;
      const instance = (register instanceof Map ? register.get(code) : null) ?? code;
      unarchivedBy.set(instance, (unarchivedBy.get(instance) ?? 0) + 1);
    }
    const stampDay = typeof stamp?.day === 'string' && DAY_RE.test(stamp.day) ? stamp.day : null;
    const stampLag = stampDay ? daysBetween(stampDay, day) : null;
    const swept = stampLag !== null && stampLag <= (STAMP_LAG_DAYS[name] ?? 0);
    if (!swept) problems.push({ kind: 'not-swept', family: name, stampDay });

    let fresh = 0;
    let noDays = 0;
    let rows = 0;
    const stoppedBy = new Map();
    for (const commune of communes) {
      rows += commune.rows;
      if (!commune.lastDay || !DAY_RE.test(commune.lastDay)) { noDays += 1; continue; }
      const lag = daysBetween(commune.lastDay, day);
      if (lag <= (STAMP_LAG_DAYS[name] ?? 0)) fresh += 1;
      if (lag < STOPPED_AFTER_DAYS) continue;
      const group = stoppedBy.get(commune.instance) ?? { communes: 0, since: commune.lastDay };
      group.communes += 1;
      if (commune.lastDay > group.since) group.since = commune.lastDay;
      stoppedBy.set(commune.instance, group);
    }
    const stopped = [...stoppedBy.entries()]
      .map(([instance, group]) => {
        const daysStopped = daysBetween(group.since, day);
        return { family: name, instance, communes: group.communes, since: group.since, daysStopped,
          isNew: daysStopped <= NEW_STOP_MAX_DAYS };
      })
      .sort((a, b) => a.daysStopped - b.daysStopped || b.communes - a.communes || a.instance.localeCompare(b.instance));
    const refused = Array.isArray(stamp?.refused) ? stamp.refused : [];
    // A refused instance's municipalities stop too: name it once, as a stop
    // marked `robots`, and on its own only while it has not stopped yet.
    const refusedNow = new Set(swept ? refused : []);
    for (const stop of stopped) {
      if (refusedNow.has(stop.instance)) stop.robots = true;
      problems.push({ kind: 'stopped', ...stop });
    }
    for (const instance of refusedNow) {
      if (!stoppedBy.has(instance) && !unarchivedBy.has(instance)) problems.push({ kind: 'refused', family: name, instance });
    }
    // Judged only after a sweep: a source registered today has had no night yet.
    if (swept) {
      for (const [instance, count] of [...unarchivedBy.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
        problems.push({ kind: 'never-archived', family: name, instance, communes: count, robots: refusedNow.has(instance) });
      }
    }

    summary[name] = {
      stampDay,
      swept,
      files: communes.length,
      retired,
      neverArchived,
      unreadable,
      noDays,
      fresh,
      rows,
      sweep: stamp ? {
        communes: stamp.communes ?? null,
        read: stamp.read ?? null,
        added: stamp.added ?? null,
        failed: Array.isArray(stamp.failed) ? stamp.failed.length : 0,
        refused: refused.length,
      } : null,
      stoppedCommunes: stopped.reduce((sum, stop) => sum + stop.communes, 0),
      stoppedInstances: stopped.length,
    };
  }
  const verdict = problems.length ? 'act' : 'ok';
  return { day, verdict, families: summary, problems, text: describePermitArchive(day, verdict, summary, problems) };
}

/** Stops listed by name per family; above this, the largest are named and the rest counted. */
export const LISTED_STOPS = 12;

/** A few lines a reader acts on: the verdict, each family, then each problem, newest first. */
export function describePermitArchive(day, verdict, families, problems) {
  const lines = [];
  lines.push(`Permit archive ${day}: ${verdict === 'ok' ? 'OK, nothing to do' : `ACT, ${problems.length} problem(s)`}.`);
  const counts = Object.entries(families).map(([name, f]) => {
    const read = f.sweep ? `${f.sweep.read}/${f.sweep.communes} read` : 'no sweep stamp';
    return `${name} ${read}, ${f.fresh}/${f.files} fresh, +${f.sweep?.added ?? 0} rows`
      + (f.sweep?.failed ? `, ${f.sweep.failed} failed tonight` : '');
  });
  lines.push(`Families: ${counts.join('; ')}.`);
  const notSwept = problems.filter((p) => p.kind === 'not-swept');
  if (notSwept.length) {
    lines.push(`Not swept: ${notSwept.map((p) => `${p.family} (last stamp ${p.stampDay ?? 'none'})`).join(', ')}.`);
  }
  const stops = problems.filter((p) => p.kind === 'stopped');
  const name = (p) => `${p.instance} (${p.communes > 1 ? `${p.communes} municipalities, ` : ''}`
    + `since ${p.since}, ${p.daysStopped} d${p.robots ? ', robots' : ''})`;
  const fresh = stops.filter((p) => p.isNew);
  if (fresh.length) lines.push(`NEW stops: ${fresh.map((p) => `${p.family}/${name(p)}`).join(', ')}.`);
  for (const family of [...new Set(stops.map((p) => p.family))].sort()) {
    const old = stops.filter((p) => !p.isNew && p.family === family);
    if (!old.length) continue;
    const municipalities = old.reduce((sum, p) => sum + p.communes, 0);
    if (old.length <= LISTED_STOPS) {
      lines.push(`Ongoing stops, ${family}: ${old.map(name).join(', ')}.`);
    } else {
      const largest = [...old].sort((a, b) => b.communes - a.communes || a.daysStopped - b.daysStopped).slice(0, 5);
      const robots = old.filter((p) => p.robots).length;
      lines.push(`Ongoing stops, ${family}: ${old.length} instances, ${municipalities} municipalities`
        + `${robots ? `, ${robots} refused by robots.txt` : ''}; largest ${largest.map(name).join(', ')}.`);
    }
  }
  const never = problems.filter((p) => p.kind === 'never-archived');
  if (never.length) {
    lines.push(`Never archived: ${never.map((p) => `${p.family}/${p.instance}`
      + `${p.communes > 1 || p.robots ? ` (${[p.communes > 1 ? `${p.communes} municipalities` : '', p.robots ? 'robots' : ''].filter(Boolean).join(', ')})` : ''}`).join(', ')}.`);
  }
  const refused = problems.filter((p) => p.kind === 'refused');
  if (refused.length) lines.push(`Refused by robots.txt tonight: ${refused.map((p) => `${p.family}/${p.instance}`).join(', ')}.`);
  if (refused.length || stops.some((p) => p.robots) || never.some((p) => p.robots)) {
    lines.push('Robots refusals: `npm run permits:scan -- --recheck-robots` finds the hosts that changed.');
  }
  return lines.join('\n');
}
