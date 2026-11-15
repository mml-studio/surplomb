/**
 * WHO ASKED FOR A PERMIT — A COMPANY'S NAME, NEVER A PERSON'S.
 *
 * Paris and Nantes Métropole publish the applicant of every authorisation as
 * written on the form, private individuals included (sampled 2026-09-17:
 * « Monsieur … », « poncet berenice »). Sitadel, the State's own register,
 * publishes the applicant ONLY for legal persons and leaves the column empty
 * otherwise — measured the same day over 573 Nantes rows, every non-empty
 * `DENOM_DEM` is an organisation.
 *
 * This file brings the city portals down to the State's rule, because
 * republishing the name is Surplomb's own processing:
 *
 *   - A person's name adds nothing to a map of building work (GDPR, art.
 *     5.1.c), and a live re-read of the city's file leaves no way to honour an
 *     objection one name at a time.
 *   - On the same parcel, the applicant's name beside a DVF sale says who
 *     bought and for how much — the re-identification DVF's terms forbid
 *     « ni pour objet ni pour effet » (LPF, art. R*112 A-3).
 *
 * The test is an ALLOWLIST of what only an organisation writes — a legal form,
 * or a word no surname is — so a doubt masks. A company whose name carries
 * none of them (« RENOVETUDE ») loses its name on the card, which costs
 * nothing; the reverse error would publish a person.
 */

/** Legal forms, as whole words. Short, ambiguous ones (`SA`, `SEM`) are out. */
const LEGAL_FORMS = [
  'SAS', 'SASU', 'SARL', 'SARLU', 'EURL', 'SCI', 'SCCV', 'SNC', 'SCIC', 'SCOP',
  'SELARL', 'SELAS', 'SAEM', 'SEML', 'SPL', 'GIE', 'GAEC', 'EARL', 'SDC',
  'OPH', 'OPAC', 'HLM', 'ESH', 'ASL', 'AFUL',
];

/**
 * Words that name an organisation and no person. Whole words (a trailing `S`
 * allowed) where a surname could begin the same way — `VILLE` must not take
 * « VILLETARD » — and stems only where no surname starts with them.
 */
// i18n-ignore-start — tokens matched against a French applicant name, never shown
const ORGANISATION_WORDS = [
  'GROUPE', 'HOLDING', 'CABINET', 'AGENCE', 'OFFICE', 'INSTITUT', 'CENTRE',
  'SERVICE', 'SYNDIC', 'SYND', 'SYNDICAT', 'IMMO', 'FONCIA', 'CITYA', 'NEXITY',
  'GESTION', 'BANQUE', 'HOTEL', 'RESTAURANT', 'COMMUNE', 'MAIRIE', 'VILLE',
  'METROPOLE', 'DEPARTEMENT', 'REGION', 'MINISTERE', 'HOPITAL', 'CLINIQUE',
  'LYCEE', 'COLLEGE', 'ECOLE', 'PAROISSE', 'RATP', 'SNCF', 'ENEDIS', 'EDF',
  'GRDF',
];
const ORGANISATION_STEMS = [
  'SOCIETE', 'COMPAGNIE', 'COPROPRIET', 'ASSOCIATION', 'FONDATION',
  'COOPERATIVE', 'IMMOBILI', 'FONCIER', 'HABITAT', 'LOGEMENT', 'PATRIMOINE',
  'PROMOTION', 'CONSTRUCTION', 'AMENAGEMENT', 'INVESTISS', 'DEVELOPPEMENT',
  'ASSURANCE', 'ETABLISSEMENT', 'UNIVERSITE', 'DIOCES',
];
// i18n-ignore-end

const LEGAL_FORM_RE = new RegExp(`\\b(?:${LEGAL_FORMS.join('|')})\\b`);
const LEGAL_FORM_RE_GLOBAL = new RegExp(`\\b(?:${LEGAL_FORMS.join('|')})\\b`, 'g');
/**
 * Words that follow a bare « M » (metres) in a description and are no name:
 * « 1.50 M DE PROFONDEUR », « LONGUEUR 8 M LARGEUR 3 M ». The number before
 * the « M » usually tells already; these catch « 8 M   LARGEUR » and kin.
 */
