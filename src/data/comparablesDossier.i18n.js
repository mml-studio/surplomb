/**
 * Strings of `src/data/comparablesDossier.js` — the agent's own shortlist of
 * comparables, and the card that argues an estimate out of it.
 *
 * THIS CARD IS PUT IN FRONT OF A CLIENT, and three habits of it must survive
 * the translation:
 *
 *  - the TWO SAMPLES STAY APART. Recorded sales (DVF) are observed prices;
 *    listings are asking prices typed in by hand. They are never merged, and
 *    the gap between them is labeled as what it is — other properties, at
 *    other dates, with no time adjustment — and never as a negotiating margin.
 *  - EVERY BLOCKING REASON IS NAMED, not the first one found. A reader told
 *    the surface is missing, who fills it in and still gets no range because
 *    the sample was short all along, has been sent round a corner.
 *  - EVERY EXCLUSION IS COUNTED. A row outside the plausibility bounds, a
 *    multi-lot sale, a row with no position: each is named with its count, in
 *    words, because a silent exclusion is the failure this repository refuses.
 *
 * `vente` and `annonce` are DATA: they are the kind a stored dossier carries,
 * and an exported JSON file names them. Neither is ever translated.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun, monthName, plural } from '../i18n/format.js';

/** Why a row carries no €/m². Keyed by the reason the dossier stores. */
export const COMPARABLE_REFUSALS = defineMessages({
  surface: { fr: 'sans surface', en: 'no area' },
  prix: { fr: 'sans prix', en: 'no price' },
  lots: {
    fr: (n) => `${n >= 2 ? 'ventes' : 'vente'} de plusieurs lots`,
    en: (n) => `multi-lot ${plural(n, 'sale', 'sales')}`,
    note: 'The register only publishes a €/m² when the mutation bought exactly '
      + 'one dwelling; dividing anyway is the €1.28 million per m² arithmetic.',
    sample: [2],
  },
  bornes: {
    fr: (low, high) => `hors bornes ${low}–${high} €/m²`,
    en: (low, high) => `outside the €${low}–${high}/m² bounds`,
    note: 'Not a market judgement — a filter on typing: a missing zero, a '
      + 'surface typed in hectares, a price in the area field.',
    sample: [300, '30,000'],
  },
});

