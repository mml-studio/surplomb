/**
 * Strings of `src/data/avisValeur.js` — the property valuation drawn beside
 * the sales it was built from.
 *
 * THIS IS THE MOST CAUTIOUS PROSE IN THE REPOSITORY, and the English keeps
 * every caveat: a range is not an error bar, a euro total is not a price
 * anyone paid, an interval on the median says nothing about where one flat
 * sits, and four different silences are four different sentences. Nothing is
 * shortened, nothing is softened.
 *
 * Numbers arrive already formatted; the subject (`60 m² apartment`) arrives
 * already built, from `subjectLabel()`, so that the two languages can put the
 * surface and the type in the order they want.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

/**
 * How many items a pre-joined list holds — `2023, 2024` is two.
 *
 * The caller formats the list before the message sees it, so the message has
 * to count the separators to choose singular or plural. A number is returned
 * as itself, so a caller that already counted keeps working.
 */
function countItems(list) {
  if (typeof list === 'number') return list;
  const text = String(list ?? '').trim();
  return text ? text.split(/\s*(?:,|·|;| and | et )\s*/).filter(Boolean).length : 0;
}

export default defineMessages({
  /** Where a comparable sits in the band this answer published. */
  band: {
    under: {
      label: { fr: 'sous la fourchette', en: 'below the range' },
      blurb: {
        fr: 'Vente comparable dont le prix au m² est sous le premier quartile des '
          + 'comparables retenues.',
        en: 'A comparable sale whose price per m² is below the first quartile of the '
          + 'comparables kept.',
      },
    },
    inside: {
      label: { fr: 'dans la fourchette', en: 'inside the range' },
      blurb: {
        fr: 'La moitié des ventes comparables : c’est la fourchette publiée, et c’est '
          + 'elle qui décrit ce que vaut le bien, pas la médiane seule.',
        en: 'Half of the comparable sales: this is the published range, and the range is '
          + 'what describes what the property is worth, not the median alone.',
      },
    },
    over: {
      label: { fr: 'au-dessus de la fourchette', en: 'above the range' },
      blurb: {
        fr: 'Vente comparable dont le prix au m² dépasse le troisième quartile des '
          + 'comparables retenues.',
        en: 'A comparable sale whose price per m² is above the third quartile of the '
          + 'comparables kept.',
      },
    },
  },

  /** A signed percentage and the two shapes of an interval. */
  percent: {
    fr: (signed) => `${signed} %`,
    en: (signed) => `${signed}%`,
    note: 'The sign is already on the number (`+12,4`, `−3,2`).',
    sample: ['+12.4'],
  },
  deviationSymmetric: {
    fr: (half) => `±${half} %`,
    en: (half) => `±${half}%`,
    sample: ['3.2'],
  },
  deviationAsymmetric: {
    fr: (low, high) => `−${low} % / +${high} %`,
    en: (low, high) => `−${low}% / +${high}%`,
    note: 'An interval built from order statistics is asymmetric whenever the sample is.',
    sample: ['40', '12'],
  },

  /** The editions the comparables were drawn from. */
  years: {
    one: { fr: (year) => `édition ${year}`, en: (year) => `edition ${year}`, sample: [2025] },
    two: {
      fr: (first, second) => `éditions ${first} et ${second}`,
      en: (first, second) => `editions ${first} and ${second}`,
      sample: [2024, 2025],
    },
    span: {
      fr: (first, last) => `éditions ${first} à ${last}`,
      en: (first, last) => `editions ${first} to ${last}`,
      sample: [2021, 2025],
    },
  },

  /** What is being valued: a type from the register, and a surface. */
  subject: {
    fr: (type, surface) => `${type} de ${surface} m²`,
    en: (type, surface) => `${surface} m² ${type.toLowerCase()}`,
    note: '`type` is a DVF `type_local`, already displayed through `labelFor`.',
    sample: ['Apartment', 60],
  },
  subjectLower: {
    fr: (type, surface) => `${type.toLowerCase()} de ${surface} m²`,
    en: (type, surface) => `${surface} m² ${type.toLowerCase()}`,
    note: 'The same phrase inside a sentence, where French lower-cases the type.',
    sample: ['Apartment', 60],
  },

  /** The four silences, each said as itself. */
  refusal: {
    notCovered: {
      fr: 'Le registre DVF ne couvre pas ce département : Bas-Rhin, Haut-Rhin, Moselle et '
        + 'Mayotte relèvent du livre foncier, pas du fichier immobilier. Ce n’est pas '
        + '« aucune vente ici », c’est « ce fichier n’existe pas ici ».',
      en: 'The DVF register does not cover this department: Bas-Rhin, Haut-Rhin, Moselle and '
        + 'Mayotte are held in the livre foncier, the land register inherited from German '
        + 'law, not in the fichier immobilier. This is not “no sale here”, it is “this file '
        + 'does not exist here”.',
    },
    noComparable: {
      fr: (minimum, subject) => `Aucune vente comparable dans ces éditions, jusqu’à la commune `
        + `entière : moins de ${minimum} ventes d’un ${subject}. `
        + 'Rien n’est publié plutôt qu’un chiffre emprunté ailleurs.',
      en: (minimum, subject) => `No comparable sale in these editions, up to the whole `
        + `municipality: fewer than ${minimum} sales of a ${subject}. `
        + 'Nothing is published rather than a figure borrowed from somewhere else.',
      sample: [5, '60 m² apartment'],
    },
    centreSofter: {
      fr: (count) => `Fourchette seulement : sur ${count} ventes comparables, l’intervalle sur `
        + 'la médiane n’est pas plus étroit que l’écart interquartile — on ne connaît pas le '
        + 'milieu mieux que le marché n’est dispersé, donc le milieu n’ajoute rien à la '
        + 'fourchette. Cas limite compris : un échantillon sans dispersion du tout, où '
        + 'l’intervalle serait de largeur nulle et se lirait comme une certitude.',
      en: (count) => `Range only: over ${count} comparable sales, the interval on the median `
        + 'is no narrower than the interquartile spread — the middle is not known any better '
        + 'than the market is dispersed, so the middle adds nothing to the range. Edge case '
        + 'included: a sample with no dispersion at all, where the interval would be of zero '
        + 'width and would read as a certainty.',
      sample: [7],
    },
    intervalTooWide: {
      fr: (count, deviation) => `Fourchette seulement : sur ${count} ventes comparables, une `
        + 'des deux bornes de l’intervalle sur la médiane s’écarte de plus de '
        + `${deviation} % du milieu. Un nombre qui peut être faux d’un cinquième n’est pas `
        + 'un nombre.',
      en: (count, deviation) => `Range only: over ${count} comparable sales, one of the two `
        + `ends of the interval on the median is more than ${deviation}% away from the `
        + 'middle. A number that can be wrong by a fifth is not a number.',
      sample: [9, 20],
    },
    unexplained: {
      fr: 'Estimation retenue, sans raison publiée — cet état ne devrait pas exister.',
      en: 'Valuation withheld, with no published reason — this state should not exist.',
    },
  },

  /** The subject's card: the whole answer, in the order a reader needs it. */
  card: {
    title: {
      fr: (subject) => `${subject} — estimation`,
      en: (subject) => `${subject} — valuation`,
      sample: ['60 m² apartment'],
    },
    noValue: { fr: 'pas de valeur publiée', en: 'no value published' },
    median: {
      fr: (price, count) => `${price} — médiane de ${count} ventes comparables`,
      en: (price, count) => `${price} — median of ${count} comparable sales`,
      sample: ['€8,956/m²', 42],
    },
    range: {
      fr: (low, high) => `fourchette ${low} à ${high} — la moitié des ventes comparables`,
      en: (low, high) => `range ${low} to ${high} — half of the comparable sales`,
      sample: ['€8,001/m²', '€10,505/m²'],
    },
    rangeInEuros: {
      fr: (low, high, surface) => `soit ${low} à ${high} ramené aux ${surface} m² du sujet `
        + '— pas des prix payés',
      en: (low, high, surface) => `that is ${low} to ${high} scaled to the subject’s `
        + `${surface} m² — not prices anyone paid`,
      sample: ['€417,000', '€545,000', 60],
    },
    middle: {
      fr: (deviation, low, high, coverage) => `milieu connu à ${deviation} (${low} à ${high}, `
        + `intervalle à ${coverage} % sous l’hypothèse que ces ventes se comportent comme un `
        + 'tirage indépendant du marché local)',
      en: (deviation, low, high, coverage) => `middle known to ${deviation} (${low} to `
        + `${high}, interval at ${coverage}% on the assumption that these sales behave as an `
        + 'independent draw from the local market)',
      sample: ['±3.2%', '€8,700/m²', '€9,270/m²', 90],
    },
    measuredOn: {
      fr: (rung) => `mesuré sur ${rung}`,
      en: (rung) => `measured on ${rung}`,
      note: '`rung` is a rung of the ladder (`avisValeurFeed.i18n.js`).',
      sample: ['300 m, ±20% on surface'],
    },
    surfaceMedian: {
      fr: (surface) => `surface médiane des comparables ${surface} m²`,
      en: (surface) => `median surface of the comparables ${surface} m²`,
      sample: [52],
    },
    landMedian: {
      fr: (surface) => `terrain médian ${surface} m² — le prix d’une maison porte son terrain `
        + 'et rien ici ne le neutralise',
      en: (surface) => `median land ${surface} m² — a house’s price carries its land and `
        + 'nothing here factors it out',
      sample: ['640'],
    },
    drift: {
      fr: (percent, from, to) => `médian communal ${percent} de ${from} à ${to} — mesuré, `
        + 'jamais appliqué : aucune vente n’est ramenée à l’argent d’une autre année',
      en: (percent, from, to) => `municipal median ${percent} from ${from} to ${to} — `
        + 'measured, never applied: no sale is restated in another year’s money',
      sample: ['+12.4%', '2021', '2024'],
    },
    symbolic: {
      fr: (count) => `dont ${count} vente(s) déclarée(s) sous 10 000 € — gardées et signalées, `
        + 'pas filtrées',
      en: (count) => `including ${count} ${plural(count, 'sale', 'sales', { locale: 'en' })} declared under €10,000 — kept and flagged, `
        + 'not filtered out',
      sample: [2],
    },
    missingYears: {
      fr: (years) => `millésime(s) ${years} indisponible(s) au moment du calcul — `
        + 'l’échantillon est plus mince que la fenêtre annoncée',
      en: (years) => `${plural(countItems(years), 'vintage', 'vintages', { locale: 'en' })} ${years} unavailable when this was computed — the sample is `
        + 'thinner than the window announced',
      sample: ['2025'],
    },
    notRegulated: {
      fr: 'estimation Surplomb à partir des comparables DVF — pas un avis de valeur réglementaire',
      en: 'Surplomb valuation from DVF comparables — not a regulated valuation report',
      note: 'An *avis de valeur* is a regulated document in France; this is not one.',
    },
  },

  /** The chips: the subject the layer is asking about. */
  chips: {
    surface: {
      fr: (surface) => `Sujet de ${surface} m² — choisit la bande de surface des comparables, `
        + 'pas seulement le multiplicateur',
      en: (surface) => `${surface} m² subject — chooses the comparables’ surface band, not `
        + 'just the multiplier',
      sample: [60],
    },
    comparablesKept: {
      fr: (count) => ` — ${count} comparables retenues`,
      en: (count) => ` — ${count} comparables kept`,
      note: 'Appended to the active surface chip’s title once a scan has answered.',
      sample: [42],
    },
    followCamera: { fr: 'Suivre la caméra', en: 'Follow the camera' },
    followCameraTitle: {
      fr: 'Relâcher le point choisi et estimer à nouveau sous la caméra — le point choisi '
        + 'n’est PAS transporté par un lien de partage, qui rouvre sous la caméra',
      en: 'Release the chosen point and value again under the camera — the chosen point is '
        + 'NOT carried by a share link, which reopens under the camera',
    },
  },

  /** The key, headed by the answer itself. */
  legend: {
    answerChannel: { fr: 'Ce qu’il vaut', en: 'What it is worth' },
    salesChannel: { fr: 'Les ventes qui le disent', en: 'The sales that say so' },
    headline: {
      fr: (subject, value) => `${subject} — ${value}`,
      en: (subject, value) => `${subject} — ${value}`,
      sample: ['60 m² apartment', '€444,000'],
    },
    headlineBlurb: {
      fr: (count, price, rung) => `Médiane de ${count} ventes comparables à ${price}, `
        + `retenues sur ${rung}. `
        + 'Le compte est le nombre de ventes derrière le chiffre, pas le nombre de logements '
        + 'du quartier.',
      en: (count, price, rung) => `Median of ${count} comparable sales at ${price}, kept on `
        + `${rung}. `
        + 'The count is the number of sales behind the figure, not the number of dwellings in '
        + 'the neighborhood.',
      note: '`rung` already carries the editions when there are any.',
      sample: [42, '€8,956/m²', '300 m, ±20% on surface, editions 2024 and 2025'],
    },
    headlineWithYears: {
      fr: (rung, years) => `${rung}, ${years}`,
      en: (rung, years) => `${rung}, ${years}`,
      sample: ['300 m, ±20% on surface', 'editions 2024 and 2025'],
    },
    noValue: {
      fr: (subject) => `${subject} — pas de valeur publiée`,
      en: (subject) => `${subject} — no value published`,
      sample: ['60 m² apartment'],
    },
    range: {
      fr: (low, high) => `fourchette ${low} à ${high}`,
      en: (low, high) => `range ${low} to ${high}`,
      sample: ['€8,001/m²', '€10,505/m²'],
    },
    rangeBlurb: {
      fr: (subject, low, high) => 'La moitié des ventes comparables ont changé de main dans '
        + `cette bande de prix au m². Aux mêmes prix, ${subject} vaudrait ${low} à ${high} — `
        + 'ce ne sont PAS les prix des ventes comparables, qui n’ont pas toutes cette '
        + 'surface. Et ce n’est pas une barre d’erreur qui rétrécit quand les données '
        + 's’accumulent : c’est la dispersion du marché. Où se situe CE bien-là dedans — '
        + 'étage, état, vue, exposition — le registre ne le dit pas, et la fourchette ne le '
        + 'borne pas non plus.',
      en: (subject, low, high) => 'Half of the comparable sales changed hands inside this '
        + `band of prices per m². At those prices a ${subject} would be worth ${low} to `
        + `${high} — these are NOT the prices of the comparable sales, which do not all have `
        + 'this surface. And it is not an error bar that shrinks as data piles up: it is the '
        + 'dispersion of the market. Where THIS property sits inside it — floor, condition, '
        + 'view, aspect — the register does not say, and the range does not bound it either.',
      sample: ['60 m² apartment', '€417,000', '€545,000'],
    },
    middle: {
      fr: (deviation) => `milieu connu à ${deviation}`,
      en: (deviation) => `middle known to ${deviation}`,
      sample: ['±3.2%'],
    },
    middleBlurb: {
      fr: (low, high, coverage) => `Intervalle sur la médiane, ${low} à ${high}, couverture `
        + `${coverage} %. `
        + 'Il dit à quel point le MILIEU de la fourchette est fermement placé, pas où le bien '
        + 'se situe dedans : deux incertitudes différentes, qui ne se mélangent pas. Exact '
        + 'pour un tirage INDÉPENDANT du marché local ; et l’échelon retenu ayant été choisi '
        + 'sur ces mêmes prix, cela ne peut que baisser la couverture réelle — mesuré à '
        + '91,9–92,8 % sur quatre communes réelles.',
      en: (low, high, coverage) => `Interval on the median, ${low} to ${high}, coverage `
        + `${coverage}%. `
        + 'It says how firmly the MIDDLE of the range is placed, not where the property sits '
        + 'inside it: two different uncertainties, which do not mix. Exact for an INDEPENDENT '
        + 'draw from the local market; and since the rung was itself chosen on these same '
        + 'prices, that can only lower the real coverage — measured at 91.9–92.8% on four '
        + 'real municipalities.',
      sample: ['€8,700/m²', '€9,270/m²', 90],
    },
    drift: {
      fr: (percent, from, to) => `médian communal ${percent} (${from} → ${to})`,
      en: (percent, from, to) => `municipal median ${percent} (${from} → ${to})`,
      sample: ['+12.4%', '2021', '2024'],
    },
    driftBlurb: {
      fr: 'Mesuré et affiché, jamais appliqué : aucune vente n’est ramenée à l’argent d’une '
        + 'autre année.',
      en: 'Measured and shown, never applied: no sale is restated in another year’s money.',
    },
    driftLoud: {
      fr: ' Au-delà de 10 %, une comparable de deux ans se lit avec ça en tête.',
      en: ' Past 10%, a two-year-old comparable is read with that in mind.',
      note: 'Appended to the drift blurb when the market moved more than 10%.',
    },
    method: {
      fr: 'Estimation Surplomb sur comparables DVF',
      en: 'Surplomb valuation on DVF comparables',
    },
  },

  /** The A5 line: what the estimate refused, dropped or could not carry. */
  disclosure: {
    dropped: {
      fr: (list) => `Écartées : ${list}`,
      en: (list) => `Dropped: ${list}`,
      note: '`list` is already joined (`3 off-plan (VEFA), 1 at one euro`).',
      sample: ['3 off-plan (VEFA), 1 at one euro'],
    },
    droppedItem: {
      fr: (count, reason) => `${count} ${reason}`,
      en: (count, reason) => `${count} ${reason}`,
      sample: [3, 'off-plan (VEFA)'],
    },
    vefa: { fr: 'en VEFA', en: 'off-plan (VEFA)' },
    zeroPrice: { fr: 'à un euro', en: 'at one euro' },
    unplaced: { fr: 'sans coordonnée', en: 'with no coordinate' },
    otherType: { fr: 'de l’autre type de logement', en: 'of the other dwelling type' },
    notPriceable: { fr: 'sans €/m² exploitable', en: 'with no usable €/m²' },
    truncated: {
      fr: (served, kept) => `${served} comparables dessinées sur ${kept} retenues — `
        + 'les statistiques portent sur toutes',
      en: (served, kept) => `${served} comparables drawn out of ${kept} kept — the statistics `
        + 'cover them all',
      sample: [120, 412],
    },
    missingYears: {
      fr: (years) => `millésime(s) ${years} non téléchargé(s) — ces éditions EXISTENT et ne `
        + 'sont pas arrivées : l’échantillon est plus mince que la fenêtre annoncée',
      en: (years) => `${plural(countItems(years), 'vintage', 'vintages', { locale: 'en' })} ${years} not downloaded — those editions EXIST and did not `
        + 'arrive: the sample is thinner than the window announced',
      sample: ['2025'],
    },
    driftUnmeasurable: {
      fr: (solid, perYear) => 'dérive du marché non mesurable ici — il faut deux millésimes '
        + `d’au moins 30 ventes comparables, cette commune en a ${solid} (${perYear})`,
      en: (solid, perYear) => 'market drift cannot be measured here — it takes two vintages of '
        + `at least 30 comparable sales, this municipality has ${solid} (${perYear})`,
      sample: [1, '2024 41 sale(s), 2025 12 sale(s)'],
    },
    driftYear: {
      fr: (year, count) => `${year} ${count} vente(s)`,
      en: (year, count) => `${year} ${count} ${plural(count, 'sale', 'sales', { locale: 'en' })}`,
      sample: [2024, 41],
    },
    driftNoYear: { fr: 'aucun millésime', en: 'no vintage' },
    pinned: {
      fr: 'le point choisi ne voyage PAS dans le lien de partage, qui rouvre sous la caméra',
      en: 'the chosen point does NOT travel in the share link, which reopens under the camera',
    },
  },

  /** A comparable's own card. */
  comparable: {
    name: { fr: 'Vente comparable', en: 'Comparable sale' },
    rooms: {
      fr: (rooms) => `${rooms} pièces`,
      en: (rooms) => `${rooms} rooms`,
      sample: [3],
    },
    distance: {
      fr: (metres) => `${metres} m du point estimé`,
      en: (metres) => `${metres} m from the point valued`,
      sample: [164],
    },
  },

  /** What a voice answer is ABOUT, before any figure. */
  voice: {
    pendingSubject: { fr: 'estimation immobilière', en: 'property valuation' },
    subject: {
      fr: (type, surface) => `estimation d’un bien de type ${type} de ${surface} m²`,
      en: (type, surface) => `valuation of a ${surface} m² ${type.toLowerCase()}`,
      note: '`type` is the DVF `type_local` of the subject, already displayed.',
      sample: ['Apartment', 60],
    },
  },
});
