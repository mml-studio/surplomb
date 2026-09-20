/**
 * Strings of `src/data/earthquakes.js` — Earthquakes (24 h), from USGS.
 *
 * ── THE CARD EXISTS TO DECODE NUMBERS, AND THAT SURVIVES ────────────────────
 *
 * The whole rewrite this card came from was about not shipping a bare
 * magnitude: `6.2` means nothing to a reader who does not know the scale, so
 * every line pairs a number with what it does — the class, the effect, the
 * depth's consequence, the instant on the reader's own clock. Both languages
 * carry all four, and the effects stay hedged (*can*, *rare*) for the reason
 * the French hedges them: what a magnitude does at the surface depends on
 * depth, distance and what is built there.
 *
 * ── THE PLACE STRING IS NOT TRANSLATED. IT IS UN-TRANSLATED ─────────────────
 *
 * `frenchEarthquakePlace` exists because USGS publishes `86 km SSW of
 * Isangel, Vanuatu` and a French reader should not have to decode `SSW`. In
 * English there is nothing to do: the feed's own string IS the English, so the
 * module returns it untouched and no message here covers it. That is also why
 * `COMPASS_FR` stays French — it is only ever read on the French branch.
 *
 * ── AND `9.5` IS VALDIVIA, 1960 ─────────────────────────────────────────────
 *
 * The gauge's top end is the world record and says so, in three words, in
 * both languages.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The four age bands and the one non-band, keyed by band id.
 *
 * The bounds are hours of the wall clock, never quantiles of the current
 * feed, so the labels are the bounds and nothing else.
 */
export const EARTHQUAKE_AGE_WORDS = defineMessages({
  h1: {
    label: { fr: 'moins d’1 h', en: 'under 1 h' },
    blurb: {
      fr: 'Secousse de la dernière heure. La bande la plus claire de l’échelle.',
      en: 'A quake from the last hour. The lightest band on the scale.',
    },
  },
  h6: {
    label: { fr: '1 à 6 h', en: '1 to 6 h' },
    blurb: { fr: 'Entre une et six heures.', en: 'Between one and six hours.' },
  },
  h12: {
    label: { fr: '6 à 12 h', en: '6 to 12 h' },
    blurb: { fr: 'Entre six et douze heures.', en: 'Between six and twelve hours.' },
  },
  h24: {
    label: { fr: '12 à 24 h', en: '12 to 24 h' },
    blurb: {
      fr: 'Le fond de la fenêtre : la secousse sort de la carte au prochain relevé. '
        + 'Le flux USGS « all_day » livre parfois quelques minutes de plus que 24 h ; '
        + 'ces événements tombent dans cette bande, ils ne sont pas écartés.',
      en: 'The floor of the window: this quake leaves the map at the next poll. '
        + 'The USGS “all_day” feed sometimes delivers a few minutes more than 24 h; '
        + 'those events land in this band, they are not discarded.',
      keep: ['all_day'],
    },
  },
  unknown: {
    label: { fr: 'âge non publié', en: 'age not published' },
    blurb: {
      fr: 'Horodatage absent du flux, ou postérieur de plus de cinq minutes à l’horloge '
        + 'locale. L’âge n’est pas mesuré, donc il n’est pas peint sur l’échelle : ce gris '
        + 'bleuté n’est pas une cinquième ancienneté.',
      en: 'No timestamp in the feed, or one more than five minutes ahead of the local '
        + 'clock. The age is not measured, so it is not painted on the scale: this '
        + 'blue-grey is not a fifth age.',
    },
  },
});

/**
 * What a magnitude MEANS, keyed by the whole-unit floor of its class.
 *
 * The bands are the ones every agency publishes. The effects are hedged on
 * purpose in both languages: what a magnitude does at the surface depends on
 * depth, distance and what is built there, and two of those three are on the
 * card already.
 */
export const EARTHQUAKE_MAGNITUDE_WORDS = defineMessages({
  m8: {
    label: { fr: 'séisme dévastateur', en: 'devastating earthquake' },
    effect: {
      fr: 'Destruction sur des centaines de km.',
      en: 'Destruction over hundreds of km.',
    },
  },
  m7: {
    label: { fr: 'séisme majeur', en: 'major earthquake' },
    effect: {
      fr: 'Dégâts graves sur toute une région.',
      en: 'Severe damage across a whole region.',
    },
  },
  m6: {
    label: { fr: 'séisme destructeur', en: 'destructive earthquake' },
    effect: {
      fr: 'Bâtiments endommagés jusqu’à 100 km.',
      en: 'Buildings damaged up to 100 km away.',
    },
  },
  m5: {
    label: { fr: 'secousse forte', en: 'strong shaking' },
    effect: {
      fr: 'Peut endommager les bâtiments fragiles.',
      en: 'Can damage fragile buildings.',
    },
  },
  m4: {
    label: { fr: 'secousse modérée', en: 'moderate shaking' },
    effect: { fr: 'Ressentie sur place, dégâts rares.', en: 'Felt locally, damage rare.' },
  },
  m3: {
    label: { fr: 'secousse faible', en: 'light shaking' },
    effect: {
      fr: 'Ressentie près de l’épicentre, sans dégât.',
      en: 'Felt near the epicenter, no damage.',
    },
  },
  m0: {
    label: { fr: 'secousse très faible', en: 'very light shaking' },
    effect: { fr: 'Rarement ressentie, sans dégât.', en: 'Rarely felt, no damage.' },
  },
});

