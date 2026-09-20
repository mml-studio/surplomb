/**
 * Does a string read as French?
 *
 * Two users, one answer:
 *
 *   - the i18n ratchet (scripts/lib/i18nScan.mjs) counts the French string
 *     literals left outside catalogs, file by file (rule R1);
 *   - `assertNoFrench()` (src/i18n/testing.js), the parity test and the
 *     English QA scan check that an English screen carries no French.
 *
 * It is a detector, not a language model. It looks for four kinds of
 * evidence, each cheap and each rare in English:
 *
 *   accent    a word with a French diacritic (é, è, ê, à, ç, œ…) — `périmètre`
 *   elision   l’, d’, qu’, n’… before a word — `l’image`, `d’EFFIS`
 *   word      a French word that is not also English — `les`, `pour`, `jour`
 *   format    French number or date typography — `5,6 s`, `91,3 %`, `3 200 €`,
 *             a narrow no-break space, `1ᵉʳ`. Only when `formatting` is on:
 *             source code is full of legitimate format strings, rendered
 *             English is not.
 *
 * PROPER NOUNS ARE NOT FRENCH. The "Never translate" list of docs/GLOSSARY.md
 * (mirrored in src/i18n/glossary.js) is removed from the text before anything
 * is looked for, so `Risks (Géorisques)` is English. Place names are not on
 * that list; pass them in `allow` — the caller is the one holding the data.
 * A name matches whichever apostrophe it is written with: the glossary spells
 * `Géoportail de l’urbanisme` with a curly one and `urbanismeGpu.js` with a
 * straight one, and the same publisher under two code points would otherwise
 * be French in one file and English in the other.
 *
 * AN APOSTROPHE IS NOT ALWAYS AN ELISION. `Hub’Eau`, `O’Brien` and `Vélib’`
 * are single names; only the documented elision prefixes (`l’`, `d’`, `qu’`…)
 * split a token in two. Reading `Hub'Eau stations HTTP 429` as French because
 * `eau` is a French noun is the false positive that rule buys off.
 *
 * @module i18n/frenchDetector
 */

import { PROPER_NOUN_LIST } from './glossary.js';

/**
 * French words that are not English words, lowercase. Deliberately NOT here:
 * words English shares (`plus`, `place`, `date`, `station`, `type`, `car`,
 * `son`, `on`, `en`, `a`, `surface`, `terrain`, `active`, `source`, `image`,
 * `point`, `pays`, `premier`, `lecture`, `pendant`, `Mon`).
 */
const FRENCH_WORDS = new Set([
  // Function words.
  'les', 'des', 'une', 'du', 'aux', 'pour', 'avec', 'dans', 'sont', 'est', 'aucun', 'aucune',
  'cette', 'ces', 'cet', 'leur', 'leurs', 'nous', 'vous', 'ils', 'elles', 'puis', 'depuis',
  'chez', 'sans', 'sous', 'vers', 'entre', 'selon', 'lorsque', 'parce', 'donc', 'ainsi',
  'aussi', 'encore', 'toujours', 'jamais', 'rien', 'tout', 'tous', 'toute', 'toutes',
  'moins', 'beaucoup', 'ici', 'dont', 'mais', 'et', 'le', 'la', 'de', 'au', 'sur', 'pas',
  'qui', 'que', 'quand', 'comme', 'ou', 'ne', 'se', 'sa', 'ses', 'ma', 'mes', 'notre',
  'nos', 'votre', 'vos', 'il', 'elle', 'un', 'ont', 'peut', 'doit', 'sera', 'soit',
  'plusieurs', 'chaque', 'autre', 'autres', 'ce', 'ceci', 'cela', 'celui', 'celle', 'ceux',
  'lui', 'quel', 'quelle', 'quels', 'quelles', 'quoi', 'pourquoi', 'comment', 'combien',
  'avant', 'contre', 'parmi', 'sauf', 'hors', 'oui', 'non', 'voici', 'fait',
  // Time.
  'jour', 'jours', 'heure', 'heures', 'mois', 'semaine', 'semaines', 'hier', 'demain',
  'janvier', 'avril', 'mai', 'juin', 'juillet', 'septembre', 'octobre', 'novembre',
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'janv', 'juil',
  // Interface.
  'couche', 'couches', 'carte', 'cartes', 'chargement', 'erreur', 'fermer', 'ouvrir',
  'partager', 'rechercher', 'recherche', 'afficher', 'masquer', 'voir', 'zoomez', 'cliquez',
  'cliquer', 'touchez', 'appuyez', 'choisissez', 'essayez', 'veuillez', 'patientez',
  'rapprochez', 'jouer', 'rejouer', 'reprendre', 'merci', 'bienvenue',
  'actif', 'inactif', 'disponible', 'indisponible', 'introuvable', 'aucunes',
  // Nouns the layers use.
  'vente', 'ventes', 'maison', 'maisons', 'appartement', 'appartements', 'ville', 'villes',
  'rue', 'rues', 'quartier', 'quartiers', 'commune', 'communes', 'gare', 'gares',
  'ligne', 'lignes', 'trafic', 'vitesse', 'eau', 'feu', 'feux', 'incendie', 'risque',
  'risques', 'bruit', 'donnees', 'mesure', 'prix', 'loyer', 'loyers', 'permis', 'avion',
  'avions', 'navire', 'navires', 'bateau', 'bateaux', 'centrale', 'centrales', 'poste',
  'postes', 'environ', 'seulement', 'maintenant', 'dernier', 'derniers', 'prochain',
  'prochaine', 'nouveau', 'nouvelle', 'nouveaux', 'grande', 'petit', 'haut', 'haute', 'bas',
  'basse', 'faible', 'moyen', 'moyenne', 'chaud', 'chauds', 'flammes', 'fumée', 'colonne', 'curseur',
]);

