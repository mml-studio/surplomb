/**
 * Strings of `src/data/delinquanceFrance.js` — the Recorded crime layer.
 *
 * THIS IS NOT A MAP OF CRIME, AND THE ENGLISH SAYS SO AS OFTEN AS THE FRENCH.
 * It is a map of what police and gendarmerie REGISTERED, and every card, every
 * legend row and every chip title carries that sentence. A choropleth of this
 * data with no caveat is a defamation machine pointed at whole municipalities,
 * so nothing here is dropped for length in translation: the compact register
 * keeps each rule's CLAIM in one line of ≤ 60 characters, and the `méthodo`
 * register puts the publisher's own sentences back.
 *
 * THE THREE STATES ARE THE LAYER, AND THEY MAY NEVER BLUR. `published` is a
 * measured rate; `zero` is a deliberate published zero, three years running;
 * `suppressed` is a cell the register withheld — NOT zero, NOT bounded above,
 * and not knowable here. Half of this map is the third one. The English words
 * are chosen so no two of them can be read as each other: *published*,
 * *no fact recorded*, *not released*. A fourth, *absent from this edition*,
 * means the register does not mention the municipality at all.
 *
 * THE VOCABULARY. *Minorant* is a **lower bound**: the computed total sums the
 * published contributors only, so wherever the register withholds one the
 * number is a floor and the card says so in capitals. *Secret statistique* is
 * **statistical confidentiality**. *Mis en cause* is a **named suspect** — a
 * person the police identified, never a person charged or convicted, and the
 * distinction is what makes those indicators a measure of police activity.
 * The three-state labels, the eighteen indicator names, the units and the four
 * quoted rules live in `delinquanceFeed.i18n.js`, next to the join keys they
 * are the display of.
 *
 * Every number arrives formatted (`formatNumber`, `formatDecimal`).
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** The Cesium data source that holds the 96 département polygons. */
  departementSourceName: {
    fr: 'Délinquance enregistrée — taux par département',
    en: 'Recorded crime — rate by department',
    note: 'An internal name for the loaded GeoJSON, not a caption a reader sees.',
  },

  /** The one value a card prints when there is no number at all. */
  noValue: { fr: '—', en: '—' },

  /**
   * The three states under the COMPUTED TOTAL, where they mean something
   * different — `published` in particular stops meaning "measured" and starts
   * meaning "measured floor".
   */
  totalStateBlurbs: {
    published: {
      fr: 'Somme des indicateurs DIFFUSÉS pour cette maille — total calculé par '
        + 'Surplomb, pas publié par le SSMSI. Dès qu’un indicateur y est non diffusé, c’est un '
        + 'MINORANT : le vrai total est plus élevé, d’un montant inconnu. Unités mélangées '
        + '(victimes, infractions, véhicules, mis en cause).',
      en: 'Sum of the indicators RELEASED for this spatial unit — a total computed by Surplomb, '
        + 'not published by the SSMSI. As soon as one indicator is withheld here it is a LOWER '
        + 'BOUND: the real total is higher, by an unknown amount. Mixed units (victims, '
        + 'offenses, vehicles, named suspects).',
    },
    zero: {
      fr: 'Aucun fait enregistré sur AUCUN des indicateurs, et aucun n’est non diffusé. Un zéro '
        + 'complet et mesuré — 243 communes sur 34 920 en 2025.',
      en: 'No fact recorded on ANY of the indicators, and none of them is withheld. A complete, '
        + 'measured zero — 243 municipalities of 34,920 in 2025.',
    },
    suppressed: {
      fr: 'Rien de publié et au moins un indicateur retenu au titre du secret statistique : '
        + 'il n’y a pas de total honnête à afficher. Ce n’est ni zéro, ni « peu » — c’est inconnu.',
      en: 'Nothing published and at least one indicator withheld under statistical '
        + 'confidentiality: there is no honest total to show. This is not zero, and not “few” — '
        + 'it is unknown.',
    },
  },

  /**
   * One line behind each legend swatch.
   *
   * Hover copy on the layer row, so the surface with no length budget at all
   * — which is why the reporting-rate rule lives here in full as well as
   * behind the `méthodo` chip. Whatever a card compresses, the panel still
   * says word for word.
   */
  stateBlurbs: {
    published: {
      fr: (plainteRule) => 'Taux publié par le SSMSI. C’est de la délinquance ENREGISTRÉE : ce '
        + `que la police et la gendarmerie ont consigné, pas ce qui s’est produit. ${plainteRule}`,
      en: (plainteRule) => 'Rate published by the SSMSI. This is RECORDED crime: what police and '
        + `gendarmerie wrote down, not what happened. ${plainteRule}`,
      note: '`plainteRule` is the SSMSI’s own reporting-rate sentence, quoted.',
      sample: ['“The propensity to file a complaint has an impact…”'],
    },
    zero: {
      fr: (zeroRule) => `Aucun fait enregistré. ${zeroRule} — c’est une valeur publiée, pas un trou.`,
      en: (zeroRule) => `No fact recorded. ${zeroRule} — this is a published value, not a hole.`,
      sample: ['“The published database also provides…”'],
    },
    /**
     * The rule word for word, because the paraphrase this row used to carry
     * («entre 1 et 5 faits») is refuted by the register itself: 4 735 of the
     * 251 145 suppressed 2025 cells published more than 5 facts in 2023 or 2024.
     */
    suppressed: {
      fr: (suppressionRule) => `Non diffusé, au titre du secret statistique. ${suppressionRule} `
        + 'Le critère porte sur trois années, pas sur la valeur affichée : ce n’est NI zéro, NI '
        + 'forcément une valeur basse — c’est inconnu.',
      en: (suppressionRule) => 'Not released, under statistical confidentiality. '
        + `${suppressionRule} The criterion is about three years, not about the value on `
        + 'display: this is NEITHER zero NOR necessarily a low value — it is unknown.',
      sample: ['“Published data is limited to municipalities…”'],
    },
    missing: {
      fr: 'Cette commune n’a aucune ligne pour cet indicateur dans cette édition. Ce n’est ni '
        + 'zéro, ni un secret : le registre ne la mentionne pas. Le remplissage est volontairement '
        + 'le plus sombre et le plus transparent de la carte — plus proche du fond que de la bande '
        + 'la plus basse.',
      en: 'This municipality has no row at all for this indicator in this edition. It is neither '
        + 'zero nor a secret: the register does not mention it. The fill is deliberately the '
        + 'darkest and the most transparent on the map — closer to the backdrop than to the '
        + 'lowest band.',
    },
  },

  /** The measured value of one cell, count first and rate second. */
  value: {
    /** `2 597 victimes` — the noun comes from the register's own `unite`. */
    count: {
      fr: (count, noun) => `${count} ${noun}`,
      en: (count, noun) => `${count} ${noun}`,
      sample: ['2,597', 'victims'],
    },
    /**
     * Count, then rate, joined by « soit ». The rate alone is the thing no
     * reader can parse — 6.22 of what, out of what — and naming the numerator
     * once makes the denominator that follows do its job.
     */
    line: {
      fr: (count, rate, unit) => `${count}, soit ${rate} pour ${unit}`,
      en: (count, rate, unit) => `${count}, i.e. ${rate} per ${unit}`,
      sample: ['2,597 victims', '6.22', '1,000 residents'],
    },
    /** The same for the computed total, which has no noun of its own. */
    totalLine: {
      fr: (count, contributors, rate) => `${count} cumulés (${contributors} indicateurs), `
        + `soit ${rate} pour 1 000 hab.`,
      en: (count, contributors, rate) => `${count} combined (${contributors} indicators), `
        + `i.e. ${rate} per 1,000 res.`,
      note: 'Abbreviated, like the French, to fit the compact card’s 60-character budget.',
      sample: ['3,214', '14', '48.7'],
    },
  },

  /** The quantile ramp's own labels, which carry the denominator. */
  bins: {
    range: {
      fr: (low, high) => `${low}–${high}`,
      en: (low, high) => `${low}–${high}`,
      sample: ['0.000', '1.240'],
    },
    above: { fr: (value) => `> ${value}`, en: (value) => `> ${value}`, sample: ['8.410'] },
    withUnit: {
      fr: (range, unit) => `${range} / ${unit}`,
      en: (range, unit) => `${range} / ${unit}`,
      sample: ['1.240–2.880', '1,000 residents'],
    },
  },

  /** The `méthodo` register: the publisher's own sentences, at full length. */
  methodo: {
    totalAuthorship: {
      fr: (communeCount, departementCount) => '⚠ Total CALCULÉ par Surplomb, pas publié par le '
        + `SSMSI : somme des ${communeCount} indicateurs communaux `
        + `(${departementCount} au niveau départemental).`,
      en: (communeCount, departementCount) => '⚠ Total COMPUTED by Surplomb, not published by '
        + `the SSMSI: the sum of ${communeCount} municipal indicators `
        + `(${departementCount} at department level).`,
      sample: [14, 16],
    },
    totalUnits: {
      fr: 'Unités mélangées (victimes, infractions, véhicules, mis en cause), taux '
        + 'recalculé sur la population — cambriolages compris, que le SSMSI publie, eux, pour '
        + '1 000 logements.',
      en: 'Mixed units (victims, offenses, vehicles, named suspects), rate recomputed on the '
        + 'population — burglaries included, which the SSMSI itself publishes per 1,000 '
        + 'dwellings.',
    },
    totalAfd: {
      fr: '« Usage de stupéfiants (AFD) » n’est pas recompté : il est déjà dans « Usage de '
        + 'stupéfiants » (vérifié, 101 départements sur 101).',
      en: '“Drug use (AFD)” is not counted twice: it is already inside “Drug use” (verified, '
        + '101 departments of 101).',
    },
    misEnCause: {
      fr: '⚠ Délinquance ENREGISTRÉE, comptée en mis en cause : ce sont des personnes '
        + 'interpellées. Cet indicateur mesure aussi l’activité des services.',
      en: '⚠ RECORDED crime, counted in named suspects: these are people the police stopped. '
        + 'This indicator also measures how active the forces were.',
    },
    enregistree: {
      fr: '⚠ Délinquance ENREGISTRÉE : ce que la police et la gendarmerie ont consigné, '
        + 'pas ce qui s’est produit.',
      en: '⚠ RECORDED crime: what police and gendarmerie wrote down, not what happened.',
    },
    plainte: {
      fr: (rule) => `SSMSI : ${rule}`,
      en: (rule) => `SSMSI: ${rule}`,
      sample: ['“The propensity to file a complaint…”'],
    },
    suppressionRule: {
      fr: (rule) => `Règle de diffusion, mot pour mot — ${rule}`,
      en: (rule) => `Release rule, quoted in full — ${rule}`,
      sample: ['“Published data is limited to municipalities…”'],
    },
    suppressionYears: {
      fr: 'Le critère porte sur TROIS ANNÉES, pas sur la valeur de l’année affichée : '
        + '4 735 cellules non diffusées en 2025 avaient publié plus de 5 faits en 2023 ou 2024. '
        + '« Non diffusé » ne veut donc pas dire « peu ».',
      en: 'The criterion is about THREE YEARS, not about the value of the year on display: '
        + '4,735 cells withheld in 2025 had published more than 5 facts in 2023 or 2024. '
        + '“Not released” therefore does not mean “few”.',
    },
  },

  /** How many inhabitants, and how many dwellings when the rate needs them. */
  population: {
    residents: {
      fr: (pop) => `${pop} habitants`,
      en: (pop) => `${pop} residents`,
      sample: ['413,200'],
    },
    residentsAndDwellings: {
      fr: (pop, log) => `${pop} habitants · ${log} logements`,
      en: (pop, log) => `${pop} residents · ${log} dwellings`,
      sample: ['413,200', '266,451'],
    },
  },

  /** The commune census: how much of the finer map underneath is withheld. */
  census: {
    methodo: {
      fr: (suppressed, total, share, published) => `${suppressed} des ${total} communes non `
        + `diffusées (${share} %) · ${published} avec une valeur publiée`,
      en: (suppressed, total, share, published) => `${suppressed} of ${total} municipalities `
        + `withheld (${share}%) · ${published} with a published value`,
      sample: ['412', '557', '74', '145'],
    },
    compact: {
      fr: (total, suppressed, suppressedCount, share, published, publishedCount) => `${total} `
        + `communes : ${suppressed} non ${plural(suppressedCount, 'diffusée', 'diffusées')} `
        + `(${share} %), ${published} ${plural(publishedCount, 'publiée', 'publiées')}`,
      en: (total, suppressed, suppressedCount, share, published, publishedCount) => `${total} `
        + `municipalities: ${suppressed} ${plural(suppressedCount, 'withheld', 'withheld')} `
        + `(${share}%), ${published} ${plural(publishedCount, 'published', 'published')}`,
      note: 'The French agrees the two participles with their counts; English does not inflect, '
        + 'and says so by passing the same word twice rather than by dropping the agreement.',
      sample: ['557', '412', 412, '74', '145', 145],
    },
  },

  /** The card of one département. */
  departement: {
    header: {
      fr: (indicator, year) => `${indicator} — ${year}`,
      en: (indicator, year) => `${indicator} — ${year}`,
      sample: ['Home burglary', '2025'],
    },
    totalMethodo: {
      fr: (rate, count, contributors) => `${rate} pour 1 000 habitants · ${count} faits, `
        + `victimes et mis en cause cumulés sur ${contributors} indicateurs`,
      en: (rate, count, contributors) => `${rate} per 1,000 residents · ${count} facts, victims `
        + `and named suspects combined over ${contributors} indicators`,
      sample: ['48.7', '3,214', '16'],
    },
    totalExactMethodo: {
      fr: 'Total exact à cette échelle : la base départementale ne connaît pas le secret '
        + 'statistique. C’est en zoomant sur les communes qu’il apparaît.',
      en: 'An exact total at this scale: the department base knows no statistical '
        + 'confidentiality. It appears when you zoom in on the municipalities.',
    },
    totalExact: {
      fr: 'Total exact ici : pas de secret statistique au département',
      en: 'Exact total here: no statistical confidentiality at department level',
    },
    noRow: {
      fr: 'Aucune ligne pour ce département dans cette édition',
      en: 'No row for this department in this edition',
    },
  },

  /** The card of one commune. */
  commune: {
    untitled: { fr: 'Commune', en: 'Municipality' },
    totalMethodo: {
      fr: (rate, count) => `${rate} pour 1 000 habitants · ${count} faits, victimes et mis en `
        + 'cause cumulés',
      en: (rate, count) => `${rate} per 1,000 residents · ${count} facts, victims and named `
        + 'suspects combined',
      sample: ['48.7', '3,214'],
    },
    lowerBoundMethodo: {
      fr: (withheld, contributors) => `⚠ MINORANT : ${withheld} des ${contributors} indicateurs `
        + 'sont non diffusés ici, et ne sont donc PAS dans ce total. Le vrai total est plus '
        + 'élevé, d’un montant inconnu.',
      en: (withheld, contributors) => `⚠ LOWER BOUND: ${withheld} of the ${contributors} `
        + 'indicators are withheld here, so they are NOT in this total. The real total is '
        + 'higher, by an unknown amount.',
      sample: ['6', '14'],
    },
    lowerBound: {
      fr: (withheld, contributors) => `⚠ MINORANT : ${withheld} des ${contributors} indicateurs `
        + 'non diffusés ici',
      en: (withheld, contributors) => `⚠ LOWER BOUND: ${withheld} of ${contributors} indicators `
        + 'withheld here',
      sample: ['6', '14'],
    },
    completeMethodo: {
      fr: (contributors) => `Total complet : les ${contributors} indicateurs sont tous diffusés `
        + 'ici — le cas de 178 communes sur 34 920 dans l’édition 2025.',
      en: (contributors) => `A complete total: all ${contributors} indicators are released here `
        + '— true of 178 municipalities out of 34,920 in the 2025 edition.',
      sample: ['14'],
    },
    complete: {
      fr: (contributors) => `Total complet : les ${contributors} indicateurs sont diffusés ici`,
      en: (contributors) => `Complete total: the ${contributors} indicators are released here`,
      sample: ['14'],
    },
    totalZeroMethodo: {
      fr: (zeroLabel, contributors, zeroRule) => `${zeroLabel} pour les ${contributors} `
        + `indicateurs, et aucun n’est non diffusé — ${zeroRule}`,
      en: (zeroLabel, contributors, zeroRule) => `${zeroLabel} on all ${contributors} indicators, `
        + `and not one is withheld — ${zeroRule}`,
      sample: ['No fact recorded', '14', '“The published database also provides…”'],
    },
    totalZero: {
      fr: (zeroLabel, contributors) => `${zeroLabel} sur les ${contributors} indicateurs, aucun `
        + 'retenu',
      en: (zeroLabel, contributors) => `${zeroLabel} on the ${contributors} indicators, none `
        + 'withheld',
      sample: ['No fact recorded', '14'],
    },
    totalSuppressedMethodo: {
      fr: 'Aucun fait publié, et le registre en retient : rien à totaliser ici',
      en: 'Nothing published, and the register is withholding: there is nothing to total here',
    },
    totalSuppressed: {
      fr: 'Rien à totaliser : le registre en retient ici',
      en: 'Nothing to total: the register is withholding here',
    },
    totalUnknownMethodo: {
      fr: (withheld, contributors) => `${withheld} des ${contributors} indicateurs non diffusés `
        + '— le total n’est ni zéro ni petit, il est inconnu.',
      en: (withheld, contributors) => `${withheld} of the ${contributors} indicators are `
        + 'withheld — the total is neither zero nor small, it is unknown.',
      sample: ['9', '14'],
    },
    totalUnknown: {
      fr: (withheld, contributors) => `${withheld} des ${contributors} indicateurs non diffusés `
        + '— total inconnu',
      en: (withheld, contributors) => `${withheld} of ${contributors} indicators withheld — `
        + 'total unknown',
      sample: ['9', '14'],
    },
    /** A published zero is a CLAIM, and the claim rests on the three years. */
    zeroMethodo: {
      fr: (zeroLabel, zeroRule) => `${zeroLabel} (0 fait, publié comme tel) — ${zeroRule}`,
      en: (zeroLabel, zeroRule) => `${zeroLabel} (0 facts, published as such) — ${zeroRule}`,
      sample: ['No fact recorded', '“The published database also provides…”'],
    },
    zero: {
      fr: (zeroLabel) => `${zeroLabel} (0 fait, publié comme tel), 3 ans`,
      en: (zeroLabel) => `${zeroLabel} (0 facts, published as such), 3 years`,
      sample: ['No fact recorded'],
    },
    /**
     * `complement_info_taux` is a DEPARTMENTAL average over every withheld
     * municipality, not this one's value, and the label has to make that
     * impossible to misread in either register.
     */
    meanMethodo: {
      fr: (rate, complementRule, variants) => `Repère : ${rate} — ${complementRule}, pas la `
        + `valeur de cette commune${variants}`,
      en: (rate, complementRule, variants) => `Benchmark: ${rate} — ${complementRule}, not this `
        + `municipality’s value${variants}`,
      sample: ['0.105 per 1,000 residents', '“Mean value per 1,000…”', ''],
    },
    meanVariants: {
      fr: ' (deux moyennes coexistent ici : communes et arrondissements)',
      en: ' (two averages coexist here: municipalities and arrondissements)',
    },
    mean: {
      fr: (rate) => `Repère : ${rate} pour 1 000 — moyenne dép., pas cette commune`,
      en: (rate) => `Benchmark: ${rate} per 1,000 — dept. average, not this municipality`,
      sample: ['0.105'],
    },
    meanVariantsWarning: {
      fr: '⚠ Deux moyennes coexistent : communes et arrondissements',
      en: '⚠ Two averages coexist: municipalities and arrondissements',
    },
    /** The rate, as the benchmark line spells it out in `méthodo`. */
    meanRate: {
      fr: (rate, unit) => `${rate} pour ${unit}`,
      en: (rate, unit) => `${rate} per ${unit}`,
      sample: ['0.105', '1,000 residents'],
    },
    noRow: {
      fr: 'Aucune ligne pour cette commune dans cette édition',
      en: 'No row for this municipality in this edition',
    },
    noPopulationMethodo: {
      fr: '⚠ Population municipale nulle — aucun taux pour 1 000 habitants n’est calculable ici',
      en: '⚠ Municipal population of zero — no rate per 1,000 residents can be computed here',
      note: 'The six villages détruits of Verdun, administratively alive and uninhabited since 1916.',
    },
    noPopulation: {
      fr: '⚠ Population municipale nulle — aucun taux calculable',
      en: '⚠ Municipal population of zero — no rate can be computed',
    },
    simplifiedMethodo: {
      fr: 'Contour simplifié pour l’affichage — ce n’est pas une limite administrative',
      en: 'Outline simplified for drawing — this is not an administrative boundary',
    },
    simplified: {
      fr: 'Contour simplifié — pas une limite administrative',
      en: 'Outline simplified — not an administrative boundary',
    },
  },

  /** Every OTHER indicator for this commune, so the reader is never stuck. */
  others: {
    value: {
      fr: (name, count) => `${name} ${count}`,
      en: (name, count) => `${name} ${count}`,
      sample: ['Burglary', '843'],
    },
    withheld: {
      fr: (name) => `${name} ✕`,
      en: (name) => `${name} ✕`,
      sample: ['Armed theft'],
    },
    excluded: {
      fr: (name) => `${name} (hors total)`,
      en: (name) => `${name} (outside the total)`,
      note: 'A contributor the computed total drops, so a hand sum reconciles.',
      sample: ['Drug use (AFD)'],
    },
    more: {
      fr: (hidden, hiddenCount) => ` · +${hidden} ${plural(hiddenCount, 'publié', 'publiés')}`,
      en: (hidden, hiddenCount) => ` · +${hidden} ${plural(hiddenCount, 'published', 'published')}`,
      note: 'The chips a 60-character line could not fit. French agrees, English does not.',
      sample: ['3', 3],
    },
    suppressedCount: {
      fr: (count, rawCount) => `${count} ${plural(rawCount, 'indicateur', 'indicateurs')} `
        + `non ${plural(rawCount, 'diffusé', 'diffusés')} ici`,
      en: (count, rawCount) => `${count} ${plural(rawCount, 'indicator', 'indicators')} `
        + 'withheld here',
      sample: ['6', 6],
    },
  },

  /** The ambient label of one département: its name and its rate. */
  departementLabel: {
    fr: (name, value) => `${name} · ${value}`,
    en: (name, value) => `${name} · ${value}`,
    sample: ['Gironde', '6.22'],
  },

  /** The row's chips. The last one is not an indicator. */
  chips: {
    totalTitle: {
      fr: (contributors) => `${contributors} indicateurs cumulés — total calculé par Surplomb, `
        + 'pas publié par le SSMSI ; unités mélangées ; minorant dès qu’une cellule est non '
        + 'diffusée',
      en: (contributors) => `${contributors} indicators combined — a total computed by Surplomb, `
        + 'not published by the SSMSI; mixed units; a lower bound as soon as one cell is '
        + 'withheld',
      sample: ['14'],
    },
    indicatorTitle: {
      fr: (label, unit) => `${label} — unité de compte : ${unit}`,
      en: (label, unit) => `${label} — unit of count: ${unit}`,
      sample: ['Home burglary', 'offenses'],
    },
    methodoLabel: {
      fr: 'Méthodo',
      en: 'Method',
      note: 'The chip that swaps the compact card for the publisher’s own sentences.',
    },
    methodoOn: {
      fr: 'Cartes compactes — masquer les règles du SSMSI citées mot pour mot',
      en: 'Compact cards — hide the SSMSI rules quoted in full',
    },
    methodoOff: {
      fr: 'Citer sur les cartes les règles du SSMSI, mot pour mot',
      en: 'Quote the SSMSI rules in full on the cards',
    },
  },

  /** The legend. */
  legend: {
    totalPublished: {
      fr: 'Total publié — minorant (1 000 habitants)',
      en: 'Published total — a lower bound (1,000 residents)',
    },
    published: {
      fr: (unit) => `Publié (${unit})`,
      en: (unit) => `Published (${unit})`,
      sample: ['1,000 dwellings'],
    },
    nationalSuppressed: {
      fr: (label) => `${label} (national)`,
      en: (label) => `${label} (national)`,
      note: 'The national count travels with the key at every zoom.',
      sample: ['Not released — statistical confidentiality'],
    },
  },

  /** Loading copy, named for what is being waited on. */
  loading: {
    base: {
      fr: 'Chargement de la base départementale SSMSI…',
      en: 'Loading the SSMSI department base…',
    },
    communes: {
      fr: 'Chargement des contours communaux…',
      en: 'Loading the municipal outlines…',
    },
    departements: {
      fr: 'Mise à jour du fond départemental…',
      en: 'Updating the department layer…',
    },
  },

  /** What a failed load says on the layer's row. */
  errors: {
    base: { fr: 'base départementale indisponible', en: 'department base unavailable' },
    departementShapes: {
      fr: 'contours départementaux indisponibles',
      en: 'department outlines unavailable',
    },
    communeContours: {
      fr: 'contours communaux indisponibles',
      en: 'municipal outlines unavailable',
    },
    pack: { fr: 'indisponible', en: 'unavailable' },
  },
});