/**
 * What a depth changes for someone standing above it, keyed by class floor.
 *
 * 70 km and 300 km are the boundaries seismology already uses, so the card is
 * not inventing a classification. Kept to one short clause each in both
 * languages: this is the only line of the card that wraps, and a long
 * qualifier turns its two rendered lines into three.
 */
export const EARTHQUAKE_DEPTH_WORDS = defineMessages({
  d300: {
    fr: 'très profond, rarement ressenti en surface',
    en: 'very deep, rarely felt at the surface',
  },
  d70: {
    fr: 'profondeur moyenne, secousse atténuée',
    en: 'intermediate depth, shaking damped',
  },
  d0: {
    fr: 'peu profond, donc ressenti plus fort',
    en: 'shallow, so felt more strongly',
  },
});

export default defineMessages({
  /**
   * Month names for the card's clock line.
   *
   * French spells the month out, as it always did; English abbreviates, which
   * is the glossary's own date style (`Sep 19, 2026`). Built by hand rather
   * than through `toLocaleString`, because `hour: '2-digit'` renders midnight
   * as `24` on some ICU builds.
   */
  months: {
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },

  /** The instant the event happened, on the READER's calendar. */
  instant: {
    today: {
      fr: (clock) => `aujourd’hui à ${clock} chez vous`,
      en: (clock) => `today at ${clock} your time`,
      sample: ['21 h 41'],
      note: '“chez vous” / “your time” is the four characters that buy back '
        + 'what UTC gave: it forestalls reading 21:41 as the evening WHERE IT '
        + 'SHOOK, which UTC never fixed either.',
    },
    yesterday: {
      fr: (clock) => `hier à ${clock} chez vous`,
      en: (clock) => `yesterday at ${clock} your time`,
      sample: ['21 h 41'],
    },
    onDay: {
      fr: (day, month, clock) => `le ${day} ${month} à ${clock} chez vous`,
      en: (day, month, clock) => `${month} ${day} at ${clock} your time`,
      sample: [13, 'Sep', '21:41'],
      note: 'The two halves are in the opposite order in the two languages, '
        + 'which is why the date is one message and not three pieces.',
    },
    clock: {
      fr: (hour, minute) => `${hour} h ${minute}`,
      en: (hour, minute) => `${hour}:${minute}`,
      sample: [21, '41'],
      note: 'French writes “9 h 05”, not “09 h 05”, so the hour is NOT padded; '
        + 'English pads it, because 24-hour clocks are written 09:05.',
    },
  },

  /** How long ago. Hours are floored, never rounded — see the module. */
  ago: {
    now: { fr: 'à l’instant', en: 'just now' },
    minutes: {
      fr: (minutes) => `il y a ${minutes} min`,
      en: (minutes) => `${minutes} min ago`,
      sample: [11],
    },
    hours: {
      fr: (hours) => `il y a ${hours} h`,
      en: (hours) => `${hours} h ago`,
      sample: [11],
    },
  },

  /** The key: the two shape channels reduced to their domain, then the colour. */
  legend: {
    note: {
      fr: (floor) => `USGS, flux « all_day » M${floor}+ · relevé toutes `
        + 'les 60 s. Cliquer un point ouvre sa fiche.',
      en: (floor) => `USGS, “all_day” feed, M${floor}+ · polled every 60 s. `
        + 'Click a dot to open its card.',
      sample: ['2.5'],
      keep: ['all_day'],
    },
    magnitude: {
      fr: (floor, max) => `Point — magnitude, M${floor} à M${max}`,
      en: (floor, max) => `Dot — magnitude, M${floor} to M${max}`,
      sample: ['2.5', '9.5'],
    },
    magnitudeBlurb: {
      fr: (basePx, perUnit, ratio) => `${basePx} px au plancher, +${perUnit} px `
        + `par unité, à toute distance. Ni énergie — +1 vaut ×${ratio} —, ni emprise.`,
      en: (basePx, perUnit, ratio) => `${basePx} px at the floor, +${perUnit} px `
        + `per unit, at any distance. Not energy — +1 is ×${ratio} — and not extent.`,
      sample: [8, 6, '31.6'],
      note: 'The energy ratio lives on this row and nowhere else: it qualifies '
        + 'the MARK’s scale, not any one event.',
    },
    depth: {
      fr: (maxKm) => `Tige — profondeur du foyer, 0 à ${maxKm} km`,
      en: (maxKm) => `Stem — focus depth, 0 to ${maxKm} km`,
      sample: ['700'],
    },
    depthBlurb: {
      fr: 'À l’échelle 1:1, et vers le haut : la tige monte, le foyer descend.',
      en: 'At 1:1 scale, and upwards: the stem rises as the focus goes down.',
      note: 'The label already binds length to depth; what no shape says is '
        + 'the SCALE and the DIRECTION, so those are what the line is spent on.',
    },
    age: {
      fr: 'Couleur — âge dans la fenêtre de 24 h',
      en: 'Color — age within the 24 h window',
    },
    offRamp: {
      fr: 'Hors rampe : ce gris n’est pas une cinquième ancienneté.',
      en: 'Off the ramp: this grey is not a fifth age.',
    },
    noDepth: {
      fr: 'profondeur non publiée — point creux, aucune tige',
      en: 'depth not published — hollow dot, no stem',
    },
    noDepthBlurb: {
      fr: 'Une tige absente seule se confondrait avec une secousse superficielle.',
      en: 'A missing stem on its own would read as a shallow quake.',
      note: 'The one fallback that earns a key row: a hollow ring is not '
        + 'merely undecoded, it is decoded WRONG — as a small event.',
    },
  },

  /** What the layer had to leave out, under the classes it qualifies. */
  note: {
    depthFloor: {
      fr: (count, plainCount) => `${count} foyer${plainCount > 1 ? 's' : ''} à moins d’1 km : `
        + 'tige dessinée au plancher d’1 km, seule rupture du 1:1 — « mesuré à zéro » '
        + 'n’est pas « non mesuré ».',
      en: (count, plainCount) => `${count} ${plainCount > 1 ? 'foci' : 'focus'} under 1 km: `
        + 'stem drawn at the 1 km floor, the only break in the 1:1 — “measured at zero” '
        + 'is not “not measured”.',
      sample: ['3', 3],
      note: 'English keeps the Latin plural because “focuses” reads as the '
        + 'verb. Hand-written rather than through plural(), which has no '
        + 'irregular table.',
    },
    labelCap: {
      fr: (drawn, labelled) => `Les ${drawn} secousses sont dessinées ; seules les `
        + `${labelled} plus fortes magnitudes portent une étiquette.`,
      en: (drawn, labelled) => `All ${drawn} quakes are drawn; only the `
        + `${labelled} strongest magnitudes carry a label.`,
      sample: ['412', '40'],
    },
  },

  /** The card for one clicked event. */
  card: {
    title: {
      fr: (magnitude, klass) => `Magnitude ${magnitude} — ${klass}`,
      en: (magnitude, klass) => `Magnitude ${magnitude} — ${klass}`,
      sample: ['6.2', 'destructive earthquake'],
    },
    noMagnitude: { fr: 'Magnitude non publiée', en: 'Magnitude not published' },
    gauge: {
      fr: (floor, gauge, max, top) => `${floor} ${gauge} ${max} ${top}`,
      en: (floor, gauge, max, top) => `${floor} ${gauge} ${max} ${top}`,
      sample: ['2.5', '████░░░░░░', '9.5', 'world record'],
    },
    gaugeTop: {
      fr: 'record mondial',
      en: 'world record',
      note: '9.5 is Valdivia, 1960, and nothing since.',
    },
    place: {
      fr: (place) => `📍 ${place}`,
      en: (place) => `📍 ${place}`,
      sample: ['86 km SSW of Isangel, Vanuatu'],
    },
    when: {
      fr: (instant, ago) => `🕐 ${instant} · ${ago}`,
      en: (instant, ago) => `🕐 ${instant} · ${ago}`,
      sample: ['yesterday at 21:41 your time', '11 h ago'],
      note: 'Both, because one alone is either unreadable at a glance or '
        + 'unanchored in the day.',
    },
    noTime: {
      fr: '🕐 date non publiée par l’USGS',
      en: '🕐 date not published by the USGS',
    },
    noDepth: {
      fr: '↓ profondeur non publiée par l’USGS',
      en: '↓ depth not published by the USGS',
    },
    depth: {
      fr: (km, datum) => `↓ foyer à ${km} km ${datum}`,
      en: (km, datum) => `↓ focus ${km} km ${datum}`,
      sample: ['33', 'below sea level'],
    },
    belowSeaLevel: { fr: 'sous le niveau de la mer', en: 'below sea level' },
    aboveSeaLevel: {
      fr: 'au-dessus du niveau de la mer',
      en: 'above sea level',
      note: 'USGS publishes negative depths for foci above sea level, so the '
        + 'datum is named with the sign rather than assumed.',
    },
    source: {
      fr: 'Source : USGS, institut géologique américain',
      en: 'Source: USGS, the United States Geological Survey',
      note: 'The acronym is expanded once, in both languages, because “USGS” '
        + 'names nothing to most readers of either.',
    },
  },
});