const UNIT_WORDS = 'DE|DU|DES|LA|LE|LES|ET|EN|SUR|SOUS|X|PROFONDEUR|HAUTEUR|LARGEUR|LONGUEUR|EPAISSEUR|ÉPAISSEUR|LINEAIRES?|LINÉAIRES?|ENVIRON|MAX|MAXIMUM|MINIMUM|MINI|HT|TTC|COLORIS|AVEC|POUR|PAR|AU|AUX|CARRES?|CARRÉS?'; // i18n-ignore-line — French measurement words matched, never shown
/** A capitalised word of a name: « NOM », « Prénom », « Jean-Claude », « D'ARC ». */
const NAME_WORD = "\\p{Lu}[\\p{L}'’\\-]+";
// i18n-ignore-start — French words matched in an applicant's description, never shown
const AFTER_CLAUSE_RE = new RegExp(
  `\\b((?:[Cc]hez|CHEZ|[Cc]lient(?:e|s)?|CLIENT(?:E|S)?|[Pp]ropri[ée]taires?|PROPRI[EÉ]TAIRES?|[Ff]amille|FAMILLE|[Cc]onsorts|CONSORTS|[ÉéEe]poux|[ÉE]POUX)`
  + `(?:\\s+(?:notre|nos|mon|ma|mes|NOTRE|NOS)\\s+(?:client(?:e|s)?|CLIENT(?:E|S)?))?)`
  + `\\s+(?:(M\\.?|MR\\.?|Mr\\.?|MME|Mme|MLLE|Mlle|MONSIEUR|Monsieur|MADAME|Madame)\\s+)?`
  + `(${NAME_WORD})(?:\\s+(${NAME_WORD}))?`,
  'gu',
);
const EXPLICIT_CIVILITY_RE = new RegExp(
  `(?<!(?:\\d|\\b[xX×])\\s{0,3})\\b(?:M\\.?|MR\\.?|Mr\\.?|MM\\.?|MME|Mme|MLLE|Mlle|MONSIEUR|Monsieur|monsieur|MADAME|Madame|madame|MADEMOISELLE|Mademoiselle)`
  + `\\s+(?!(?:${UNIT_WORDS})\\b)${NAME_WORD}(?:\\s+(?!(?:${UNIT_WORDS})\\b)${NAME_WORD}){0,2}`,
  'gu',
);
// i18n-ignore-end
const ORGANISATION_RE = new RegExp(
  `\\b(?:(?:${ORGANISATION_WORDS.join('|')})S?\\b|${ORGANISATION_STEMS.join('|')})`,
);

/**
 * What follows an organisation's name and may name a person: the mandatary,
 * the care-of, the representative (« SCI … CHEZ <prénom nom> »). Cut before
 * the test and before printing.
 */
