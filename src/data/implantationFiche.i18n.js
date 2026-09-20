/**
 * Strings of `src/data/implantationFiche.js` — the site report: who lives
 * within a ten-minute walk of one address, what may be built there, and what
 * the ground around it sells for.
 *
 * THIS CARD IS THE LAYER'S ENTIRE PRODUCT, and every sentence on it is
 * argued. Three of them are refusals and must not soften:
 *
 *  - the BRACKET. The population is a range, not a figure, because a
 *    ten-minute walk is about 1.1 km across and an INSEE cell is 200 m: most
 *    of the cells a ring touches ARE its border. The low bound counts whole
 *    cells, the high bound every cell touched, and the headline sits between.
 *  - the TRUNCATION. When the grid returned a cut-short page there is no
 *    bracket at all: the total is a FLOOR, and an error bar that does not
 *    cover the missing cells would be a lie with a ± in it.
 *  - the IMPUTATION, which is three sentences: some cells modeled, the flag
 *    absent, or none imputed. "None imputed" is a claim about INSEE's flag and
 *    cannot be made when the flag did not arrive.
 *
 * The scale's own refusals come from `baremeNational.i18n.js`; the zoning
 * family sentences from `urbanismeGpu.i18n.js`; the easement families from
 * `gpuFeed.i18n.js`. This file holds what the report itself composes.
 */
import { defineMessages } from '../i18n/messages.js';
import { ordinal, plural } from '../i18n/format.js';

/**
 * The sources a report can be short of, keyed by the token `composeFiche()`
 * puts in `missing`. The token is DATA: it travels on the payload, and the
 * layer's own tests pin it.
 */
export const FICHE_MISSING_WORDS = defineMessages({
  carroyage: { fr: 'carroyage', en: 'grid' },
  'carroyage tronqué': { fr: 'carroyage tronqué', en: 'truncated grid' },
  urbanisme: { fr: 'urbanisme', en: 'planning' },
  marché: { fr: 'marché', en: 'market' },
  adresse: { fr: 'adresse', en: 'address' },
});

