/**
 * Strings of `src/data/firmsHeatmap.js` — Active fires (FIRMS).
 *
 * INHERITED IN ENGLISH, AND NOW FRENCH TOO. This layer came from the upstream
 * project with English strings, so the French globe has been keying its fire
 * ramp in English. The English below is the shipped wording, word for word;
 * the French is what was missing.
 *
 * ── THE VOCABULARY IS THE MEGAFIRE'S ────────────────────────────────────────
 *
 * `girondeMegafire.i18n.js` (#282) already settled how this product reads in
 * French: *point chaud* for a hotspot, *puissance radiative* for FRP,
 * *détection* for one satellite pixel. Two fire layers on one globe that
 * named the same measurement two ways would read as two measurements, so the
 * words are the same here.
 *
 * ── AND `FRP` STAYS `FRP` ───────────────────────────────────────────────────
 *
 * The acronym is on the card beside the number and in the legend beside the
 * ramp, and it is what a reader would search for in the FIRMS documentation.
 * It is glossed once — *puissance radiative (FRP)* — and then used bare.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The key, below ~750 km, where each dot is one detection. */
  detections: {
    label: {
      fr: 'Une détection, colorée par sa puissance radiative',
      en: 'One detection, coloured by radiative power',
      note: 'Same words as girondeMegafire: one detection is one satellite '
        + 'pixel, and the colour is the pixel’s own FRP.',
    },
    blurb: {
      fr: 'Sous ~750 km, chaque point est une détection satellite : '
        + 'rouge au-dessus de ~110 MW de FRP, orange au-dessus de ~40 MW, jaune en dessous. '
        + 'La taille du marqueur suit la FRP aussi.',
      en: 'Below ~750 km each dot is a single satellite detection; '
        + 'red above ~110 MW FRP, orange above ~40 MW, yellow below. '
        + 'Marker size follows FRP too.',
      keep: ['FRP'],
    },
  },

  /** The key, above it, where the dots are folded into a grid. */
  heat: {
    unit: {
      fr: (degrees) => `carreau de ${degrees}°`,
      en: (degrees) => `${degrees}° cell`,
      sample: ['0.5'],
      note: 'The glossary calls a grid cell a *carreau* in French and a *cell* '
        + 'in English; the degree size is what makes it readable at a glance.',
    },
    atLeast: {
      fr: (count, unit) => `≥ ${count} détections par ${unit}`,
      en: (count, unit) => `≥ ${count} detections per ${unit}`,
      sample: ['180', '0.5° cell'],
    },
    below: {
      fr: (count, unit) => `moins de ${count} par ${unit}`,
      en: (count, unit) => `below ${count} per ${unit}`,
      sample: ['60', '0.5° cell'],
    },
    perGround: {
      fr: 'Compté par unité de SURFACE AU SOL, pas par carreau : un carreau en degrés '
        + 'couvre moins de terre à mesure qu’on monte vers le nord, et le compte est '
        + 'divisé par cos(latitude) pour que la couleur ne récompense pas la latitude.',
      en: 'Counted per unit GROUND area, not per cell: a degree cell '
        + 'covers less land the further north it sits, and the count is '
        + 'divided by cos(latitude) so the colour cannot reward latitude.',
    },
    drawn: {
      fr: (count) => `${count} carreaux tracés`,
      en: (count) => `${count} cells drawn`,
      sample: ['412'],
    },
    fixedScale: {
      fr: 'L’échelle est fixe, jamais étirée sur la vue courante : le même feu a la '
        + 'même couleur sur n’importe quel écran et à n’importe quel cadrage.',
      en: 'The scale is fixed, not stretched to the current view — the '
        + 'same fire is the same colour on any screen size and at any framing.',
    },
  },

  /** One detection, named. */
  fire: {
    withFrp: {
      fr: (frp) => `Feu · FRP ${frp} MW`,
      en: (frp) => `Fire · FRP ${frp} MW`,
      sample: ['112.4'],
      note: 'FRP is the fire radiative power of the pixel, in megawatts. The '
        + 'acronym is kept: it is what the FIRMS documentation calls it.',
    },
    card: {
      fr: (frp) => `FEU · ${frp} MW`,
      en: (frp) => `FIRE · ${frp} MW`,
      sample: ['112.4'],
    },
    focusLabel: {
      fr: 'FEU',
      en: 'FIRE',
      note: 'The world-focus badge. All caps, like every badge on this globe.',
    },
    accessibility: {
      fr: (title, details) => `Cibler la détection de feu ${title}, ${details}`,
      en: (title, details) => `Focus fire detection ${title}, ${details}`,
      sample: ['FIRE · 112.4 MW', 'VIIRS · 14:32 UTC'],
    },
  },
});
