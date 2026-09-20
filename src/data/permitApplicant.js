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
const ORGANISATION_RE = new RegExp(
  `\\b(?:(?:${ORGANISATION_WORDS.join('|')})S?\\b|${ORGANISATION_STEMS.join('|')})`,
);

/**
 * What follows an organisation's name and may name a person: the mandatary,
 * the care-of, the representative (« SCI … CHEZ <prénom nom> »). Cut before
 * the test and before printing.
 */
const CARE_OF_RE = /\s*[-,(]?\s*\b(?:chez|c\/o|repr[ée]sent[ée]e?s?\s+par|pour\s+le\s+compte\s+de|mandataire)\b.*$/i;

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
  const name = String(value ?? '').replace(/\s+/g, ' ').replace(CARE_OF_RE, '').trim();
  if (!name) return null;
  const folded = fold(name);
  if (CIVILITY_RE.test(folded)) return null;
  // Dotted forms (« S.A.S. », « S.C.I ») fold to spaced letters; rejoin them.
  const joined = folded.replace(/\b(?:[A-Z] ){1,4}[A-Z]\b/g, (run) => run.replace(/ /g, ''));
  return LEGAL_FORM_RE.test(joined) || ORGANISATION_RE.test(joined) ? name : null;
}
