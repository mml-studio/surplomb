/**
 * @module medecinsNames
 *
 * Doctors' names: which file they come from, which of them may be shown, and
 * the one rule that keeps them out of every other file.
 *
 * Server and build only. The browser never imports this: it receives a name
 * list per address from `/api/medecins-fr/praticiens`, already filtered.
 *
 * ── Why the names are not in the repository ─────────────────────────────────
 *
 * The CNAM publishes the *Annuaire santé Ameli* every week, and a doctor who
 * corrects their entry, or leaves private practice, is corrected there. A copy
 * frozen in git follows none of it: `praticiens.jsonl.gz` was committed from
 * the 2026-08-17 edition and served unchanged for five weeks. A reuser of
 * published personal data becomes a controller of its own (CNIL guidance on
 * reuse), owes accuracy (GDPR art. 5(1)(d)) and must honour an objection
 * (art. 21) — none of which a public commit can do. So the names are now
 * built by each deployment into its own cache volume, rebuilt weekly, and
 * filtered through a suppression list on every request that serves them.
 *
 * ── The invariant ───────────────────────────────────────────────────────────
 *
 * **A name travels in `praticiens.jsonl` and nowhere else.** That is what makes
 * `medecins.json` safe to keep in git, to cache, and to serve without asking
 * the suppression list. The register breaks it in one place, and the build
 * repairs it with `addressNamesPractitioner`.
 */

import { SITE_CP } from './medecinsFrFeed.js';

/** `adresseRegistre` — the register's own `cp ville` when BAN disagrees. */
const SITE_REGISTRE = 11;

/**
 * Where a deployment keeps what it builds, relative to the app's root.
 *
 * Under `.gev-cache/`, which the hosted stack mounts as a named volume: it
 * survives redeploys and never enters an image or a commit. The two env
 * variables exist for a self-hosted instance that keeps its data elsewhere.
 */
export const MEDECINS_PACK_SUBDIR = Object.freeze(['.gev-cache', 'medecins-fr', 'pack']);
export const MEDECINS_SUPPRESS_SUBPATH = Object.freeze(['.gev-cache', 'medecins-fr', 'suppress.txt']);

/**
 * The two runtime paths, resolved against `root` unless the environment says
 * otherwise. `join` and `resolve` are passed in so this stays a pure module.
 *
 * @param {string} root
 * @param {Record<string, string|undefined>} env
 * @param {{join:(...parts:string[])=>string, resolve:(...parts:string[])=>string}} pathApi
 */
export function medecinsRuntimePaths(root, env, pathApi) {
  return {
    packDir: env.GEV_MEDECINS_PACK_DIR
      ? pathApi.resolve(root, env.GEV_MEDECINS_PACK_DIR)
      : pathApi.join(root, ...MEDECINS_PACK_SUBDIR),
    suppressPath: env.GEV_MEDECINS_SUPPRESS
      ? pathApi.resolve(root, env.GEV_MEDECINS_SUPPRESS)
      : pathApi.join(root, ...MEDECINS_SUPPRESS_SUBPATH),
  };
}

/**
 * Fold a name to what two spellings of the same person share: no accents, no
 * case, no punctuation. `Dupont-Lefèvre Hélène` and `DUPONT LEFEVRE HELENE`
 * are the same entry; the register writes the second.
 */
export function foldPractitionerName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * The comparison key of a name: its folded words, in alphabetical order.
 *
 * ORDER-BLIND, because an objection arrives as "Dr Jean Dupont" and the
 * register writes `DUPONT JEAN`. WORD-EXACT, because `DUPONT JEAN PIERRE` is
 * somebody else: a list that swept every name containing `DUPONT JEAN` would
 * hide namesakes who asked for nothing.
 */
export function practitionerNameKey(value) {
  return foldPractitionerName(value).split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Read the suppression list.
 *
 * One practitioner per line, as the directory spells the name, optionally
 * narrowed to the postal codes that start with a prefix:
 *
 *     # 2026-09-22, objection received by email
 *     DUPONT JEAN
 *     MARTIN CLAIRE ; 75011
 *     DURAND PAUL ; 63
 *
 * A malformed prefix does not narrow anything: the entry then applies
 * everywhere. Hiding a namesake too is the safe failure; showing the person
 * who objected is not.
 *
 * @param {string} text
 * @returns {Array<{key:string, scope:string}>}
 */
export function parseSuppressionList(text) {
  const entries = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [namePart, scopePart = ''] = line.split(';');
    const key = practitionerNameKey(namePart);
    if (!key) continue;
    const scope = scopePart.replace(/\s+/g, '').toUpperCase();
    entries.push({ key, scope: /^\d[0-9AB]{0,4}$/.test(scope) ? scope : '' });
  }
  return entries;
}

/**
 * Index the list by name key. A key with an empty scope applies everywhere.
 *
 * @param {Array<{key:string, scope:string}>} entries
 * @returns {{size:number, byKey:Map<string, string[]>}}
 */
export function buildSuppressionIndex(entries = []) {
  const byKey = new Map();
  for (const { key, scope } of entries) {
    const scopes = byKey.get(key);
    if (scopes) scopes.push(scope);
    else byKey.set(key, [scope]);
  }
  return { size: entries.length, byKey };
}

export const EMPTY_SUPPRESSION = Object.freeze(buildSuppressionIndex([]));

