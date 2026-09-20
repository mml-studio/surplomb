/**
 * Strings of `src/data/petiteEnfanceFrance.js` — the Accueil du jeune enfant
 * layer.
 *
 * WHAT THE INDICATOR IS, AND WHAT THE ENGLISH MAY NOT TURN IT INTO. The number
 * is a *taux de couverture*: formal childcare PLACES per 100 resident children
 * under three. It is not a percentage — an area with more places than children
 * legitimately passes 100, and four EPCI do — and it is not a count of
 * daycare centers, because nothing in French open data is one. Both of those
 * misreadings are one careless word away in English, so every line here says
 * "places per 100 children under three" in full rather than "%" or "coverage".
 *
 * The colour is a comparison with France, never a quantile of the screen: the
 * layer paints three nested scales, and a band that meant "the top sixth of
 * what is visible" would change an area's colour as you zoomed. The band names
 * live in `petiteEnfanceFeed.i18n.js` with the scales and the five modes,
 * because the feed is what keys them.
 *
 * Every number arrives formatted (`formatNumber`, `formatDecimal`).
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The Cesium data source that holds the 96 département polygons. */
  departementSourceName: {
    fr: 'Accueil du jeune enfant — taux de couverture par département',
    en: 'Early childcare — coverage rate by department',
    note: 'An internal name for the loaded GeoJSON, not a caption a reader sees.',
  },

  /** What a band with no published rate is called, on a legend or a card. */
  noRate: { fr: 'Taux non publié', en: 'Rate not published' },

  /**
   * One line behind each band swatch, keyed by `PE_BANDS`.
   *
   * They state the band's own arithmetic — a ratio to the national rate — and
   * two of them add the finding that makes the ramp worth reading: the bottom
   * class is entirely overseas, and the top one is almost always carried by
   * childminders rather than by daycare.
   */
  bandBlurbs: {
    'tres-bas': {
      fr: 'Moins de 60 % de la moyenne nationale. Aucun département métropolitain n’y figure '
        + '— ils sont tous outre-mer.',
      en: 'Less than 60% of the national average. No mainland department is in this class — '
        + 'every one of them is overseas.',
    },
    bas: {
      fr: 'Entre 60 et 85 % de la moyenne. Trouver une place y demande une recherche, pas un choix.',
      en: 'Between 60 and 85% of the average. Finding a place here takes a search, not a choice.',
    },
    'sous-moyenne': {
      fr: 'Entre 85 et 100 % de la moyenne nationale.',
      en: 'Between 85 and 100% of the national average.',
    },
    'sur-moyenne': {
      fr: 'Entre 100 et 115 % de la moyenne nationale.',
      en: 'Between 100 and 115% of the national average.',
    },
    haut: {
      fr: 'Entre 115 et 140 % de la moyenne. L’offre y dépasse nettement le pays.',
      en: 'Between 115 and 140% of the average. Provision here is well ahead of the country.',
    },
    'tres-haut': {
      fr: 'Plus de 140 % de la moyenne. Presque toujours porté par l’assistante maternelle, '
        + 'pas par la crèche.',
      en: 'More than 140% of the average. Almost always carried by childminders, not by daycare.',
    },
  },

  /** The card of one selected territory. */
  card: {
    untitled: {
      fr: 'Zone',
      en: 'Area',
      note: 'When the CNAF published neither a name nor a code for the row.',
    },
    /** The scale comes first: three nested scales sit under one cursor. */
    scaleAndYear: {
      fr: (scale, year) => `${scale} · millésime ${year}`,
      en: (scale, year) => `${scale} · ${year} vintage`,
      note: '`scale` is Department / Intercommunality (EPCI) / Municipality.',
      sample: ['Intercommunality (EPCI)', '2023'],
    },
    noRateHere: {
      fr: 'Taux non publié pour cette zone',
      en: 'Rate not published for this area',
    },
    rate: {
      fr: (rate) => `${rate} places pour 100 enfants de moins de 3 ans`,
      en: (rate) => `${rate} places per 100 children under three`,
      note: 'Places, not a percentage: an area can legitimately pass 100.',
      sample: ['62.9'],
    },
    atNationalAverage: {
      fr: 'au niveau de la moyenne nationale',
      en: 'level with the national average',
    },
    aboveAverage: {
      fr: (pct, national) => `${pct} % au-dessus de la moyenne nationale (${national})`,
      en: (pct, national) => `${pct}% above the national average (${national})`,
      sample: ['14', '60.9'],
    },
    belowAverage: {
      fr: (pct, national) => `${pct} % en dessous de la moyenne nationale (${national})`,
      en: (pct, national) => `${pct}% below the national average (${national})`,
      sample: ['23', '60.9'],
    },
    totalPlaces: {
      fr: (places) => `${places} places d’accueil formel au total`,
      en: (places) => `${places} formal childcare places in total`,
      sample: ['1,842'],
    },
    /** The département card says the same thing without "au total". */
    placesHere: {
      fr: (places) => `${places} places d’accueil formel`,
      en: (places) => `${places} formal childcare places`,
      sample: ['18,420'],
    },
    /** One of the five modes, its rate and, where published, its places. */
    mode: {
      fr: (label, rate, places) => `${label} : ${rate}${places}`,
      en: (label, rate, places) => `${label}: ${rate}${places}`,
      note: '`places` is the clause below, or an empty string.',
      sample: ['Childminder', '31.9', ' · 9,204 places'],
    },
    modePlaces: {
      fr: (places) => ` · ${places} places`,
      en: (places) => ` · ${places} places`,
      sample: ['9,204'],
    },
    dominant: {
      fr: (mode) => `Mode dominant : ${mode}`,
      en: (mode) => `Main provider: ${mode}`,
      note: 'The single most legible fact after the rate — the Jura is childminders, Paris is not.',
      sample: ['childminder'],
    },
    /** The commune scale exists only above 10 000 inhabitants. */
    communeScaleGap: {
      fr: '⚠ Échelle communale publiée seulement pour les communes de plus de 10 000 habitants',
      en: '⚠ The municipal scale is published only for municipalities over 10,000 residents',
      note: '1 061 of France’s ~34 875 communes. It can never tile anything.',
    },
    /** An EPCI has no outline of its own on geo.api.gouv.fr. */
    epciDrawing: {
      fr: 'Territoire dessiné : les communes membres, sous une seule couleur — '
        + 'geo.api.gouv.fr ne publie pas de contour d’EPCI',
      en: 'Territory drawn as its member municipalities, under one color — '
        + 'geo.api.gouv.fr publishes no EPCI outline',
    },
    simplified: {
      fr: 'Contour communal simplifié',
      en: 'Municipal outline simplified',
      note: 'The rings are decimated for drawing; the shape is not a legal boundary.',
    },
    code: {
      fr: (code) => `Code ${code}`,
      en: (code) => `Code ${code}`,
      note: 'The INSEE code of the area, which is also the join key.',
      sample: ['200070563'],
    },
  },

  /** The ambient label of one département: its name and its rate. */
  departementLabel: {
    fr: (name, rate) => `${name} · ${rate}`,
    en: (name, rate) => `${name} · ${rate}`,
    sample: ['Jura', '69.7'],
  },

  /** The legend: one row per band, labelled in places rather than in ratios. */
  legend: {
    band: {
      fr: (range) => `${range} places / 100 enfants`,
      en: (range) => `${range} places / 100 children`,
      note: '`range` is a bound or a pair, in places when the national rate is known.',
      sample: ['52–61'],
    },
    /** Below the first threshold, and above the last. */
    below: { fr: (value) => `< ${value}`, en: (value) => `< ${value}`, sample: ['37'] },
    above: { fr: (value) => `> ${value}`, en: (value) => `> ${value}`, sample: ['85'] },
    between: {
      fr: (low, high) => `${low}–${high}`,
      en: (low, high) => `${low}–${high}`,
      sample: ['52', '61'],
    },
    /** With no national rate yet, the bounds are stated as ratios instead. */
    ratio: {
      fr: (percent) => `${percent} %`,
      en: (percent) => `${percent}%`,
      sample: ['85'],
    },
  },

  /** What a failed load says on the layer's row. */
  errors: {
    /**
     * The `fr` is the string this layer has always printed — half English, as
     * two of its sibling failure strings still are. Rewriting it in French
     * would change what a French reader sees, which this wave does not do.
     */
    departementShapes: {
      fr: 'département polygons unavailable',
      en: 'department outlines unavailable',
    },
    communeContours: {
      fr: 'contours communaux indisponibles',
      en: 'municipal outlines unavailable',
    },
    communeContoursWhy: {
      fr: (detail) => `contours communaux indisponibles (${detail})`,
      en: (detail) => `municipal outlines unavailable (${detail})`,
      note: '`detail` is the upstream error, which stays as the network reported it.',
      sample: ['HTTP 503'],
    },
    /** Ground with no shape looks exactly like ground with no rate. */
    someContours: {
      fr: (departements) => `contours indisponibles : ${departements}`,
      en: (departements) => `outlines unavailable: ${departements}`,
      note: '`departements` is a joined list of department codes.',
      sample: ['62, 80'],
    },
    /** What the contour fetch itself reports when the network says nothing. */
    unavailable: { fr: 'indisponible', en: 'unavailable' },
  },

  /** The one line under the layer's toggle. */
  status: {
    loadingNational: {
      fr: 'lecture du registre national...',
      en: 'reading the national register...',
    },
    loadingContours: {
      fr: 'lecture des contours communaux...',
      en: 'reading the municipal outlines...',
    },
    empty: { fr: 'aucune zone dans cette vue', en: 'no area in this view' },
    national: {
      fr: (painted, rate) => `${painted} départements · moyenne nationale ${rate} places / `
        + '100 enfants',
      en: (painted, rate) => `${painted} departments · national average ${rate} places / `
        + '100 children',
      sample: ['96', '60.9'],
    },
    /** The choropleth's own blind spot, and here it is the finding. */
    overseas: {
      fr: (count) => `${count} territoires ultramarins non cartographiés, tous sous la moyenne`,
      en: (count) => `${count} overseas territories not mapped, every one below the average`,
      sample: ['5'],
    },
    epci: {
      fr: (count) => `${count} intercommunalités`,
      en: (count) => `${count} intercommunalities`,
      sample: ['42'],
    },
    communes: {
      fr: (count) => `${count} communes`,
      en: (count) => `${count} municipalities`,
      sample: ['18'],
    },
    /** Ground whose area publishes no rate: drawn, and not coloured. */
    unpainted: {
      fr: (count) => `${count} communes sans taux publié`,
      en: (count) => `${count} municipalities with no published rate`,
      sample: ['140'],
    },
    /** Outlines the pack cap left out, dropped from the edges of the view. */
    dropped: {
      fr: (count) => `${count} contours hors plafond`,
      en: (count) => `${count} outlines beyond the cap`,
      sample: ['212'],
    },
  },
});
