/**
 * Strings of the Address X-ray page — `src/fiche.js` and `fiche.html`.
 *
 * Two catalogs, because the page has two kinds of text:
 *
 *   - the DEFAULT export is what `fiche.js` writes while it renders: the
 *     status line, the caveats, the colophon;
 *   - {@link markupMessages} is the English of the static markup in
 *     `fiche.html`, which is the French catalog of its own shell (CONVENTIONS
 *     § 6). Its `fr` repeats the HTML word for word; `fiche.en.test.mjs` fails
 *     when the two drift, exactly as `markup.test.mjs` does for `index.html`.
 *     It is kept here rather than in `src/i18n/markup.i18n.js` because that
 *     file is the shell's and this page is a document of its own.
 *
 * Every number and every instant arrives already formatted (`formatInteger`,
 * `formatDateTime`): a message only places words around them.
 */
import { defineMessages } from './i18n/messages.js';

/** The static markup of `fiche.html`, keyed by its `data-i18n*` attributes. */
export const markupMessages = defineMessages({
  page: {
    // The straight apostrophe is what the HTML `<title>` carries; the eyebrow
    // below is typographic. Both are repeated verbatim, byte for byte.
    title: { fr: 'Radiographie d\'adresse', en: 'Address X-ray', note: 'Browser tab title.' },
  },
  masthead: {
    eyebrow: { fr: 'Radiographie d’adresse', en: 'Address X-ray' },
    title: {
      fr: 'Une adresse, dix thématiques',
      en: 'One address, ten themes',
      note: 'Placeholder headline, replaced by the address once a scan lands.',
    },
    subline: {
      fr: 'Entrez une adresse française, ou ouvrez cette page avec',
      en: 'Enter a French address, or open this page with',
      note: 'The `?lat=&lon=` code span and the full stop follow it in the HTML.',
    },
  },
  lookup: {
    addressLabel: { fr: 'Adresse', en: 'Address', note: 'Accessible name of the search field.' },
    example: {
      fr: '13 rue du Chevaleret, Paris',
      en: '13 rue du Chevaleret, Paris',
      note: 'Placeholder. A French address, and it stays one in English: the sheet only scans France.',
      keep: ['rue du Chevaleret'],
    },
    scan: { fr: 'Scanner', en: 'Scan', note: 'Submits the address and composes the sheet.' },
    print: { fr: 'Imprimer', en: 'Print' },
  },
});

export default defineMessages({
  /** The verdict of one theme, printed beside its heading when it is not `ok`. */
  status: {
    ok: { fr: 'complet', en: 'complete' },
    partial: { fr: 'partiel', en: 'partial', note: 'One source of the theme answered, another did not.' },
    absent: { fr: 'sans réponse', en: 'no answer', note: 'No source of the theme answered at all.' },
  },
  /** Which of the theme's sources said nothing. The keys are route names, not words. */
  silentSources: {
    fr: (keys) => `Sources muettes : ${keys}.`,
    en: (keys) => `Silent sources: ${keys}.`,
    sample: ['atmo, gpu'],
  },
  /** The BAN's own distance to the nearest known address, when it is not the door. */
  addressDistance: {
    fr: (metres) => `point à ${metres} m de l’adresse la plus proche`,
    en: (metres) => `point ${metres} m from the nearest address`,
    sample: ['180'],
  },
  /** How much of the sheet answered, and when it was composed. */
  statusLine: {
    fr: (complete, partial, absent, stamp) => `${complete} thématiques complètes`
      + `, ${partial} partielles`
      + `, ${absent} sans réponse`
      + ` — ${stamp}`,
    en: (complete, partial, absent, stamp) => `${complete} themes complete`
      + `, ${partial} partial`
      + `, ${absent} with no answer`
      + ` — ${stamp}`,
    sample: [10, 0, 0, 'Sep 8, 2026, 12:45:00'],
  },
  scanning: {
    fr: 'Interrogation des dix-sept sources…',
    en: 'Querying the seventeen sources…',
    note: 'Status line while the seventeen routes are in flight.',
  },
  geocoding: { fr: 'Géocodage…', en: 'Geocoding…' },
  notFound: {
    fr: 'Adresse introuvable dans la Base Adresse Nationale.',
    en: 'Address not found in the national address database (BAN).',
  },
  colophon: {
    fr: 'Sources publiques françaises — DVF (DGFiP), carte des loyers '
      + '(DGALN/DHUP), ADEME, IGN, annuaire de l’éducation et IPS (DEPP), BPE (INSEE) et FINESS, '
      + 'indice ATMO (Atmo France et les AASQA), Géorisques (BRGM), Ma connexion internet (ARCEP), '
      + 'recensement (INSEE), Géoportail de l’urbanisme, Sitadel (SDES), carroyage Filosofi (INSEE). '
      + 'Chaque licence et chaque attribution est détaillée dans DATA_SOURCES.md.',
    en: 'French public sources — property sales (DVF, DGFiP), the rent map '
      + '(DGALN/DHUP), ADEME, IGN, the school register and social position index (IPS, DEPP), '
      + 'amenities (BPE, INSEE) and FINESS, the ATMO air index (Atmo France and the regional '
      + 'AASQA), Géorisques (BRGM), Ma connexion internet (ARCEP), the census (INSEE), '
      + 'Géoportail de l’urbanisme, building permits (Sitadel, SDES), the Filosofi 200 m grid '
      + '(INSEE). Every license and every attribution is detailed in DATA_SOURCES.md.',
    note: 'Footer of the sheet. Every acronym is a French register and stays as published.',
    keep: ['Ma connexion internet', 'Atmo France'],
  },
});
