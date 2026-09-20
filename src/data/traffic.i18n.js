/**
 * Strings of `src/data/traffic.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The three congestion rungs are NOT here: they come from the shared ladder
 * (`congestionLadder.i18n.js`), because this layer and `road-status-fr` print
 * their words on one fused row. What is here is everything that says WHERE A
 * NUMBER CAME FROM, and that is the whole point of this key:
 *
 *   · the thresholds are printed as shares of free-flow speed, derived from
 *     the classifier so a key cannot disagree with the map;
 *   · a simulated speed says it was invented and points at the chip that
 *     removes it;
 *   · and the status line never lets a keyless simulation read as a feed.
 *
 * The status lines ship in English on the French globe — they came with the
 * upstream layer — so `fr` repeats them word for word and the French rewrite
 * is left to whoever polishes this layer's French.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  buckets: {
    jam: {
      fr: (threshold) => `moins de ${threshold} % de la vitesse libre`,
      en: (threshold) => `under ${threshold}% of free-flow speed`,
      sample: [55],
    },
    slow: {
      fr: (low, high) => `${low} à ${high} % de la vitesse libre`,
      en: (low, high) => `${low} to ${high}% of free-flow speed`,
      sample: [55, 85],
    },
    free: {
      fr: (threshold) => `au moins ${threshold} % de la vitesse libre`,
      en: (threshold) => `at least ${threshold}% of free-flow speed`,
      sample: [85],
    },
  },
  legendNote: {
    fr: 'débit modélisé par TomTom, rafraîchi toutes les 60 s',
    en: 'flow modeled by TomTom, refreshed every 60 s',
    note: 'Four blocks share this row on four different clocks; each names its own.',
  },
  chips: {
    measuredOnly: {
      label: { fr: 'MESURÉ SEUL', en: 'MEASURED ONLY' },
      showSimulated: {
        fr: 'Affiche aussi le trafic simulé sur les routes sans mesure TomTom',
        en: 'Also show simulated traffic on roads TomTom does not measure',
      },
      hideSimulated: {
        fr: 'N’affiche que les routes dont TomTom publie réellement le débit',
        en: 'Show only the roads TomTom actually publishes a flow for',
      },
    },
    flowRibbon: {
      label: { fr: 'FLUX TOMTOM', en: 'TOMTOM FLOW' },
      hide: {
        fr: 'Masque le débit mesuré et ne garde que les points animés',
        en: 'Hide the measured flow and keep only the animated dots',
      },
      show: {
        fr: 'Trace le débit mesuré par TomTom sur sa propre géométrie — '
          + 'il s’affiche sans attendre le graphe routier',
        en: 'Draw the flow TomTom measured on its own geometry — '
          + 'it paints without waiting for the road graph',
      },
    },
  },
  legend: {
    simulated: { fr: 'Vitesse simulée', en: 'Simulated speed' },
    simulatedBlurb: {
      fr: 'vitesse inventée, aucune mesure publiée — « MESURÉ SEUL » les retire',
      en: 'an invented speed, nothing published — “MEASURED ONLY” removes them',
      note: 'Names the chip that hides them; the quoted label must match the chip.',
    },
    closedRoad: { fr: 'Route fermée', en: 'Closed road' },
  },
  status: {
    noVehiclesRibbon: {
      fr: 'no vehicles, flow ribbon only',
      en: 'no vehicles, flow ribbon only',
      note: 'Ships in English on the French globe, like the rest of this status line.',
    },
    noVehicles: { fr: 'no vehicles', en: 'no vehicles' },
    retry: {
      fr: (error, missing) => `${error} — ${missing}, move the camera to retry`,
      en: (error, missing) => `${error} — ${missing}, move the camera to retry`,
      sample: ['Overpass unreachable', 'no vehicles'],
    },
    failed: {
      fr: (error, missing) => `${error} — ${missing}`,
      en: (error, missing) => `${error} — ${missing}`,
      sample: ['Overpass unreachable', 'no vehicles, flow ribbon only'],
    },
    degraded: {
      fr: (error) => `SIMULATED — ${error}`,
      en: (error) => `SIMULATED — ${error}`,
      note: 'One string for both `error` and `loadingLabel`: the manager drops the second in its error branch.',
      sample: ['TomTom daily budget reached'],
    },
    syncing: { fr: 'syncing LIVE traffic flow', en: 'syncing LIVE traffic flow' },
    live: {
      fr: (coveragePct) => `LIVE · TomTom flow · ${coveragePct}% cov`,
      en: (coveragePct) => `LIVE · TomTom flow · ${coveragePct}% cov`,
      sample: [82],
    },
    unreachable: {
      fr: 'SIMULATED — traffic service unreachable',
      en: 'SIMULATED — traffic service unreachable',
    },
    keyless: {
      fr: 'SIMULATED — add TomTom key for live',
      en: 'SIMULATED — add TomTom key for live',
      note: 'Must never imply a live feed.',
    },
  },
});