export default defineMessages({
  fallbackTitle: { fr: 'Fiche implantation', en: 'Site report' },

  /** The catchment area itself: what a ten-minute walk actually reaches. */
  ring: {
    reachable: {
      fr: (minutes, areaKm2) => `${minutes} à pied — ${areaKm2} km² réellement atteignables`,
      en: (minutes, areaKm2) => `${minutes} on foot — ${areaKm2} km² actually reachable`,
      sample: ['10 min', '1.4'],
    },
    equivalentCircle: {
      fr: (radius) => `Cercle équivalent ${radius} m, mais ce n’est pas un cercle`,
      en: (radius) => `Equivalent circle ${radius} m, but it is not a circle`,
      sample: [670],
    },
    unavailable: {
      fr: 'Zone de chalandise indisponible — le service isochrone IGN n’a pas répondu',
      en: 'Catchment area unavailable — the IGN isochrone service did not answer',
    },
  },

  /** The demand side: the bracket, and what invalidates it. */
  demand: {
    atLeast: {
      fr: (people) => `Au moins ${people} habitants — comptage incomplet`,
      en: (people) => `At least ${people} residents — the count is incomplete`,
      sample: ['4,820'],
    },
    truncated: {
      fr: (cells) => `Le carroyage INSEE a renvoyé une page tronquée${cells}`
        + ' — ce total est un plancher, pas une fourchette',
      en: (cells) => `The INSEE grid returned a truncated page${cells}`
        + ' — this total is a floor, not a range',
      note: '`cells` is the parenthetical cell count, or empty.',
      sample: [' (5,000 cells in the box)'],
    },
    truncatedCells: {
      fr: (cells) => ` (${cells} carreaux dans la boîte)`,
      en: (cells) => ` (${cells} cells in the box)`,
      sample: ['5,000'],
    },
    people: {
      fr: (people, margin) => `${people} habitants${margin}`,
      en: (people, margin) => `${people} residents${margin}`,
      note: '`margin` is the ± half-width of the bracket, or empty.',
      sample: ['4,820', ' (±38%)'],
    },
    margin: {
      fr: (width) => ` (±${width} %)`,
      en: (width) => ` (±${width}%)`,
      sample: [38],
    },
    bracket: {
      fr: (low, high) => `Entre ${low} et ${high}`
        + ' selon qu’on compte les carreaux entiers ou tout carreau touché',
      en: (low, high) => `Between ${low} and ${high}`
        + ' depending on whether whole cells or every cell touched is counted',
      sample: ['3,010', '6,640'],
    },
    cells: {
      fr: (households, counted, resolution, touched, inside, straddling) => `${households} ménages`
        + `, ${counted} carreaux de ${resolution} m retenus au centre`
        + ` sur ${touched} touchés (${inside} entiers`
        + `, ${straddling} à cheval)`,
      en: (households, counted, resolution, touched, inside, straddling) => `${households} households`
        + `, ${counted} cells of ${resolution} m kept by their center`
        + ` out of ${touched} touched (${inside} whole`
        + `, ${straddling} straddling)`,
      note: 'A partition a reader can add up: whole + straddling = touched.',
      sample: ['2,140', 34, 200, 61, 27, 34],
    },
    borderDominates: {
      fr: (straddling, touched) => `La bordure domine — ${straddling} des`
        + ` ${touched} carreaux touchés sont à cheval, à cette résolution`,
      en: (straddling, touched) => `The border dominates — ${straddling} of the`
        + ` ${touched} cells touched straddle it, at this resolution`,
      note: 'A reader meeting a ±100% bracket assumes a bug rather than a grid.',
      sample: [34, 61],
    },
    income: {
      fr: (amount, poor) => `Niveau de vie moyen ${amount} €/an${poor}`,
      en: (amount, poor) => `Mean standard of living €${amount}/year${poor}`,
      sample: ['24,600', ', 12.4% of households below the poverty line'],
    },
    poor: {
      fr: (share) => `, ${share} % de ménages pauvres`,
      en: (share) => `, ${share}% of households below the poverty line`,
      sample: ['12.4'],
    },
    young: {
      fr: (share) => `${share} % de moins de 18 ans`,
      en: (share) => `${share}% under 18`,
      sample: ['21.3'],
    },
    old: {
      fr: (share) => `${share} % de 65 ans et plus`,
      en: (share) => `${share}% aged 65 and over`,
      sample: ['17.8'],
    },
    alone: {
      fr: (share) => `${share} % de personnes seules`,
      en: (share) => `${share}% living alone`,
      sample: ['38.2'],
    },
    owners: {
      fr: (share) => `${share} % de propriétaires`,
      en: (share) => `${share}% owner-occupiers`,
      sample: ['44.0'],
    },
    social: {
      fr: (share) => `${share} % en logement social`,
      en: (share) => `${share}% in social housing`,
      sample: ['18.0'],
    },
    imputed: {
      fr: (imputed, counted, share) => `${imputed} carreau${imputed > 1 ? 'x' : ''}`
        + ` imputé${imputed > 1 ? 's' : ''} sur ${counted}`
        + ` (${share} %) — valeurs approchées, pas observées`,
      en: (imputed, counted, share) => `${imputed} ${plural(imputed, 'cell', 'cells')}`
        + ` imputed out of ${counted}`
        + ` (${share}%) — approximated values, not observed`,
      sample: [12, 34, 35],
    },
    imputationUnknown: {
      fr: (unknown, counted) => `Imputation non renseignée sur ${unknown}`
        + ` des ${counted} carreaux retenus — observées ou approchées, l’INSEE ne l’a pas dit`,
      en: (unknown, counted) => `Imputation not reported for ${unknown}`
        + ` of the ${counted} cells kept — observed or approximated, INSEE did not say`,
      note: 'Two cells in five are imputed nationally, so the silent default '
        + 'was the flattering answer, not the neutral one.',
      sample: [8, 34],
    },
    noneImputed: {
      fr: (counted) => `Aucun carreau imputé sur les ${counted} retenus`,
      en: (counted) => `No cell imputed out of the ${counted} kept`,
      sample: [34],
    },
    empty: {
      fr: 'Aucun carreau INSEE habité dans cette zone',
      en: 'No inhabited INSEE cell in this area',
    },
    unavailable: {
      fr: 'Population indisponible — le carroyage INSEE n’a pas répondu',
      en: 'Population unavailable — the INSEE grid did not answer',
    },
  },

  /** The national rank, and the three things it refuses to claim. */
  rank: {
    letters: {
      fr: (letters) => `${letters}`
        + ' — lettres au sens du résident acheteur, A = le meilleur cinquième de France',
      en: (letters) => `${letters}`
        + ' — letters from a resident buyer’s point of view, A = the best fifth of France',
      note: '“A” means nothing until the reader knows it is the best fifth, and '
        + 'on whose behalf.',
      sample: ['Walk B or C, Price D'],
    },
    letterPair: {
      fr: (high, low) => `${high} ou ${low}`,
      en: (high, low) => `${high} or ${low}`,
      note: 'Not an assignment: near a quintile boundary the value has an even '
        + 'chance of being in the other band, and printing the better one would '
        + 'be a commercial choice.',
      sample: ['B', 'C'],
    },
    percentiles: {
      fr: (ranks) => `Centiles nationaux — ${ranks}`,
      en: (ranks) => `National percentiles — ${ranks}`,
      sample: ['Walk 62nd, Price 41st'],
    },
    scale: {
      fr: (rings, measuredAt, margin) => `Barème mesuré sur ${rings} anneaux de 10 min`
        + ` tirés au sort dans la population (${measuredAt})`
        + `, à ±${margin} points de centile près`,
      en: (rings, measuredAt, margin) => `Scale measured on ${rings} ten-minute rings`
        + ` drawn at random from the population (${measuredAt})`
        + `, to within ±${margin} percentile points`,
      sample: ['1,200', '2026-09-12', 4.5],
    },
    priceCoverage: {
      fr: (coverage) => `Le rang du prix se lit sur les ${coverage} % d’anneaux`
        + ' où une vente comparable existait — une France plus urbaine que la France',
      en: (coverage) => `The price rank is read on the ${coverage}% of rings`
        + ' where a comparable sale existed — a France more urban than France is',
      note: '151 of the 1,200 rings have no comparable sale within 300 m, and '
        + 'those rings are rural.',
      sample: [87],
    },
    suspendedTruncated: {
      fr: 'Rang national suspendu sur l’anneau — un comptage tronqué est un plancher'
        + ', et un plancher se classerait toujours trop bas',
      en: 'National rank suspended for the ring — a truncated count is a floor'
        + ', and a floor would always rank too low',
    },
    unavailable: {
      fr: 'Rang national indisponible sur cet anneau'
        + ' — le barème n’est mesuré qu’à dix minutes de marche',
      en: 'National rank unavailable for this ring'
        + ' — the scale is only measured at ten minutes on foot',
      note: 'Stated even when there are ranks left to print: a shorter '
        + '“National percentiles” line with no explanation is the silent '
        + 'omission this layer refuses everywhere else.',
    },
    scoreRank: {
      fr: (short, value) => `${short} ${value}`,
      en: (short, value) => `${short} ${value}`,
      sample: ['Walk', '62nd'],
    },
    percentile: {
      fr: (rank) => `${rank}ᵉ`,
      en: (rank) => ordinal(rank, { locale: 'en' }),
      note: 'One percentile. `ordinal()` gives `62nd`, `41st`, `94th`.',
      sample: [62],
    },
    percentileRange: {
      fr: (low, high) => `${low}–${high}ᵉ`,
      en: (low, high) => `${ordinal(low, { locale: 'en' })}–${ordinal(high, { locale: 'en' })}`,
      note: 'A PLATEAU of the scale: 0% social housing covers the bottom of the '
        + 'distribution, and one percentile there would be an invention.',
      sample: [27, 53],
    },
  },

  /** What may be built here. */
  zoning: {
    zone: {
      fr: (code, label, approved) => `PLU zone ${code}${label}${approved}`,
      en: (code, label, approved) => `PLU zone ${code}${label}${approved}`,
      note: '`label` and `approved` are already prefixed with their separators.',
      sample: ['UA', ', general urban zone', ' (approved on Mar 26, 2026)'],
    },
    zoneLabel: {
      fr: (label) => `, ${label}`,
      en: (label) => `, ${label}`,
      note: 'The register’s own free-text label, clipped. Never translated.',
      keep: ['Zone urbaine générale'],
      sample: ['Zone urbaine générale'],
    },
    approvedOn: {
      fr: (date) => ` (approuvé le ${date})`,
      en: (date) => ` (approved on ${date})`,
      sample: ['Mar 26, 2026'],
    },
    none: { fr: 'PLU — aucun zonage à ce point', en: 'PLU — no zoning at this point' },
    overlap: {
      fr: (zones) => `${zones} zonages se superposent ici`
        + ' — deux communes ne placent pas leur limite au même endroit',
      en: (zones) => `${zones} zonings overlap here`
        + ' — two municipalities do not put their boundary in the same place',
      sample: [2],
    },
    easements: {
      fr: (count, families) => `${count} servitude${count > 1 ? 's' : ''}${families}`,
      en: (count, families) => `${count} ${plural(count, 'easement', 'easements')}${families}`,
      sample: [3, ', Gas pipeline, Power line'],
    },
    easementFamilies: {
      fr: (families) => `, ${families}`,
      en: (families) => `, ${families}`,
      sample: ['Gas pipeline, Power line'],
    },
  },

  /** What the ground around it sells for. */
  market: {
    withMedian: {
      fr: (price, comparable, sales, radius) => `DVF ${price} €/m² médian sur ${comparable} ventes`
        + ` comparables, ${sales} mutations dans ${radius} m`,
      en: (price, comparable, sales, radius) => `DVF median €${price}/m² over ${comparable} comparable`
        + ` sales, ${sales} transactions within ${radius} m`,
      sample: ['3,200', 24, 118, 300],
    },
    withoutMedian: {
      fr: (sales, radius) => `DVF ${sales} mutations dans ${radius} m, aucune comparable en €/m²`,
      en: (sales, radius) => `DVF ${sales} transactions within ${radius} m, none comparable per m²`,
      sample: [118, 300],
    },
  },

  /** Sources that did not answer. */
  missing: {
    fr: (sources) => `Sources muettes — ${sources}`,
    en: (sources) => `Silent sources — ${sources}`,
    sample: ['market, address'],
  },

  /** The row: the four ring chips, the X-ray door, and the bracket key. */
  row: {
    chipTitle: {
      fr: (minutes) => `Population et revenus à ${minutes} à pied de l’adresse scannée`,
      en: (minutes) => `Population and incomes ${minutes} on foot from the scanned address`,
      sample: ['10 min'],
    },
    sheet: { fr: 'RADIOGRAPHIE', en: 'X-RAY' },
    sheetOpen: {
      fr: 'Ouvrir la radiographie complète de ce point — dix thématiques, imprimable',
      en: 'Open the full X-ray of this point — ten topics, printable',
    },
    sheetClosed: {
      fr: 'Cliquez une adresse sur le globe : la radiographie s’ouvre sur ce point',
      en: 'Click an address on the globe: the X-ray opens on that point',
    },
    whole: { fr: 'Carreaux entiers', en: 'Whole cells' },
    wholeBlurb: {
      fr: 'Habitants des carreaux entièrement dans la zone — la borne basse.',
      en: 'Residents of the cells entirely inside the area — the low bound.',
    },
    centered: { fr: 'Au centre du carreau', en: 'By the cell’s center' },
    centeredBlurb: {
      fr: 'Convention usuelle : le carreau compte si son centre est dans la zone.',
      en: 'The usual convention: a cell counts if its center is in the area.',
    },
    touched: { fr: 'Carreaux touchés', en: 'Cells touched' },
    touchedBlurb: {
      fr: 'Habitants de tout carreau que la zone touche — la borne haute.',
      en: 'Residents of every cell the area touches — the high bound.',
    },
    dormant: {
      fr: (km) => `Zoome sous ${km} km pour composer une fiche`,
      en: (km) => `Zoom in below ${km} km to compose a report`,
      sample: [8],
    },
    partial: {
      fr: (sources) => `Fiche partielle — sources muettes : ${sources}`,
      en: (sources) => `Partial report — silent sources: ${sources}`,
      sample: ['market, address'],
    },
  },
});