function siteInScope(site, scope) {
  if (!scope) return true;
  return String(site?.[SITE_CP] ?? '').startsWith(scope)
    || String(site?.[SITE_REGISTRE] ?? '').startsWith(scope);
}

/** Whether one name, at one site, is on the list. */
export function isSuppressed(index, name, site) {
  if (!index?.size) return false;
  const scopes = index.byKey.get(practitionerNameKey(name));
  return Boolean(scopes?.some((scope) => siteInScope(site, scope)));
}

/**
 * The practitioners of one site, minus the suppressed ones.
 *
 * The WHOLE entry goes — name, civility, specialty, sector — not only the
 * name: a line reading "Dr —, ophthalmologist, sector 2" at a one-doctor
 * address still says who it is. The site's own counts are left alone; they are
 * the register's arithmetic and name nobody.
 *
 * @param {Array<Array>} practitioners `praticiens.jsonl` entries
 * @param {Array} site the matching `sites[]` tuple
 * @param {{size:number, byKey:Map<string, string[]>}} index
 */
export function withoutSuppressed(practitioners, site, index) {
  if (!Array.isArray(practitioners)) return [];
  if (!index?.size) return practitioners;
  return practitioners.filter((entry) => !isSuppressed(index, entry?.[0], site));
}

/**
 * Does a names file belong to a pack?
 *
 * Line N of `praticiens.jsonl` describes `sites[N]`, with no key to join on,
 * so a names file from another build attaches every name to the wrong address.
 * A pack written by the current build declares `praticiens: {lignes, sha256}`;
 * the one committed on 2026-09-01 declares nothing, and falls back to the line
 * count, which is all it ever had.
 *
 * @param {{declared?:?{lignes?:number, sha256?:string}, lines:number, siteCount:number, digest?:?string}} input
 * @returns {{ok:boolean, reason:?string}} reason is `absent`, `line-count` or `digest`
 */
export function pairPractitioners({ declared = null, lines, siteCount, digest = null }) {
  if (!lines) return { ok: false, reason: 'absent' };
  if (lines !== siteCount) return { ok: false, reason: 'line-count' };
  if (declared?.sha256) {
    if (Number.isFinite(declared.lignes) && declared.lignes !== lines) return { ok: false, reason: 'line-count' };
    if (declared.sha256 !== digest) return { ok: false, reason: 'digest' };
  }
  return { ok: true, reason: null };
}

/** A title the register puts in front of a name. */
const TITLE = /\b(DR|DRS|DOCTEUR|DOCTEURS|PR|PROFESSEUR)\b/;
/**
 * An address line that starts like a street. `AVENUE DU DOCTEUR <FIRST NAME>
 * <SURNAME>` is a street named after someone, and a doctor of the same surname
 * practising on it does not make it a name to hide.
 */
// i18n-ignore-start — the register's street-type words, matched as data
const STREET_LEAD = new RegExp(
  '^(\\d+\\s*(BIS|TER|[A-Z])?\\s+)?(RUE|R|AVENUE|AV|AVE|BD|BLD|BOULEVARD|PLACE|PL|ALLEE|ALL|'
  + 'CHEMIN|CHE|CH|ROUTE|RTE|QUAI|IMPASSE|IMP|COURS|CRS|PROMENADE|PROM|SQUARE|SQ|ESPLANADE|'
  + 'FAUBOURG|FBG|FG|PARVIS|ROND|LOTISSEMENT|LOT|VOIE|PASSAGE|MAIL|MONTEE|TRAVERSE|TRAV|CITE|'
  + 'RESIDENCE|RES|QUARTIER|HAMEAU|LIEU|ZA|ZI|ZAC|CARREFOUR|RUELLE|SENTIER|ESPACE|DOMAINE|PARC|'
  + 'CLOS|VILLA|GALERIE|CORNICHE|COUR|DESCENTE|RAMPE|TERRASSE|CHAUSSEE)\\b',
);
// i18n-ignore-end

/**
 * Does an address line carry the name of a doctor who practises there?
 *
 * The register's address block is free text, and a handful of practices use
 * it as a nameplate. On the 2026-08-17 edition exactly one address of 64 232
 * did: `CABINET DU DR <INITIAL>. <SURNAME>`, a one-doctor practice whose
 * doctor bears that surname (placeholders, because this comment is in git
 * too).
 * Left in, that one line puts a name in `medecins.json` — the file that goes
 * to git, to every cache and to `/sites` without the suppression list.
 *
 * Three conditions, measured together against the whole edition: 39 address
 * lines hold the surname of somebody listed at that same address, 4 of them
 * after a title word, and 3 of those 4 start like a street (`AVENUE DU DOCTEUR
 * …`, with a doctor of that surname practising on it). All three conditions
 * match that one nameplate and no other line.
 *
 * @param {string} line
 * @param {string[]} names the register's names at that site
 */
export function addressNamesPractitioner(line, names) {
  const folded = foldPractitionerName(line);
  if (!folded || !TITLE.test(folded) || STREET_LEAD.test(folded)) return false;
  const words = new Set(folded.split(' '));
  return (names ?? []).some((name) => {
    const surname = foldPractitionerName(name).split(' ')[0] ?? '';
    return surname.length >= 3 && words.has(surname);
  });
}
