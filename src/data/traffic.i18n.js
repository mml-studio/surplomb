/**
 * Strings of `src/data/traffic.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The three congestion rungs are NOT here: they come from the shared ladder
 * (`congestionLadder.i18n.js`), because this layer and `road-status-fr` print
 * their words on one fused row. What is here is everything that says WHERE A
 * NUMBER CAME FROM, and that is the whole point of this key:
 *
 *   · the block opens on « Véhicules simulés » and on WHEN the speeds on
 *     screen were received from TomTom — a clock time read off the tiles, not
 *     a cadence;
 *   · the thresholds are printed as shares of the road's own speed without
 *     traffic, derived from the classifier so a key cannot disagree with the map;
 *   · an unmeasured street says its speed was invented;
 *   · and the status line never lets a keyless simulation read as a feed.
 *
 * The status lines ship in English on the French globe — they came with the
 * upstream layer — so `fr` repeats them word for word and the French rewrite
 * is left to whoever polishes this layer's French.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  buckets: {
    // One plain sentence per rung, the cut printed (C1) and derived from the
    // classifier. "Vitesse sans trafic" rather than "vitesse libre": the
    // second is an engineer's term, and it is the same number.
    jam: {
      fr: (threshold) => `moins de ${threshold} % de sa vitesse sans trafic`,
      en: (threshold) => `under ${threshold}% of its free-flow speed`,
      sample: [55],
    },
    slow: {
      fr: (low, high) => `de ${low} à ${high} % de sa vitesse sans trafic`,
      en: (low, high) => `${low} to ${high}% of its free-flow speed`,
      sample: [55, 85],
    },
    free: {
      fr: (threshold) => `${threshold} % ou plus de sa vitesse sans trafic`,
      en: (threshold) => `${threshold}% or more of its free-flow speed`,
      sample: [85],
    },
  },
  legendNote: {
    receivedAt: {
      fr: (time, day) => `Véhicules simulés, animés d’après les vitesses reçues de TomTom ${day ? `le ${day} ` : ''}à ${time}`,
      en: (time, day) => `Simulated vehicles, driven by the speeds received from TomTom ${day ? `on ${day} ` : ''}at ${time}`,
      note: 'The block’s source line: when the OLDEST tile on screen left TomTom — never the time of our last request. `day` is null today, “20 sept.” otherwise.',
      sample: ['12:16', null],
    },
    receiving: {
      fr: 'Véhicules simulés, animés d’après les vitesses reçues de TomTom',
      en: 'Simulated vehicles, driven by the speeds received from TomTom',
      note: 'Same line before the first tile has landed.',
    },
    keyless: {
      fr: 'Véhicules simulés : aucune vitesse n’est mesurée ici',
      en: 'Simulated vehicles: no speed is measured here',
      note: 'A self-hosted globe without a TomTom key. Must never imply a feed.',
    },
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
    vehicleFrames: {
      label: { fr: 'CADRES', en: 'FRAMES' },
      show: {
        fr: 'Encadre les véhicules simulés et affiche leur numéro — pour vérifier la simulation',
        en: 'Frame the simulated vehicles and show their numbers — to check the simulation',
      },
      hide: {
        fr: 'Retire les cadres et les numéros des véhicules simulés',
        en: 'Remove the frames and numbers from the simulated vehicles',
      },
    },
  },
  legend: {
    unmeasured: { fr: 'Non mesuré', en: 'Not measured' },
    unmeasuredBlurb: {
      fr: 'aucune mesure sur cette rue : sa vitesse est inventée',
      en: 'nothing measures this street: its speed is invented',
    },
    closedRoad: { fr: 'Route fermée', en: 'Closed road' },
  },
  /**
   * The card a clicked stretch of road opens. Every line is something TomTom
   * sent or something the reader is owed about it: the rung, the ratio that
   * earned it, and when it was received. TomTom's relative tiles carry no
   * km/h, so the card prints none rather than inventing one from a limit sign.
   */
  card: {
    ratio: {
      fr: (pct) => `roule à ${pct} % de sa vitesse sans trafic`,
      en: (pct) => `moving at ${pct}% of its free-flow speed`,
      sample: [62],
    },
    closed: {
      fr: 'TomTom signale ce tronçon fermé',
      en: 'TomTom reports this stretch closed',
    },
    received: {
      fr: (time, day) => `reçu de TomTom ${day ? `le ${day} ` : ''}à ${time}`,
      en: (time, day) => `received from TomTom ${day ? `on ${day} ` : ''}at ${time}`,
      note: '`day` is null today, “20 sept.” on another day.',
      sample: ['12:16', null],
    },
    simulated: {
      fr: 'les véhicules qui y roulent sont simulés',
      en: 'the vehicles moving on it are simulated',
    },
  },
  /** TomTom's `road_type`, which arrives in English whatever the page says. */
  roadClass: {
    'Motorway': { fr: 'Autoroute', en: 'Motorway' },
    'International road': { fr: 'Grand axe', en: 'Major road' },
    'Major road': { fr: 'Grand axe', en: 'Major road' },
    'Secondary road': { fr: 'Route secondaire', en: 'Secondary road' },
    'Major local road': { fr: 'Rue principale', en: 'Main street' },
    'Connecting road': { fr: 'Rue de liaison', en: 'Connecting street' },
    'Local road': { fr: 'Rue', en: 'Street' },
    unknown: { fr: 'Tronçon', en: 'Road' },
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
