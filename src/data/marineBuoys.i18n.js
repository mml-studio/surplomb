/**
 * Strings of `src/data/marineBuoys.js` — see docs/i18n/CONVENTIONS.md.
 *
 * ── THE NINE SEA STATES ARE NOT A TRANSLATION ───────────────────────────────
 *
 * The WMO sea-state code publishes its own names in English AND in French —
 * `Rough` / `mer forte`, `Very high` / `mer très grosse` — and each side is
 * the vocabulary a mariner of that language actually uses. So the `fr` and
 * `en` below are two official lists, not a rendering of one into the other,
 * and neither may be "improved". The English side is the same term the card
 * readouts already print, which is why the two surfaces now agree.
 *
 * The rest is the key of a layer whose mark is a STEM: its height is a
 * reading scale and not a real height, and the sentence that says so carries
 * the exaggeration factor derived from the frozen scale — so a key that
 * drifted from what the renderer draws is not expressible.
 */
import { defineMessages } from '../i18n/messages.js';

/** The nine WMO bands, by index, each in its own official wording. */
export const SEA_STATE_NAMES = defineMessages({
  0: { fr: 'Calme', en: 'Calm' },
  1: { fr: 'Belle', en: 'Smooth' },
  2: { fr: 'Peu agitée', en: 'Slight' },
  3: { fr: 'Agitée', en: 'Moderate' },
  4: { fr: 'Forte', en: 'Rough' },
  5: { fr: 'Très forte', en: 'Very rough' },
  6: { fr: 'Grosse', en: 'High' },
  7: { fr: 'Très grosse', en: 'Very high' },
  8: { fr: 'Énorme', en: 'Phenomenal' },
});

export default defineMessages({
  band: {
    upTo: {
      fr: (name, high) => `${name} · ≤ ${high} m`,
      en: (name, high) => `${name} · ≤ ${high} m`,
      sample: ['Calm', '0.1'],
    },
    over: {
      fr: (name, low) => `${name} · > ${low} m`,
      en: (name, low) => `${name} · > ${low} m`,
      sample: ['Phenomenal', '14'],
    },
    between: {
      fr: (name, low, high) => `${name} · ${low} – ${high} m`,
      en: (name, low, high) => `${name} · ${low} – ${high} m`,
      sample: ['Rough', '2.5', '4'],
    },
  },
  legend: {
    stem: {
      fr: 'Une tige = des vagues mesurées. Plus haute, plus grosses',
      en: 'A stem = measured waves. Taller means bigger',
    },
    stemBlurb: {
      fr: (km) => `Échelle de lecture, pas une hauteur réelle : 1 m de houle dessine ${km} km de tige.`,
      en: (km) => `A reading scale, not a real height: 1 m of swell draws ${km} km of stem.`,
      note: 'The factor comes from the frozen scale, never typed.',
      sample: ['1.5'],
    },
    noSensor: {
      fr: 'Cercle creux = bouée sans capteur de vagues',
      en: 'Hollow circle = buoy with no wave sensor',
    },
    clipped: {
      fr: (maxM) => `Tige en tirets = mer au-delà de ${maxM} m, hors échelle`,
      en: (maxM) => `Dashed stem = sea beyond ${maxM} m, off the scale`,
      sample: ['9'],
    },
    colorChannel: {
      fr: 'Couleur = état de la mer, le nom qu\'en donnent les marins',
      en: 'Color = sea state, in the name mariners give it',
      note: 'Names the channel; the nine rows under it ARE the channel.',
    },
  },
});
