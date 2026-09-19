/**
 * Strings of src/data/girondeMegafire.js — see docs/i18n/CONVENTIONS.md.
 *
 * Every number arrives already formatted (`formatNumber`), every instant
 * already labelled (`megafireStepLabel`, `megafireCursorReadout`): a message
 * only places words around them.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  // The play chip. Three stopped states, one button: the label says which.
  play: {
    replay: { fr: '↺ Rejouer', en: '↺ Replay', note: 'The cursor is on the last detection.' },
    start: { fr: '▶ Jouer', en: '▶ Play', note: 'The cursor is on the first detection.' },
    resume: { fr: '▶ Reprendre', en: '▶ Resume', note: 'Stopped halfway.' },
    pauseTitle: {
      fr: (readout) => `${readout} — cliquer pour mettre en pause`,
      en: (readout) => `${readout} — click to pause`,
      sample: ['▶ Jul 26 04:12 UTC · day 4 of 10'],
    },
    replayTitle: {
      fr: (days, seconds, readout) => `Rejouer les ${days} jours en ${seconds} s — ${readout}`,
      en: (days, seconds, readout) => `Replay the ${days} days in ${seconds} s — ${readout}`,
      sample: [10, 24, '■ Aug 1 12:44 UTC · last detection'],
    },
  },
  stepTitle: {
    fr: (sensor, resolution, hectares) => `${sensor} · ${resolution} — ${hectares} ha brûlés à cette image`,
    en: (sensor, resolution, hectares) => `${sensor} · ${resolution} — ${hectares} ha burned in this image`,
    note: 'Tooltip of a step chip. `sensor` is a satellite name (Pléiades Neo, Sentinel-2).',
    sample: ['Sentinel-2', 'VHR2', '5,775.4'],
  },
  legend: {
    playing: {
      fr: (days, seconds) => `Lecture des ${days} jours en ${seconds} s. `
        + 'Entre deux images satellite rien n’est interpolé : la carte tient la dernière '
        + 'mesure, et ce sont les points chauds qui portent l’intervalle.',
      en: (days, seconds) => `Playing the ${days} days in ${seconds} s. `
        + 'Nothing is interpolated between two satellite images: the map holds the last '
        + 'measurement, and the hotspots carry the gap.',
      sample: [10, 24],
    },
    ended: {
      fr: (lastImage) => `Dernière détection de la fenêtre. La dernière image, elle, date du ${lastImage} : `
        + 'après elle, plus personne n’a redessiné ce feu. ↺ pour rejouer depuis le départ.',
      en: (lastImage) => `Last detection of the window. The last image dates from ${lastImage}: `
        + 'after it, nobody redrew this fire. ↺ replays it from the start.',
      note: '`lastImage` is a step label (`Aug 1 11:38`).',
      sample: ['Aug 1 11:38'],
    },
    paused: {
      fr: (days, seconds) => `Curseur arrêté. ▶ reprend la lecture des ${days} jours en ${seconds} s.`,
      en: (days, seconds) => `Cursor stopped. ▶ resumes playing the ${days} days in ${seconds} s.`,
      sample: [10, 24],
    },
    perimeter: {
      fr: (stamp) => `périmètre au ${stamp}`,
      en: (stamp) => `perimeter on ${stamp}`,
      sample: ['Jul 24 09:05'],
    },
    perimeterBlurb: {
      fr: (hectares, sensor, stamp) => `${hectares} ha brûlés, relevés par Copernicus EMS sur `
        + `une image ${sensor} du ${stamp} UTC. Le chiffre est celui du publieur, `
        + 'jamais recalculé sur le dessin.',
      en: (hectares, sensor, stamp) => `${hectares} ha burned, as mapped by Copernicus EMS on `
        + `a ${sensor} image of ${stamp} UTC. The figure is the publisher’s own, `
        + 'never recomputed from the drawing.',
      sample: ['5,775.4', 'Sentinel-2', 'Jul 24 09:05'],
    },
    fronts: { fr: 'front de feu actif', en: 'active fire front' },
    frontsBlurb: {
      fr: 'Lignes photo-interprétées sur l’image, là où le feu avançait encore à l’heure de la prise de vue.',
      en: 'Lines photo-interpreted on the image, where the fire was still advancing when it was taken.',
    },
    flames: { fr: 'flammes visibles', en: 'visible flames' },
    flamesBlurb: {
      fr: 'Points où un interprète a vu des flammes sur une image à 30 cm.',
      en: 'Points where an interpreter saw flames on a 30 cm image.',
    },
    smoke: { fr: 'colonne de fumée', en: 'smoke column' },
    smokeBlurb: {
      fr: 'Rendu, non mesuré. Un panache se dresse là où FIRMS a vu une anomalie '
        + 'thermique dans les 12 h précédant le curseur, et penche du côté où le feu a '
        + 'réellement progressé. Sa hauteur et sa vitesse ne sont mesurées par personne.',
      en: 'Rendered, not measured. A plume rises where FIRMS saw a thermal anomaly '
        + 'in the 12 h before the cursor, and leans the way the fire actually spread. '
        + 'Nobody measures its height or its speed.',
      note: 'Kept to three lines: the on-map key clips a longer blurb, and this is the '
        + 'sentence that says what is invented.',
    },
    hotspot: {
      fr: (rung) => `point chaud ${rung}`,
      en: (rung) => `hotspot ${rung}`,
      note: '`rung` is a fire radiative power class (`< 10 MW`).',
      sample: ['< 10 MW'],
    },
    hotspotBlurb: {
      fr: 'Détection thermique VIIRS ou MODIS. La puissance radiative est celle du pixel, '
        + 'pas celle du feu : un pixel VIIRS mesure 375 m de côté.',
      en: 'VIIRS or MODIS thermal detection. The radiative power is the pixel’s, '
        + 'not the fire’s: a VIIRS pixel is 375 m across.',
    },
    effis: { fr: 'périmètre final EFFIS', en: 'final EFFIS perimeter' },
    effisBlurb: {
      fr: (hectares) => `${hectares} ha — la détection automatique `
        + 'd’EFFIS, sans zone d’intérêt ni échéance, continue après l’arrêt des cartographes. '
        + 'GDACS, qui note une ALERTE et non une surface, en annonce 47 910.',
      en: (hectares) => `${hectares} ha — EFFIS’s automatic detection, with no area of `
        + 'interest and no deadline, keeps going after the mappers stop. GDACS, which '
        + 'scores an ALERT rather than an area, announces 47,910.',
      sample: ['37,191'],
    },
  },
});