export default defineMessages({
  /** What a row is called when the register published no address. */
  fallbackLabel: {
    vente: { fr: 'Vente sans adresse publiée', en: 'Sale with no published address' },
    annonce: { fr: 'Annonce sans adresse', en: 'Listing with no address' },
  },

  /** A date, and the two ways a comparable is dated. */
  date: {
    fr: (year, month, day) => `${day}/${month}/${year}`,
    en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
    sample: ['2024', '10', '04'],
  },

  /** The dossier card: the subject, the two samples, the range, the exclusions. */
  dossier: {
    subject: {
      fr: (label, traits) => `Bien étudié — ${label}${traits}`,
      en: (label, traits) => `Property studied — ${label}${traits}`,
      sample: ['20 Place Bellecour', ' (76 m², 3 rooms)'],
    },
    subjectTraits: {
      fr: (traits) => ` (${traits})`,
      en: (traits) => ` (${traits})`,
      sample: ['76 m², 3 rooms'],
    },
    subjectPoint: { fr: 'point posé sur la carte', en: 'point placed on the map' },
    rooms: {
      fr: (rooms, n) => `${rooms} ${Math.abs(n) >= 2 ? 'pièces' : 'pièce'}`,
      en: (rooms, n) => `${rooms} ${plural(n, 'room', 'rooms')}`,
      note: '`rooms` is the count already grouped; `n` is the number it came from. '
        + 'French takes the plural at 2, English at anything but 1.',
      sample: ['3', 3],
    },
    noSubject: {
      fr: 'Aucun bien défini — posez le bien avant de retenir des comparables',
      en: 'No property defined — place the property before shortlisting comparables',
    },
    empty: {
      fr: 'Aucun comparable retenu — le dossier est vide',
      en: 'No comparable shortlisted — the file is empty',
    },
    counts: {
      fr: (retained, ventes, annonces, dropped) => `${retained}`
        + ` — ${ventes}, ${annonces}${dropped}`,
      en: (retained, ventes, annonces, dropped) => `${retained}`
        + ` — ${ventes}, ${annonces}${dropped}`,
      note: 'Each part is already a count and its noun.',
      sample: ['12 comparables shortlisted', '8 DVF sales', '4 listings entered', ' (2 left out of the calculation)'],
    },
    retained: {
      fr: (n) => `${countNoun(n, 'comparable', 'comparables')} ${n >= 2 ? 'retenus' : 'retenu'}`,
      en: (n) => `${countNoun(n, 'comparable', 'comparables')} shortlisted`,
      sample: [12],
    },
    ventes: {
      fr: (n) => `${countNoun(n, 'vente', 'ventes')} DVF`,
      en: (n) => `${countNoun(n, 'DVF sale', 'DVF sales')}`,
      sample: [8],
    },
    annonces: {
      fr: (n) => `${countNoun(n, 'annonce', 'annonces')} ${n >= 2 ? 'saisies' : 'saisie'}`,
      en: (n) => `${countNoun(n, 'listing', 'listings')} entered`,
      sample: [4],
    },
    dropped: {
      fr: (n) => ` (${n} ${n >= 2 ? 'écartés' : 'écarté'} du calcul)`,
      en: (n) => ` (${n} left out of the calculation)`,
      sample: [2],
    },
    salesMedian: {
      fr: (median, sample, p25, p75) => `Ventes DVF — ${median} €/m² médian`
        + ` sur ${sample}, quartiles ${p25} à ${p75}`,
      en: (median, sample, p25, p75) => `DVF sales — median €${median}/m²`
        + ` over ${sample}, quartiles €${p25} to €${p75}`,
      sample: ['3,200', 8, '2,900', '3,600'],
    },
    salesNoRatio: {
      fr: (n) => `Ventes DVF — ${n} retenues, aucune comparable en €/m²`,
      en: (n) => `DVF sales — ${n} shortlisted, none comparable per m²`,
      sample: [3],
    },
    listingsMedian: {
      fr: (median, sample, p25, p75) => `Annonces — ${median} €/m² médian demandé`
        + ` sur ${sample}, quartiles ${p25} à ${p75}`,
      en: (median, sample, p25, p75) => `Listings — median asking €${median}/m²`
        + ` over ${sample}, quartiles €${p25} to €${p75}`,
      sample: ['3,500', 4, '3,200', '3,900'],
    },
    listingsNoRatio: {
      fr: (n) => `Annonces — ${n} saisies, aucune comparable en €/m²`,
      en: (n) => `Listings — ${n} entered, none comparable per m²`,
      sample: [2],
    },
    gap: {
      fr: (gap, annonces, ventes) => `Écart affichage sur acte ${gap} %`
        + ` — ${annonces} contre ${ventes}`,
      en: (gap, annonces, ventes) => `Asking-over-deed gap ${gap}%`
        + ` — ${annonces} against ${ventes}`,
      note: 'The two sample sizes travel with the percentage: a median of one '
        + 'listing against a median of two sales is legitimate to print and '
        + 'illegitimate to print alone.',
      sample: ['+8.4', '4 listings', '8 sales'],
    },
    gapAnnonces: {
      fr: (n) => countNoun(n, 'annonce', 'annonces'),
      en: (n) => countNoun(n, 'listing', 'listings'),
      sample: [4],
    },
    gapVentes: {
      fr: (n) => countNoun(n, 'vente', 'ventes'),
      en: (n) => countNoun(n, 'sale', 'sales'),
      sample: [8],
    },
    gapCaveat: {
      fr: 'Ce n’est pas une marge de négociation — ce sont d’autres biens,'
        + ' à d’autres dates, et aucun ajustement temporel n’est appliqué',
      en: 'This is not a negotiating margin — these are other properties,'
        + ' at other dates, with no time adjustment applied',
    },
    range: {
      fr: (basis, low, high, mid) => `Fourchette ${basis} — ${low}`
        + ` à ${high}, médiane ${mid}`,
      en: (basis, low, high, mid) => `Range ${basis} — ${low}`
        + ` to ${high}, median ${mid}`,
      sample: ['on recorded sales', '€236,000', '€274,000', '€250,000'],
    },
    basisSales: { fr: 'sur les ventes actées', en: 'on recorded sales' },
    basisListings: {
      fr: 'sur les prix demandés, faute de ventes en nombre',
      en: 'on asking prices, for want of enough sales',
    },
    spread: {
      fr: (sample, short) => `Écart interquartile sur ${sample} comparables`
        + ` — une dispersion observée, pas un intervalle de confiance${short}`,
      en: (sample, short) => `Interquartile spread over ${sample} comparables`
        + ` — an observed dispersion, not a confidence interval${short}`,
      sample: [8, ', and the sample is short'],
    },
    spreadShort: {
      fr: ', et l’échantillon est court',
      en: ', and the sample is short',
    },
    noRange: {
      fr: (reasons) => `Pas de fourchette — ${reasons}`,
      en: (reasons) => `No range — ${reasons}`,
      sample: ['property area not entered'],
    },
    blockingUnknown: { fr: 'raison indéterminée', en: 'reason undetermined' },
    blockingNoSubject: { fr: 'aucun bien défini', en: 'no property defined' },
    blockingNoSurface: {
      fr: 'surface du bien non renseignée',
      en: 'property area not entered',
    },
    blockingBadSurface: {
      fr: 'surface du bien nulle ou négative',
      en: 'property area zero or negative',
    },
    blockingHugeSurface: {
      fr: (max) => `surface du bien au-delà de ${max} m², probablement une faute de frappe`,
      en: (max) => `property area beyond ${max} m², probably a typo`,
      sample: ['100,000'],
    },
    blockingShortSample: {
      fr: (min) => `moins de ${min} comparables avec un €/m²`,
      en: (min) => `fewer than ${min} comparables with a €/m²`,
      sample: [3],
    },
    excluded: {
      fr: (reasons) => `Écartés du calcul — ${reasons}`,
      en: (reasons) => `Left out of the calculation — ${reasons}`,
      sample: ['2 no area, 1 multi-lot sale'],
    },
    refusal: {
      fr: (n, words) => `${n} ${words}`,
      en: (n, words) => `${n} ${words}`,
      sample: [2, 'no area'],
    },
    unplacedAllCounted: {
      fr: (unplaced, n) => `${unplaced} sans position`
        + ` — ${n >= 2 ? 'comptés' : 'compté'} dans les médianes, `
        + `${n >= 2 ? 'absents' : 'absent'} de la carte`,
      en: (unplaced, n) => `${unplaced} with no position`
        + ' — counted in the medians, absent from the map',
      note: '“Counted in the medians” used to be printed for every unplaced row, '
        + 'including rows with no ratio at all. Two facts, two sentences.',
      sample: ['3 comparables', 3],
    },
    unplacedSomeCounted: {
      fr: (unplaced, counted, n) => `${unplaced} sans position, dont ${counted}`
        + ` dans les médianes — ${n >= 2 ? 'absents' : 'absent'} de la carte`,
      en: (unplaced, counted, n) => `${unplaced} with no position, ${counted} of them`
        + ' in the medians — absent from the map',
      sample: ['3 comparables', '2', 3],
    },
    unplacedCount: {
      fr: (n) => countNoun(n, 'comparable', 'comparables'),
      en: (n) => countNoun(n, 'comparable', 'comparables'),
      sample: [3],
    },
    stale: {
      fr: (listings, days) => `${listings} de plus de ${days} jours`
        + ' — une annonce ancienne est un prix que le marché a déjà refusé',
      en: (listings, days) => `${listings} older than ${days} days`
        + ' — an old listing is a price the market has already refused',
      sample: ['2 listings', 180],
    },
    staleCount: {
      fr: (n) => countNoun(n, 'annonce', 'annonces'),
      en: (n) => countNoun(n, 'listing', 'listings'),
      sample: [2],
    },
    farthest: {
      fr: (metres) => `Comparable le plus éloigné à ${metres} m du bien`,
      en: (metres) => `Farthest comparable ${metres} m from the property`,
      sample: ['840'],
    },
  },

  /** One comparable's own card. */
  comparable: {
    sale: {
      fr: 'Vente DVF — prix acté, source DGFiP',
      en: 'DVF sale — deed price, source DGFiP',
    },
    listing: {
      fr: 'Annonce saisie — prix demandé, saisi par le conseiller',
      en: 'Listing entered — asking price, entered by the agent',
    },
    price: {
      fr: (price, traits) => `${price}${traits}`,
      en: (price, traits) => `${price}${traits}`,
      sample: ['€245,000', ' — 76 m², 3 rooms'],
    },
    priceTraits: {
      fr: (traits) => ` — ${traits}`,
      en: (traits) => ` — ${traits}`,
      sample: ['76 m², 3 rooms'],
    },
    prixM2: {
      fr: (value) => `${value} €/m²`,
      en: (value) => `€${value}/m²`,
      sample: ['3,200'],
    },
    noPrixM2: {
      fr: (reason) => `Pas de €/m² — ${reason}`,
      en: (reason) => `No €/m² — ${reason}`,
      sample: ['no area'],
    },
    missingData: { fr: 'donnée manquante', en: 'missing data' },
    mutation: {
      fr: (date, age) => `Mutation du ${date}${age}`,
      en: (date, age) => `Deed dated ${date}${age}`,
      sample: ['Oct 4, 2024', ' (11 months)'],
    },
    collected: {
      fr: (date, age) => `Relevée le ${date}${age}`,
      en: (date, age) => `Recorded on ${date}${age}`,
      sample: ['Oct 4, 2024', ' (11 months)'],
    },
    age: {
      fr: (months, n) => ` (${months} mois)`,
      en: (months, n) => ` (${months} ${plural(n, 'month', 'months')})`,
      sample: ['11', 11],
    },
    undated: {
      fr: 'Sans date — l’ancienneté de ce comparable est inconnue',
      en: 'Undated — the age of this comparable is unknown',
    },
    distance: {
      fr: (metres) => `À ${metres} m du bien étudié`,
      en: (metres) => `${metres} m from the property studied`,
      sample: ['420'],
    },
    portal: {
      fr: (portal) => `Vue sur ${portal}`,
      en: (portal) => `Seen on ${portal}`,
      note: 'The portal is the hostname the agent pasted: data.',
      sample: ['seloger.com'],
    },
  },
});
