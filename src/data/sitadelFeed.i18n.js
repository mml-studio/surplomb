/**
 * Strings of `src/data/sitadelFeed.js` — the building and demolition permits
 * SDES publishes, joined onto Etalab's cadastral parcels.
 *
 * TWO READERS, ONE LOCALE BETWEEN THEM. `projectSitadelCommune()` runs on the
 * server (`vite.config.js` imports it for `/api/sitadel-fr/commune`), and a
 * server has no language by design. It bakes the five band labels into
 * `summary.bands`, so those keep publishing the French they always published —
 * read straight off this catalog's definition, as `rnbPivot.js` does — and the
 * browser relabels the BAND ID with {@link import('./sitadelFeed.js').sitadelBandLabel}.
 * Everything else in this file is composed in the browser and answers in the
 * page's language.
 *
 * THE FOUR TABLES ARE KEYED BY DATA. `SITADEL_NATURE`'s keys are the publisher's
 * `NATURE_PROJET_COMPLETEE` modalities, `SITADEL_TYPES`' are `TYPE_DAU`
 * (`PC`, `DP`, `PA`, `PD`), the outcomes are this module's own join verdicts,
 * and a band id rides the payload. None of them is ever translated.
 */
import { defineMessages } from '../i18n/messages.js';
import { monthName, plural } from '../i18n/format.js';

/**
 * `NATURE_PROJET_COMPLETEE`, verbatim from the publisher's dictionary.
 *
 * Six modalities, and the distinction that matters on a photorealistic globe
 * is the first one: a new construction means the parcel is expected to change,
 * everything else means an existing building is being worked on.
 */
export const SITADEL_NATURE = defineMessages({
  1: { fr: 'Nouvelle construction', en: 'New construction' },
  2: {
    fr: 'Transformation sans changement de surface',
    en: 'Conversion with no change of floor area',
  },
  3: { fr: 'Transformation avec extension', en: 'Conversion with an extension' },
  4: {
    fr: 'Transformation avec diminution de surface',
    en: 'Conversion with a reduction of floor area',
  },
  5: { fr: 'Extension sans transformation', en: 'Extension without conversion' },
  6: {
    fr: 'Diminution de surface sans transformation',
    en: 'Reduction of floor area without conversion',
  },
});

/**
 * `TYPE_DAU`. `PA` and `PD` genuinely occur inside the housing file — 3 each
 * over 22,474 rows.
 */
export const SITADEL_TYPES = defineMessages({
  PC: { fr: 'Permis de construire', en: 'Building permit' },
  DP: { fr: 'Déclaration préalable', en: 'Prior declaration' },
  PA: { fr: 'Permis d’aménager', en: 'Development permit' },
  PD: { fr: 'Permis de démolir', en: 'Demolition permit' },
});

/** How a permit ended up where it is — or why it is nowhere. */
export const SITADEL_OUTCOME_WORDS = defineMessages({
  placed: { fr: 'Posé sur sa parcelle', en: 'Placed on its parcel' },
  ambiguous: {
    fr: 'Référence ambiguë — plusieurs parcelles portent ce numéro',
    en: 'Ambiguous reference — several parcels carry this number',
  },
  missing: {
    fr: 'Parcelle absente du cadastre actuel — divisée ou renumérotée',
    en: 'Parcel absent from today’s cadastre — divided or renumbered',
  },
  noref: {
    fr: 'Aucune référence cadastrale publiée',
    en: 'No cadastral reference published',
  },
});