/**
 * Accented words English borrowed, which prove nothing.
 */
const ENGLISH_ACCENTED = new Set(['café', 'cafés', 'déjà', 'résumé', 'résumés', 'naïve', 'fiancé',
  'fiancée', 'cliché', 'décor', 'façade', 'rosé', 'entrée', 'protégé', 'crème', 'précis']);

const ACCENT = /[àâéèêëîïôùûçœæÀÂÉÈÊËÎÏÔÙÛÇŒÆ]/u;
const ELISION = /(?:^|[^\p{L}])((?:jusqu|lorsqu|puisqu|qu|[cdjlmnst])['’]\p{L}+)/giu;
/** The only prefixes an apostrophe may elide. Anything else binds one name. */
const ELISION_PREFIX = /^(?:jusqu|lorsqu|puisqu|qu|[cdjlmnst])$/i;
/**
 * A word, and — captured apart — an apostrophe and whatever follows it, so the
 * loop below can decide whether `Hub’Eau` is one name or two words.
 */
const RUN = String.raw`\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*`;
const WORD = new RegExp(`(${RUN})(?:['’](${RUN}))?`, 'gu');

/** French typography that should never survive into English output. */
const FORMAT_RULES = [
  ['narrow no-break space', /\u202f/u],
  ['decimal comma', /\d,\d{1,2}(?!\d)/u],
  ['space before %', /\d[\s\u00a0]%/u],
  ['euro after the amount', /\d[\s\u00a0]?€/u],
  ['French ordinal', /\d(?:ᵉʳ|ʳᵉ|ᵉ)/u],
  ['thousands space', /\d[ \u00a0\u202f]\d{3}(?!\d)/u],
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One proper noun as a pattern, apostrophe-insensitive.
 *
 * `’` and `'` are the same character to a reader and two to a regex. Names are
 * typed both ways across the repository — `Géoportail de l’urbanisme` in the
 * glossary, `Géoportail de l'urbanisme` in `urbanismeGpu.js` — and normalising
 * the PATTERN rather than the text keeps the evidence reported back verbatim.
 */
function properNounPattern(name) {
  return escapeRegExp(name).replace(/['’]/g, "['’]");
}

const defaultAllow = new RegExp(PROPER_NOUN_LIST.map(properNounPattern).join('|'), 'gu');
const allowCache = new Map();

/** The allow-list regex for a set of extra names (glossary always included). */
function allowPattern(extra) {
  if (!extra?.length) return defaultAllow;
  const key = extra.join('\u0000');
  let pattern = allowCache.get(key);
  if (!pattern) {
    const names = [...new Set([...PROPER_NOUN_LIST, ...extra])].sort((a, b) => b.length - a.length);
    pattern = new RegExp(names.map(properNounPattern).join('|'), 'gu');
    if (allowCache.size > 64) allowCache.clear();
    allowCache.set(key, pattern);
  }
  return pattern;
}

/**
 * Every piece of French evidence in a string.
 *
 * @param {string} text
 * @param {{allow?: string[], formatting?: boolean}} [options] `allow`: proper
 *   nouns (place names, sensors) accepted as they are, on top of the glossary.
 *   `formatting`: also report French number and date typography (default true).
 * @returns {Array<{kind: 'accent'|'elision'|'word'|'format', match: string}>}
 */
export function findFrench(text, { allow = [], formatting = true } = {}) {
  const source = String(text ?? '');
  if (!source) return [];
  const found = [];
  if (formatting) {
    for (const [name, rule] of FORMAT_RULES) {
      const match = rule.exec(source);
      if (match) found.push({ kind: 'format', match: `${name}: ${match[0]}` });
    }
  }
  const stripped = source.replace(allowPattern(allow), ' ');
  for (const match of stripped.matchAll(ELISION)) found.push({ kind: 'elision', match: match[1] });
  for (const [whole, head, tail] of stripped.matchAll(WORD)) {
    // An apostrophe after anything but an elision prefix binds ONE name —
    // `Hub’Eau`, `O’Brien` — whose halves are words of no language. After an
    // elision prefix the two sides are read apart, as they always were, and
    // the elision itself is already evidence above.
    const tokens = tail && !ELISION_PREFIX.test(head) ? [whole] : [head, tail];
    for (const token of tokens) {
      if (!token) continue;
      const lower = token.toLowerCase();
      if (ACCENT.test(token)) {
        if (!ENGLISH_ACCENTED.has(lower)) found.push({ kind: 'accent', match: token });
        continue;
      }
      // Short all-capital tokens are acronyms — `LA`, `DE`, `EST`, `UN` — and
      // mean nothing about the language around them.
      if (token.length <= 3 && token === token.toUpperCase()) continue;
      if (FRENCH_WORDS.has(lower)) found.push({ kind: 'word', match: token });
    }
  }
  return found;
}

/**
 * @param {string} text
 * @param {{allow?: string[], formatting?: boolean}} [options] As {@link findFrench}.
 * @returns {boolean} whether the string carries any French evidence.
 */
export function looksFrench(text, options) {
  return findFrench(text, options).length > 0;
}
