/**
 * Strings of `src/data/veloPulseHud.js` — the cycling-pulse panel.
 * See docs/i18n/CONVENTIONS.md.
 *
 * The panel is built from one HTML template, so its words are read when it
 * MOUNTS rather than when the module loads: `panelMarkup()` composes the
 * template with the language of the page. The transport labels are then
 * rewritten in place as the week plays.
 *
 * The distinction the sentence has to keep is the layer's: a dock measures a
 * stock, a counter measures a flow, and the legend names which city does
 * which — one mark per station, area for quantity, never a heatmap.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The seven day initials under the week strip, one letter each. */
  dayInitials: {
    fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
    en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    note: 'One character per day: the strip gives each day a seventh of its width.',
  },
  panel: {
    ariaLabel: { fr: 'Pouls vélo — semaine type', en: 'Cycling pulse — typical week' },
    grip: {
      fr: 'Glissez pour déplacer le panneau · double-clic ou appui long pour le remettre en place',
      en: 'Drag to move the panel · double-click or long press to put it back',
    },
    title: { fr: 'POULS VÉLO · SEMAINE TYPE', en: 'CYCLING PULSE · TYPICAL WEEK' },
    stripLabel: { fr: 'Heure de la semaine type', en: 'Hour of the typical week' },
    closeSite: { fr: 'Fermer la fiche du site', en: 'Close the site card' },
    siteEmpty: {
      fr: 'Cliquez une tache pour lire une station, sa semaine et son maximum.',
      en: 'Click a blob to read a station, its week and its maximum.',
    },
  },
  transport: {
    play: { fr: 'DÉROULER', en: 'PLAY' },
    pause: { fr: 'PAUSE', en: 'PAUSE' },
    playLabel: { fr: 'Dérouler la semaine', en: 'Play the week' },
    pauseLabel: { fr: 'Mettre la semaine en pause', en: 'Pause the week' },
  },
  clock: {
    valueText: {
      fr: (slot, phrase) => `${slot} — ${phrase}`,
      en: (slot, phrase) => `${slot} — ${phrase}`,
      note: 'What a screen reader hears while the cursor moves.',
      sample: ['Tuesday 08:00', 'peak'],
    },
  },
  window: {
    averaged: {
      fr: (weeks) => `${weeks} semaines moyennées · `,
      en: (weeks) => `${weeks} weeks averaged · `,
      sample: [4],
    },
    span: {
      fr: (prefix, start, end) => `${prefix}${start} → ${end}`,
      en: (prefix, start, end) => `${prefix}${start} → ${end}`,
      note: 'Read from the pack, never typed: a rebuild over another month must not leave a stale label.',
      sample: ['4 weeks averaged · ', '2026-06-01', '2026-06-28'],
    },
    fallback: { fr: 'semaine type', en: 'typical week' },
  },
  legend: {
    swatchTitle: {
      fr: (band) => `Part du maximum hebdomadaire du site — ${band}`,
      en: (band) => `Share of the site’s weekly maximum — ${band}`,
      sample: ['≥ 80%'],
    },
    head: {
      fr: 'Une tache par station : la couleur, c’est la part du maximum de la semaine'
        + ' du site lui-même ; la surface, c’est la quantité mesurée.',
      en: 'One blob per station: the color is its share of that site’s own weekly maximum,'
        + ' the area is the measured quantity.',
      note: 'NAMED as a proportional-symbol map: it is not a heatmap, and every blob stays clickable.',
    },
    city: { fr: 'ville', en: 'city', note: 'Stands in when a city label is missing.' },
    stock: {
      fr: (city) => `${city} : le remplissage des stations (un STOCK)`,
      en: (city) => `${city}: how full the docks are (a STOCK)`,
      sample: ['Lyon'],
    },
    flow: {
      fr: (city) => `${city} : les cyclistes comptés (un FLUX)`,
      en: (city) => `${city}: the cyclists counted (a FLOW)`,
      sample: ['Paris'],
    },
    sentence: {
      fr: (head, instruments) => `${head} ${instruments}.`,
      en: (head, instruments) => `${head} ${instruments}.`,
      sample: ['One blob per station.', 'Lyon: how full the docks are (a STOCK)'],
    },
  },
  outOfRange: {
    fr: (ceilingKm) => `Trop haut pour lire le champ — zoome sous ${ceilingKm} km.`,
    en: (ceilingKm) => `Too high to read the field — zoom in below ${ceilingKm} km.`,
    note: 'Said rather than corrected: the marks are not inflated to stay visible.',
    sample: [40],
  },
});
