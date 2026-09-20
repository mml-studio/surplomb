/**
 * Strings of `src/data/veloPulse.js` — the cycling pulse on the globe.
 * See docs/i18n/CONVENTIONS.md.
 *
 * The layer's own name and source line are registry strings and stay in the
 * module. What is here is the row: three ways to look at a typical week, the
 * bands' shared caveat, and the two sentences that say when the map cannot be
 * read at this altitude.
 *
 * `MAINTENANT` / `NOW` is the default because it makes the layer feel alive:
 * a reader opening the globe on a Tuesday morning sees a Tuesday morning.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  modes: {
    now: {
      label: { fr: 'MAINTENANT', en: 'NOW' },
      blurb: {
        fr: 'L’heure de la semaine qu’il est en ce moment.',
        en: 'The hour of the week it currently is.',
      },
    },
    week: {
      label: { fr: 'SEMAINE', en: 'WEEK' },
      blurb: {
        fr: 'Déroule les 168 heures d’une semaine type, une heure toutes les 0,5 s. '
          + 'En pause, l’heure affichée déplace aussi les autres couches de semaine type.',
        en: 'Plays the 168 hours of a typical week, one hour every 0.5 s. '
          + 'Paused, the hour on screen also moves the other typical-week layers.',
      },
    },
    peak: {
      label: { fr: 'POINTE', en: 'PEAK' },
      blurb: {
        fr: 'L’heure la plus chargée du réseau — et les autres couches de semaine type s’y placent aussi.',
        en: 'The network’s busiest hour — and the other typical-week layers move to it too.',
      },
    },
  },
  /** The `SEMAINE` chip while the week is paused on an hour. */
  weekPaused: { fr: 'SEMAINE ❚❚', en: 'WEEK ❚❚' },

  legend: {
    unsampled: { fr: 'non relevé', en: 'not sampled' },
    unsampledBlurb: {
      fr: 'Aucun relevé à cette heure de la semaine pour ce site.',
      en: 'No reading at this hour of the week for this site.',
    },
    note: {
      fr: (slot) => `Part du maximum hebdomadaire du site · ${slot}`,
      en: (slot) => `Share of the site’s weekly maximum · ${slot}`,
      note: 'True of every band, so it is said once under the whole key.',
      sample: ['Tuesday 08:00'],
    },
  },

  /** Two or more cities, joined for the "…, outside this view" clause. */
  places: {
    fr: (places) => places,
    en: (places) => places,
    note: 'Already joined by formatList in the page\'s language.',
    sample: ['Lyon and Paris'],
  },

  row: {
    loading: { fr: 'Semaine type…', en: 'Typical week…' },
    tooHigh: {
      fr: (ceilingKm) => `Zoome sous ${ceilingKm} km — au-dessus, une tache fait moins d’un pixel`,
      en: (ceilingKm) => `Zoom in below ${ceilingKm} km — above it, a blob is less than one pixel`,
      sample: [40],
    },
    slotWindow: {
      fr: (slot) => `${slot} — semaine type de juin 2026`,
      en: (slot) => `${slot} — typical week of June 2026`,
      note: 'The four averaged weeks of the shipped pack.',
      sample: ['Tuesday 08:00'],
    },
  },
});