const CARE_OF_RE = /\s*[-,(]?\s*\b(?:chez|c\/o|repr[ée]sent[ée]e?s?\s+par|pour\s+le\s+compte\s+de|mandataire)\b.*$/i;

/**
 * A representative named after the organisation, with or without « par »
 * (« SAS … représentée par … », « SNC …, REPRESENTANT MONSIEUR … », the
 * portals' own typo « rerpesentée par », « SAS … rep par … »). Cut with
 * everything after it. Measured 2026-11-15 in the production archive: these
 * and the inner civility below let ~330 cells through, across Cart@DS,
 * e-permis, Sirap and the cities' lists.
 */
const REPRESENTATIVE_RE = /\s*[-,(]?\s*\b(?:repr[eé]sent\p{L}*|rerp[eé]sent\p{L}*|rep\.?\s+par)\b.*$/iu;
/**
 * A civility INSIDE the name — « SCI … - M. NOM Prénom », « SCI … (M. NOM) »,
 * « VILLE DE … M. NOM », « SNC … MONSIEUR NOM PRÉNOM » — opens a person's
 * name, which runs to the next separator (a spaced dash, a comma, a
 * semicolon, a closing parenthesis) or to the end. Only that clause goes:
 * « SNC M NOM - SNC IMMOBILIERE … » keeps the second company. The civility
 * must be followed by a word, so « SCI M2CB » is untouched.
 */
const INNER_PERSON_RE = /\s*\(?\s*\b(?:M\.?|MR\.?|MME|MLLE|MM\.?|MONSIEUR|MADAME|MADEMOISELLE)\s+\p{L}[^,;()]*?(?=\s+[-–—]\s+|\s*[,;)]|$)\)?/giu;
/** What a cut leaves dangling at either end. */
const DANGLING_RE = /^[\s,;)\-–—/]+|[\s,;(\-–—/]+$/gu;
/** Two separators left side by side once the clause between them went. */
const DOUBLED_SEPARATOR_RE = /\s+[-–—]\s+(?:[-–—]\s+)+/gu;

/** A civility first is a person, whatever follows. */
const CIVILITY_RE = /^(?:MONSIEUR|MADAME|MADEMOISELLE|M|MME|MLLE|MR|MRS|MM)\b/;

/** Upper case, no accents, punctuation as spaces: the form the tests read. */
function fold(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * The applicant as a card may print it, or null.
 *
 * @param {unknown} value - The portal's `demandeur`.
 * @returns {?string} The name, unchanged, when it reads as an organisation.
 */
export function organisationApplicant(value) {
  const written = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!written || CIVILITY_RE.test(fold(written))) return null;
  const name = written
    .replace(CARE_OF_RE, '')
    .replace(REPRESENTATIVE_RE, '')
    .replace(INNER_PERSON_RE, '')
    .replace(DOUBLED_SEPARATOR_RE, ' - ')
    .replace(DANGLING_RE, '')
    .trim();
  if (!name) return null;
  const folded = fold(name);
  if (CIVILITY_RE.test(folded)) return null;
  // Dotted forms (« S.A.S. », « S.C.I ») fold to spaced letters; rejoin them.
  const joined = folded.replace(/\b(?:[A-Z] ){1,4}[A-Z]\b/g, (run) => run.replace(/ /g, ''));
  // A legal form alone (« SAS » once « MONSIEUR … » is cut) names nobody.
  if (!joined.replace(LEGAL_FORM_RE_GLOBAL, '').trim()) return null;
  return LEGAL_FORM_RE.test(joined) || ORGANISATION_RE.test(joined) ? name : null;
}

/**
 * A free-text cell (what the work is, as the applicant typed it) without the
 * private person it sometimes names: « isolation thermique extérieure chez
 * Prénom NOM », « panneaux chez notre client M NOM », « M. NOM souhaite… ».
 * The name is replaced by `[…]`; the rest of the description stays.
 *
 * Rules, narrow on purpose because a description is mostly measurements
 * (« 4.00 M X 8.00 M », « 2.50 M COLORIS »):
 * - after « chez », « client(e)(s) », « propriétaire(s) », « famille »,
 *   « consorts », « époux »: a civility (bare « M » allowed here) and one or
 *   two capitalised words, or two capitalised words without a civility
 *   (« chez PRB » is a supplier and stays; « chez PAREX LANKO » goes too —
 *   a supplier lost costs nothing, a person printed does);
 * - anywhere: a civility (« M », « M. », « Mme », « Monsieur »…) and one
 *   to three capitalised words — never after a number or an « x » (« 3 M X 7 M »),
 *   never when the next word is one a measurement takes (« M DE PROFONDEUR »).
 *
 * @param {?string} value
 * @returns {?string}
 */
export function withoutPersonMentions(value) {
  if (value === null || value === undefined) return value ?? null;
  return String(value)
    .replace(AFTER_CLAUSE_RE, (match, lead, civility, first, second) => {
      if (!civility && !second) return match;
      return `${lead} […]`;
    })
    .replace(EXPLICIT_CIVILITY_RE, '[…]');
}