export default defineMessages({
  /**
   * The five bands, keyed by the band id the payload carries.
   *
   * Four colours for the four states the construction file publishes, and a
   * fifth for the demolition file, whose own progress field says nothing.
   */
  bands: {
    autorise: {
      label: { fr: 'Autorisé', en: 'Authorized' },
      blurb: {
        fr: 'Autorisé, et rien de plus n’est remonté au SDES — ni ouverture de chantier ni achèvement. Pâle : il n’y a peut-être encore rien sur le terrain.',
        en: 'Authorized, and nothing further has reached the SDES — neither a site opening nor a completion. Pale: there may still be nothing on the ground.',
      },
    },
    commence: {
      label: { fr: 'Chantier ouvert', en: 'Site opened' },
      blurb: {
        fr: 'Déclaration d’ouverture de chantier (DOC) déposée, achèvement non déclaré. Les travaux ont commencé.',
        en: 'Site opening declaration (DOC) filed, completion not declared. Work has started.',
      },
    },
    termine: {
      label: { fr: 'Travaux achevés', en: 'Work completed' },
      blurb: {
        fr: 'Déclaration attestant l’achèvement (DAACT) déposée. Le bâti devrait exister — la BD TOPO doit être d’accord.',
        en: 'Completion declaration (DAACT) filed. The building should exist — BD TOPO has to agree.',
      },
    },
    annule: {
      label: { fr: 'Annulé', en: 'Canceled' },
      blurb: {
        fr: 'Autorisation annulée après coup. Le permis a existé, le projet non.',
        en: 'Permit canceled after the fact. The permit existed, the project did not.',
      },
    },
    demolition: {
      label: { fr: 'Permis de démolir', en: 'Demolition permit' },
      blurb: {
        fr: 'Fichier des permis de démolir (depuis 1996). Une seule bande : 94,3 % des démolitions de Nantes et 98,3 % de celles de Paris restent à « Autorisé », l’état d’avancement n’y dit rien.',
        en: 'The demolition permit file (since 1996). One band only: 94.3% of Nantes demolitions and 98.3% of Paris ones stay at “Authorized” — the progress field says nothing there.',
      },
    },
  },

  /** A surface, in the unit that fits it. */
  hectares: {
    fr: (value) => `${value} ha`,
    en: (value) => `${value} ha`,
    sample: ['1.24'],
  },
  squareMeters: {
    fr: (value) => `${value} m²`,
    en: (value) => `${value} m²`,
    sample: ['1,234'],
  },

  /**
   * A permit date. The file publishes ISO; French readers get the numeric form
   * the rest of the packs use, English readers the glossary's `Oct 4, 2024`.
   */
  date: {
    fr: (year, month, day) => `${day}/${month}/${year}`,
    en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
    sample: ['2024', '10', '04'],
  },

  /** The card for one permit, ordered as an answer to "what happens here". */
  card: {
    fallbackType: { fr: 'Autorisation d’urbanisme', en: 'Planning permit' },
    titleWithDwellings: {
      fr: (type, dwellings, count) => `${type} — ${dwellings} logement${count > 1 ? 's' : ''}`,
      en: (type, dwellings, count) => `${type} — ${dwellings} ${plural(count, 'dwelling', 'dwellings')}`,
      note: '`dwellings` is the count already formatted; `count` is the number it was formatted from.',
      sample: ['Building permit', '4', 4],
    },
    authorizedOn: {
      fr: (band, date) => `${band} · autorisé le ${date}`,
      en: (band, date) => `${band} · authorized on ${date}`,
      sample: ['Authorized', 'Oct 4, 2024'],
    },
    startedAndFinished: {
      fr: (started, finished) => `Chantier ouvert le ${started}, achevé le ${finished}`,
      en: (started, finished) => `Site opened on ${started}, completed on ${finished}`,
      sample: ['Oct 4, 2024', 'Mar 2, 2026'],
    },
    startedOnly: {
      fr: (started) => `Chantier ouvert le ${started} — achèvement non déclaré`,
      en: (started) => `Site opened on ${started} — completion not declared`,
      sample: ['Oct 4, 2024'],
    },
    finishedOnly: {
      fr: (finished) => `Achevé le ${finished} — aucune ouverture de chantier déclarée`,
      en: (finished) => `Completed on ${finished} — no site opening declared`,
      sample: ['Mar 2, 2026'],
    },
    dwellingsCreated: {
      fr: (dwellings, count) => `${dwellings} logement${count > 1 ? 's' : ''} créé${count > 1 ? 's' : ''}`,
      en: (dwellings, count) => `${dwellings} ${plural(count, 'dwelling', 'dwellings')} created`,
      sample: ['4', 4],
    },
    livingArea: {
      fr: (surface) => `${surface} de surface habitable`,
      en: (surface) => `${surface} of living area`,
      sample: ['320 m²'],
    },
    dwellingsDemolished: {
      fr: (dwellings, count) => `${dwellings} logement${count > 1 ? 's' : ''} démoli${count > 1 ? 's' : ''}`,
      en: (dwellings, count) => `${dwellings} ${plural(count, 'dwelling', 'dwellings')} demolished`,
      sample: ['2', 2],
    },
    areaRemoved: {
      fr: (surface) => `${surface} supprimée`,
      en: (surface) => `${surface} removed`,
      sample: ['180 m²'],
    },
    oneParcel: {
      fr: (parcel) => `Parcelle ${parcel}`,
      en: (parcel) => `Parcel ${parcel}`,
      sample: ['AB 0123'],
    },
    manyParcels: {
      fr: (count, parcels) => `${count} parcelles : ${parcels}`,
      en: (count, parcels) => `${count} parcels: ${parcels}`,
      sample: [2, 'AB 0123 · AB 0124'],
    },
    sectionPrefix: {
      fr: (prefixes) => `Préfixe de section ${prefixes} — absent du fichier Sitadel`,
      en: (prefixes) => `Section prefix ${prefixes} — absent from the Sitadel file`,
      note: 'Where the prefix is not `000`, the reference resolved only because nothing '
        + 'else in the municipality shares this section and number.',
      sample: ['203'],
    },
    landVersusParcel: {
      fr: (declared, drawn) => `Terrain déclaré ${declared} · parcelle tracée ${drawn}`,
      en: (declared, drawn) => `Declared land ${declared} · parcel drawn ${drawn}`,
      sample: ['1,240 m²', '1,198 m²'],
    },
    verdict: {
      fr: (sentence, verdict) => `${sentence} — ${verdict}`,
      en: (sentence, verdict) => `${sentence} — ${verdict}`,
      sample: ['Declared land 1,240 m² · parcel drawn 1,198 m²', 'consistent'],
    },
    agrees: { fr: 'concordant', en: 'consistent' },
    disagrees: { fr: 'DISCORDANT', en: 'INCONSISTENT' },
    noLandArea: {
      fr: 'Superficie du terrain non publiée — le tracé n’est pas recoupé',
      en: 'Land area not published — the outline is not cross-checked',
    },
    joined: {
      fr: 'Position calculée par jointure cadastrale — Sitadel ne publie aucune coordonnée',
      en: 'Position computed by a cadastral join — Sitadel publishes no coordinates',
      note: 'The one layer on the globe whose every coordinate was computed rather than '
        + 'published; the card is where that is admitted.',
    },
    fileNumber: {
      fr: (id) => `N° ${id}`,
      en: (id) => `No. ${id}`,
      sample: ['04412313A0031'],
    },
  },

  /** The line under the layer's toggle. */
  row: {
    tooHigh: {
      fr: 'Sitadel interroge une commune à la fois — zoome sous 12 km',
      en: 'Sitadel answers one municipality at a time — zoom in below 12 km',
    },
    offCoverage: {
      fr: 'Hors de France — Sitadel ne couvre que les communes françaises',
      en: 'Outside France — Sitadel only covers French municipalities',
    },
    loadingCommune: {
      fr: (commune) => `Permis de ${commune}…`,
      en: (commune) => `Permits for ${commune}…`,
      sample: ['Nantes'],
    },
    loading: { fr: 'Recherche de la commune…', en: 'Looking up the municipality…' },
    noCommune: {
      fr: 'Aucune commune française sous le centre de l’écran',
      en: 'No French municipality under the center of the screen',
    },
    placed: {
      fr: (head, permits, parcels) => `${head}${permits} permis posés sur ${parcels} parcelles`,
      en: (head, permits, parcels) => `${head}${permits} permits placed on ${parcels} parcels`,
      note: '`head` is the municipality name and its separator, or empty.',
      sample: ['Nantes · ', '3,241', '2,890'],
    },
    unplaced: {
      fr: (permits, share) => `${permits} non posés (${share})`,
      en: (permits, share) => `${permits} not placed (${share})`,
      sample: ['412', '13%'],
    },
    dwellings: {
      fr: (dwellings) => `${dwellings} logements autorisés`,
      en: (dwellings) => `${dwellings} dwellings authorized`,
      sample: ['5,120'],
    },
    vintage: {
      fr: (millesime) => `millésime ${millesime}`,
      en: (millesime) => `${millesime} vintage`,
      sample: ['2026-07'],
    },
  },

  /**
   * Where the unplaced permits went. Three different failures with three
   * different causes, kept apart because the reader can act on the difference.
   */
  unplaced: {
    ambiguous: {
      fr: (permits, count) => `${permits} référence${count > 1 ? 's' : ''} ambiguë${count > 1 ? 's' : ''}`
        + ' — plusieurs parcelles de la commune portent la même section et le même numéro (préfixes de section, absents de Sitadel)',
      en: (permits, count) => `${permits} ambiguous ${plural(count, 'reference', 'references')}`
        + ' — several parcels in the municipality carry the same section and the same number (section prefixes, which Sitadel does not publish)',
      sample: ['118', 118],
    },
    missing: {
      fr: (permits, count) => `${permits} parcelle${count > 1 ? 's' : ''} introuvable${count > 1 ? 's' : ''}`
        + ' dans le cadastre d’aujourd’hui — divisée ou renumérotée depuis le dépôt',
      en: (permits, count) => `${permits} ${plural(count, 'parcel', 'parcels')} not found`
        + ' in today’s cadastre — divided or renumbered since the permit was filed',
      sample: ['240', 240],
    },
    noref: {
      fr: (permits) => `${permits} permis sans aucune référence cadastrale publiée`,
      en: (permits) => `${permits} permits with no cadastral reference published at all`,
      sample: ['54'],
    },
  },
});
