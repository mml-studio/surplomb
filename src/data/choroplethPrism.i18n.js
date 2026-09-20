/**
 * Strings of `src/data/choroplethPrism.js` — the shared key of every prism
 * layer: a HEIGHT that carries an absolute count and a COLOR that carries a
 * ratio.
 *
 * WHAT THE CALLER OWNS AND WHAT THIS FILE OWNS. The name of each variable
 * (`heightLabel`, `ratioLabel`), its unit and any per-class label come from
 * the layer that built the scale, in that layer's own words; this catalog is
 * the frame around them — what the mark means, what a frozen domain is, and
 * the three refusals a prism can carry.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Whether twice as tall means twice as much, or four times. */
  mode: {
    sqrt: {
      fr: 'Échelle en racine carrée : le domaine est trop étalé pour une règle linéaire, '
        + 'donc un prisme deux fois plus haut vaut quatre fois plus.',
      en: 'Square-root scale: the domain is too spread out for a linear rule, so a prism '
        + 'twice as tall is worth four times as much.',
    },
    linear: {
      fr: 'Échelle linéaire : deux fois plus haut vaut deux fois plus.',
      en: 'Linear scale: twice as tall is worth twice as much.',
    },
  },

  /** The height half of the key. */
  height: {
    title: {
      fr: (variable) => `Hauteur — ${variable}`,
      en: (variable) => `Height — ${variable}`,
      note: '`variable` is the calling layer’s own name for what it measures.',
      sample: ['charge points'],
    },
    blurb: {
      fr: (mode, tallest, domainMax, unit) => `${mode} Le plus haut prisme fait ${tallest} pour `
        + `${domainMax} ${unit}, borne gelée. La base est le département : `
        + 'son aire n\'est pas neutralisée, donc un grand département rural fait un gros volume '
        + 'à effectif égal — c\'est la couleur, et non le volume, qui répond à « rapporté à quoi ? ».',
      en: (mode, tallest, domainMax, unit) => `${mode} The tallest prism stands ${tallest} for `
        + `${domainMax} ${unit}, a frozen bound. The base is the department: its area is not `
        + 'factored out, so a large rural department makes a big volume for the same count — '
        + 'it is the color, not the volume, that answers “compared with what?”.',
      sample: ['Linear scale: twice as tall is worth twice as much.', '40 km', '12,000',
        'charge points'],
    },
    tick: {
      fr: (value, unit) => `${value} ${unit}`,
      en: (value, unit) => `${value} ${unit}`,
      sample: ['6,000', 'charge points'],
    },
    tickBlurb: {
      fr: (tall) => `${tall} de haut.`,
      en: (tall) => `${tall} tall.`,
      sample: ['20 km'],
    },
  },

  /** A5 — a frozen domain has a top, and a value above it stops being measured. */
  clipped: {
    label: { fr: 'au-dessus du domaine gelé', en: 'above the frozen domain' },
    blurb: {
      fr: (domainMax, unit) => `Valeur supérieure à ${domainMax} ${unit} : le prisme est `
        + 'dessiné à la hauteur maximale et ne dit plus combien. Le domaine reste gelé pour que '
        + 'la même donnée fasse la même hauteur d\'une session à l\'autre.',
      en: (domainMax, unit) => `Value above ${domainMax} ${unit}: the prism is drawn at the `
        + 'maximum height and stops saying how much. The domain stays frozen so that the same '
        + 'data makes the same height from one session to the next.',
      sample: ['12,000', 'charge points'],
    },
  },

  /** Zero is a measurement, and is not drawn like the absence of one. */
  zero: {
    label: { fr: 'mesuré à zéro', en: 'measured at zero' },
    blurb: {
      fr: 'Emprise dessinée à plat, remplie et cerclée. Zéro est une mesure : '
        + 'elle ne se dessine pas comme une absence de mesure.',
      en: 'The extent is drawn flat, filled and outlined. Zero is a measurement: it is not '
        + 'drawn the way the absence of one is.',
    },
  },

  /** The two refusals, which are independent of each other. */
  noValue: {
    label: {
      fr: (variable) => `${variable} — non publié`,
      en: (variable) => `${variable} — not published`,
      sample: ['charge points'],
    },
    blurb: {
      fr: 'Aucun prisme : seule l’emprise en grille est dessinée. Un motif et non une '
        + 'teinte, parce que sur un globe photoréaliste il n’existe aucune couleur neutre.',
      en: 'No prism: only the extent is drawn, in a grid pattern. A pattern and not a tint, '
        + 'because on a photorealistic globe there is no neutral color.',
    },
  },
  noRatio: {
    label: {
      fr: (variable) => `${variable} — non publié`,
      en: (variable) => `${variable} — not published`,
      sample: ['charge points per 10,000 residents'],
    },
    blurb: {
      fr: 'Le prisme est à sa hauteur, mais son corps est rayé : la hauteur est mesurée, '
        + 'la couleur est refusée. Les deux absences sont indépendantes.',
      en: 'The prism stands at its height but its body is striped: the height is measured, '
        + 'the color is refused. The two absences are independent of each other.',
    },
  },

  /** The color half of the key. */
  color: {
    title: {
      fr: (variable) => `Couleur — ${variable}`,
      en: (variable) => `Color — ${variable}`,
      sample: ['charge points per 10,000 residents'],
    },
    blurb: {
      fr: 'Un rapport, donc une variation de valeur : c’est ce que la couleur a le droit '
        + 'de dire. Seuils de domaine gelés, jamais recalculés depuis ce qui est à l’écran.',
      en: 'A ratio, so a change of value: that is what color is allowed to say. Frozen domain '
        + 'breaks, never recomputed from what is on screen.',
    },
  },
});
