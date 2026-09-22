/**
 * Strings of `src/data/dpeFrance.js` — the energy rating (DPE) layer.
 *
 * TWO WORDS CARRY THE DOMAIN. A *diagnostic de performance énergétique* is a
 * RATING of one dwelling; a *passoire thermique* — a home rated F or G — is an
 * *energy-inefficient home*, which is the glossary's term and the one the law
 * attaches its consequences to. The acronym DPE stays where the French uses
 * it as a noun, because it is the register's name.
 *
 * WHAT THIS LAYER REFUSES TO SAY is as translated as what it says: it never
 * averages letters, and a shape seen from altitude is painted by its most
 * frequent class, named as such, never by a mean. Every one of those refusals
 * is a sentence here.
 */
import { countNoun, formatInteger } from '../i18n/format.js';
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/** A leaf that counts its own noun says which language it is in. */
const FR = Object.freeze({ locale: 'fr' });
const EN = Object.freeze({ locale: 'en' });

export default defineMessages({
  /**
   * The energy axis of the 2021 classes, in kWh/m²/an of primary energy
   * (arrêté du 31 mars 2021). The published class is the WORSE of two axes,
   * so these bounds explain a class without predicting it.
   */
  energy: {
    A: { fr: 'jusqu\'à 70 kWh/m²/an', en: 'up to 70 kWh/m²/yr' },
    B: { fr: '71 à 110 kWh/m²/an', en: '71 to 110 kWh/m²/yr' },
    C: { fr: '111 à 180 kWh/m²/an', en: '111 to 180 kWh/m²/yr' },
    D: { fr: '181 à 250 kWh/m²/an', en: '181 to 250 kWh/m²/yr' },
    E: { fr: '251 à 330 kWh/m²/an', en: '251 to 330 kWh/m²/yr' },
    F: { fr: '331 à 420 kWh/m²/an', en: '331 to 420 kWh/m²/yr' },
    G: { fr: 'plus de 420 kWh/m²/an', en: 'over 420 kWh/m²/yr' },
  },

  /** What the theme says on the Bâti 3D row when it paints the volumes. */
  theme: {
    label: { fr: 'Performance énergétique (DPE)', en: 'Energy rating (DPE)' },
    unknown: {
      fr: 'sans DPE dans le rayon scanné',
      en: 'no energy rating inside the scanned radius',
      note: 'Two causes in one phrase: no rating, or a building the scan never reached.',
    },
  },

  /** How many ratings stand behind a mark. */
  ratings: {
    fr: (count) => countNoun(count, 'DPE', 'DPE', FR),
    en: (count) => countNoun(count, 'rating', 'ratings', EN),
    sample: [14],
  },

  /** One site: an address, a building, and the letters it holds. */
  site: {
    noAddress: { fr: 'Adresse non publiée', en: 'Address not published' },
    title: {
      fr: (where, ratings) => `${where} — ${ratings}`,
      en: (where, ratings) => `${where} — ${ratings}`,
      sample: ['12 Tolbiac street', '14 ratings'],
    },
    spreadNone: { fr: 'aucune étiquette publiée', en: 'no label published' },
    spreadMixed: {
      fr: (best, worst, grade) => `de ${best} à ${worst}, majorité ${grade}`,
      en: (best, worst, grade) => `from ${best} to ${worst}, mostly ${grade}`,
      sample: ['C', 'G', 'E'],
    },
    spreadAll: {
      fr: (grade) => `tous ${grade}`,
      en: (grade) => `all ${grade}`,
      sample: ['C'],
    },
    ungraded: {
      fr: (count) => `${count} sans étiquette publiée`,
      en: (count) => `${count} with no published label`,
      sample: [2],
    },
    poor: {
      fr: (count) => `${countNoun(count, 'passoire', 'passoires', FR)} (F ou G)`,
      en: (count) => `${countNoun(count, 'energy-inefficient home', 'energy-inefficient homes', EN)} (F or G)`,
      note: 'The one cut of this register with a legal consequence attached to it.',
      sample: [3],
    },
    cost: {
      fr: (amount) => `${amount} €/an estimés (médiane du site)`,
      en: (amount) => `€${amount}/yr estimated (median for the site)`,
      note: 'All uses, as each rating estimates them; a median, never a mean.',
      sample: ['1,240'],
    },
    footprint: {
      fr: (area) => `emprise ${area} m² au sol`,
      en: (area) => `footprint ${area} m² on the ground`,
      sample: ['412'],
    },
    parcel: {
      fr: (idu) => `parcelle ${idu}`,
      en: (idu) => `parcel ${idu}`,
      sample: ['75113000AB0042'],
    },
    parcelArea: {
      fr: (area) => ` — ${area} m² cadastrés`,
      en: (area) => ` — ${area} m² on the cadastre`,
      sample: ['688'],
    },
    volumePainted: {
      fr: (grade) => `volume Bâti 3D peint ${grade}`,
      en: (grade) => `3D buildings volume painted ${grade}`,
      note: 'Only when the volume under the badge DISAGREES with it.',
      sample: ['D'],
    },
    volumeOutside: {
      fr: 'hors des emprises BD TOPO chargées',
      en: 'outside the BD TOPO footprints loaded',
    },
    distance: {
      fr: (metres) => `${metres} m du centre du scan`,
      en: (metres) => `${metres} m from the scan center`,
      sample: [120],
    },
  },

  /** The seven letters, always all seven (C1: the ladder is the state's). */
  legend: {
    letterBlurb: {
      fr: (energy) => `${energy} — la classe publiée est la pire des deux axes, `
        + 'énergie et gaz à effet de serre. Le volume porte l\'étiquette tenue par le plus '
        + 'de diagnostics du bâtiment, jamais leur moyenne.',
      en: (energy) => `${energy} — the published class is the worse of the two axes, `
        + 'energy and greenhouse gas. The volume carries the label held by the most of the '
        + 'building’s ratings, never their average.',
      sample: ['181 to 250 kWh/m²/yr'],
    },
    letterBlurbShort: {
      fr: (energy) => `${energy} — la classe publiée est la pire des deux axes, `
        + 'énergie et gaz à effet de serre.',
      en: (energy) => `${energy} — the published class is the worse of the two axes, `
        + 'energy and greenhouse gas.',
      note: 'The badge ramp on the layer’s own row, where the volumes are not the subject.',
      sample: ['181 to 250 kWh/m²/yr'],
    },
    mixed: {
      fr: (buildings, letter) => ` ${countNoun(buildings, 'immeuble', 'immeubles', FR)} `
        + `peint${buildings > 1 ? 's' : ''} ${letter} `
        + `${buildings > 1 ? 'ne sont pas unanimes' : 'n\'est pas unanime'} : les diagnostics `
        + 'qui en diffèrent gardent leur badge à taille pleine sur le toit.',
      en: (buildings, letter) => ` ${countNoun(buildings, 'building', 'buildings', EN)} `
        + `painted ${letter} ${buildings > 1 ? 'are' : 'is'} not unanimous: the ratings that `
        + 'differ keep their full-size badge on the roof.',
      note: 'Appended to a letter’s blurb when the volumes it painted are not unanimous.',
      sample: [2, 'E'],
    },
    ungraded: {
      label: {
        fr: 'sans étiquette',
        en: 'no label',
        note: 'Short: it shares a two-column key with the seven letters.',
      },
      blurb: {
        fr: 'Diagnostic présent dans le registre sans étiquette exploitable. Il ne peut '
          + 'peindre aucun volume et n\'est jamais rapproché de la lettre la plus proche.',
        en: 'A rating present in the register with no usable label. It can paint no volume '
          + 'and is never rounded to the nearest letter.',
      },
    },
  },

  /**
   * The map key's block in the building regime: the seven classes as a filter,
   * the diagnostics loaded per class, and one line on what the scan reached.
   * The energy bounds and the "worse of two axes" rule are said once, here,
   * rather than under each of the seven letters.
   */
  key: {
    source: {
      fr: 'Classes publiées par l’ADEME : la pire des deux notes, énergie et gaz à effet de serre',
      en: 'Classes published by the ADEME: the worse of the two grades, energy and greenhouse gas',
    },
    filterLabel: { fr: 'Filtrer par classe', en: 'Filter by class' },
    showOnly: {
      fr: (letter, energy) => `N’afficher que ${letter} (${energy})`,
      en: (letter, energy) => `Show only ${letter} (${energy})`,
      sample: ['D', '181 to 250 kWh/m²/yr'],
    },
    hide: {
      fr: (letter) => `Masquer ${letter}`,
      en: (letter) => `Hide ${letter}`,
      sample: ['D'],
    },
    showToo: {
      fr: (letter) => `Afficher aussi ${letter}`,
      en: (letter) => `Show ${letter} too`,
      sample: ['D'],
    },
    loaded: { fr: 'Diagnostics chargés', en: 'Ratings loaded' },
    scanTruncated: {
      fr: (served, total, radius) => `${served} / ${total} diagnostics · rayon ${radius} m`,
      en: (served, total, radius) => `${served} / ${total} ratings · ${radius} m radius`,
      note: 'The nearest `served` of `total` known within the radius.',
      sample: ['200', '1,257', 200],
    },
    scanWhole: {
      fr: (ratings, radius) => `${ratings} · rayon ${radius} m`,
      en: (ratings, radius) => `${ratings} · ${radius} m radius`,
      note: '`ratings` is already counted and named (`39 ratings`).',
      sample: ['39 ratings', 200],
    },
    sites: {
      fr: (count) => countNoun(count, 'adresse', 'adresses', FR),
      en: (count) => countNoun(count, 'address', 'addresses', EN),
      sample: [25],
    },
    filtered: {
      fr: (letters, shown) => `filtre ${letters} : ${countNoun(shown, 'adresse affichée', 'adresses affichées', FR)}`,
      en: (letters, shown) => `filter ${letters}: ${countNoun(shown, 'address shown', 'addresses shown', EN)}`,
      sample: ['D, E', 12],
    },
  },

  /**
   * The selected site, printed in the map key. It answers for an ADDRESS and
   * the diagnostics filed there — never for the building as a whole.
   */
  panel: {
    count: {
      fr: (count) => countNoun(count, 'diagnostic', 'diagnostics', FR),
      en: (count) => countNoun(count, 'rating', 'ratings', EN),
      sample: [16],
    },
    present: { fr: 'Classes présentes', en: 'Classes present' },
    range: {
      fr: (best, worst) => `De ${best} à ${worst}`,
      en: (best, worst) => `From ${best} to ${worst}`,
      sample: ['C', 'E'],
    },
    all: {
      fr: (letter) => `Tous ${letter}`,
      en: (letter) => `All ${letter}`,
      sample: ['D'],
    },
    one: {
      fr: (letter) => `Classe ${letter}`,
      en: (letter) => `Class ${letter}`,
      sample: ['D'],
    },
    mode: {
      fr: (letter) => `Classe la plus fréquente : ${letter}`,
      en: (letter) => `Most frequent class: ${letter}`,
      sample: ['D'],
    },
    modeTie: {
      fr: (letter, others) => `Classe la plus fréquente : ${letter}, à égalité avec ${others} `
        + '(la plus mauvaise est retenue)',
      en: (letter, others) => `Most frequent class: ${letter}, tied with ${others} `
        + '(the worse one is kept)',
      sample: ['E', 'C'],
    },
    perDwelling: {
      fr: 'Chaque DPE décrit un logement, pas l’immeuble entier',
      en: 'Each rating describes one dwelling, not the whole building',
    },
    filtered: {
      fr: (shown, total) => `Filtre actif : ${shown} sur ${total} affichés`,
      en: (shown, total) => `Filter on: ${shown} of ${total} shown`,
      sample: [3, 16],
    },
    listCaption: { fr: 'Diagnostics associés à cette adresse', en: 'Ratings filed at this address' },
    seeAll: {
      fr: (count) => (count > 1 ? `Voir les ${count} diagnostics` : 'Voir le diagnostic'),
      en: (count) => (count > 1 ? `See the ${count} ratings` : 'See the rating'),
      sample: [16],
    },
    surface: {
      fr: (area) => `${area} m²`,
      en: (area) => `${area} m²`,
      sample: ['39.7'],
    },
    openRating: {
      fr: (id) => `Ouvrir le DPE ${id} sur l’observatoire de l’ADEME`,
      en: (id) => `Open rating ${id} on the ADEME observatory`,
      sample: ['2569E2000837C'],
    },
    source: { fr: 'Source ADEME', en: 'Source: ADEME' },
  },

  /** The coverage line on the row: what was served, painted and outlined. */
  coverage: {
    truncated: {
      fr: (served, total, radius) => `${served} DPE servis sur ${total} `
        + `dans ${radius} m (les plus proches du centre)`,
      en: (served, total, radius) => `${served} ratings served out of ${total} `
        + `within ${radius} m (the nearest to the center)`,
      sample: ['200', '2,805', 300],
    },
    served: {
      fr: (ratings, radius) => `${ratings} dans ${radius} m`,
      en: (ratings, radius) => `${ratings} within ${radius} m`,
      note: '`ratings` is already counted and named (`200 ratings`).',
      sample: ['200 ratings', 300],
    },
    painted: {
      fr: (painted, loaded) => ` · ${countNoun(painted, 'volume', 'volumes', FR)} `
        + `peint${painted > 1 ? 's' : ''} sur ${loaded} chargés`,
      en: (painted, loaded) => ` · ${countNoun(painted, 'volume', 'volumes', EN)} painted `
        + `out of ${loaded} loaded`,
      sample: [42, '1,204'],
    },
    sites: {
      fr: (sites, outlined) => ` · ${countNoun(sites, 'adresse', 'adresses', FR)} `
        + `· ${outlined} avec emprise bâtie`,
      en: (sites, outlined) => ` · ${countNoun(sites, 'address', 'addresses', EN)} `
        + `· ${outlined} with a building footprint`,
      sample: [10, 8],
    },
  },

  /**
   * Above 600 m: the cadastre, painted on the A–G scale — every parcel that
   * holds a rating up to 1 800 m, every cadastral section above. Each shape
   * takes the most frequent class of its own ratings, the rule a building
   * follows below 600 m, and says so.
   */
  area: {
    box: { fr: 'la boîte', en: 'the box' },
    painted: {
      fr: (unit) => (unit === 'sections' ? 'Sections peintes' : 'Parcelles peintes'),
      en: (unit) => (unit === 'sections' ? 'Sections painted' : 'Parcels painted'),
      note: 'The channel the key\'s counts are in: shapes, not ratings.',
      sample: ['parcels'],
    },
    poorHere: {
      fr: (share, national) => `${share} % de passoires (F ou G) ici, ${national} % dans le `
        + 'registre national',
      en: (share, national) => `${share}% energy-inefficient homes (F or G) here, `
        + `${national}% in the national register`,
      sample: ['12.4', '9.75'],
    },
    registerNotStock: {
      fr: 'un DPE est obligatoire à la vente et à la location : le registre n’est pas le parc',
      en: 'a rating is compulsory on a sale or a new let: the register is not the housing stock',
      note: 'A2 — the denominator is the register, not the housing stock.',
    },
    tilesMissing: {
      fr: (missing, tiles) => `${missing} tuile(s) sur ${tiles} sans réponse : `
        + 'ce sol est vide faute de donnée, pas faute de diagnostic',
      en: (missing, tiles) => `${missing} ${plural(missing, 'tile', 'tiles', { locale: 'en' })} of ${tiles} did not answer: `
        + 'this ground is empty for want of data, not for want of a rating',
      sample: [1, 4],
    },
    visibleOnly: {
      fr: (tiles, inBox) => `seule la partie à l’écran est chargée : ${tiles} tuile(s) sur ${inBox}`,
      en: (tiles, inBox) => `only the part on screen is loaded: ${tiles} of ${inBox} tiles`,
      note: 'The tiles off screen are not asked for at all.',
      sample: [2, 4],
    },
    partial: {
      fr: 'une partie de la boîte n’a été lue qu’en partie : ses parcelles peuvent manquer de DPE',
      en: 'part of the box was only partly read: its parcels may be missing ratings',
    },
    communesMissing: {
      fr: (count) => `cadastre indisponible pour ${countNoun(count, 'commune', 'communes', FR)} : `
        + 'ses DPE ne sont pas dessinés',
      en: (count) => `cadastre unavailable for ${countNoun(count, 'municipality', 'municipalities', EN)}: `
        + 'its ratings are not drawn',
      sample: [1],
    },
    unplaced: {
      fr: (ratings) => `${ratings} sans parcelle sous leur point d’adresse, non dessinés`,
      en: (ratings) => `${ratings} with no parcel under their address point, not drawn`,
      note: '`ratings` is already counted and named (`157 ratings`).',
      sample: ['157 ratings'],
    },
    /** 600 m to 1 800 m: every parcel a rating in the box stands on. */
    parcels: {
      unit: {
        fr: 'sol teinté = la parcelle, peinte par la classe la plus fréquente de ses DPE '
          + '(à égalité, la plus mauvaise)',
        en: 'tinted ground = the parcel, painted by the most frequent class of its ratings '
          + '(a tie goes to the worse)',
      },
      drawn: {
        fr: (span, ratings, parcels) => `vue sur ${span} de côté : ${ratings} sur `
          + `${countNoun(parcels, 'parcelle', 'parcelles', FR)}`,
        en: (span, ratings, parcels) => `view over ${span} a side: ${ratings} on `
          + `${countNoun(parcels, 'parcel', 'parcels', EN)}`,
        note: '`ratings` is already counted and named.',
        sample: ['2.2 km', '22,567 ratings', 2469],
      },
      snapped: {
        fr: (ratings, metres) => `${ratings} posés sur la parcelle dont leur point d’adresse `
          + `touche la façade (à moins de ${metres} m)`,
        en: (ratings, metres) => `${ratings} placed on the parcel whose frontage their address `
          + `point touches (under ${metres} m)`,
        note: 'A BAN point stands on the front door, which is on the parcel line.',
        sample: ['11,204 ratings', 3],
      },
      descend: {
        fr: (metres) => `descendre sous ${metres} m pour retrouver chaque bâtiment et ses `
          + 'étiquettes',
        en: (metres) => `drop below ${metres} m to get each building and its labels back`,
        sample: [600],
      },
      fallbackTitle: {
        fr: (idu) => `Parcelle ${idu}`,
        en: (idu) => `Parcel ${idu}`,
        sample: ['69382000AV0052'],
      },
      moreAddresses: {
        fr: (count) => `et ${countNoun(count, 'autre adresse', 'autres adresses', FR)}`,
        en: (count) => `and ${countNoun(count, 'other address', 'other addresses', EN)}`,
        sample: [2],
      },
      snappedCard: {
        fr: (count) => `${count} posé(s) depuis la façade : point d’adresse hors de la parcelle, `
          + 'sur sa limite',
        en: (count) => `${count} placed from the frontage: address point just outside the `
          + 'parcel, on its boundary',
        sample: [12],
      },
    },
    /** Above 1 800 m: every cadastral section the register's grid falls in. */
    sections: {
      unit: {
        fr: 'section cadastrale peinte par la classe la plus fréquente de ses DPE '
          + '(à égalité, la plus mauvaise)',
        en: 'cadastral section painted by the most frequent class of its ratings '
          + '(a tie goes to the worse)',
      },
      drawn: {
        fr: (span, sections, ratings) => `vue sur ${span} de côté : `
          + `${countNoun(sections, 'section cadastrale', 'sections cadastrales', FR)}, ${ratings}`,
        en: (span, sections, ratings) => `view over ${span} a side: `
          + `${countNoun(sections, 'cadastral section', 'cadastral sections', EN)}, ${ratings}`,
        note: '`ratings` is already counted and named.',
        sample: ['8.9 km', 402, '227,114 ratings'],
      },
      grid: {
        fr: (metres) => `DPE comptés par carré de ${metres} m, chaque carré donné à la section `
          + 'sous son centre',
        en: (metres) => `ratings counted per ${metres} m square, each square given to the section `
          + 'under its centre',
        sample: [50],
      },
      descend: {
        fr: (metres) => `descendre sous ${formatInteger(metres, FR)} m pour voir chaque parcelle`,
        en: (metres) => `drop below ${formatInteger(metres, EN)} m to see each parcel`,
        sample: [1800],
      },
      title: {
        fr: (code, commune) => `Section ${code} · ${commune}`,
        en: (code, commune) => `Section ${code} · ${commune}`,
        note: '`code` is the cadastre\'s own section code (AB, 0C…).',
        sample: ['AP', 'Lyon 7e Arrondissement'],
        keep: ['Lyon 7e Arrondissement'],
      },
      neutral: {
        label: {
          fr: (min) => `moins de ${min} DPE sûrs`,
          en: (min) => `fewer than ${min} certain ratings`,
          sample: [3],
        },
        blurb: {
          fr: (min, metres) => `Une section n’est peinte que si au moins ${min} DPE tombent dans `
            + `des carrés de ${metres} m entièrement à l’intérieur : un carré à cheval sur deux `
            + 'sections ne dit pas de quel côté sont ses logements.',
          en: (min, metres) => `A section is painted only when at least ${min} ratings fall in `
            + `${metres} m squares lying wholly inside it: a square astride two sections does `
            + 'not say which side its dwellings are on.',
          sample: [3, 50],
        },
      },
      whole: {
        fr: (count) => `${countNoun(count, 'DPE', 'DPE', FR)} dans des carrés entièrement dans `
          + 'la section',
        en: (count) => `${countNoun(count, 'rating', 'ratings', EN)} in squares lying wholly `
          + 'inside the section',
        sample: [412],
      },
      neutralCard: {
        fr: (min) => `trop peu de DPE sûrs pour peindre la section (moins de ${min})`,
        en: (min) => `too few certain ratings to paint the section (fewer than ${min})`,
        sample: [3],
      },
    },
  },
});
