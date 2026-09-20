/**
 * What the loading veil says while the globe is being built — see src/main.js.
 *
 * Eight lines, in the order a boot meets them: configuring the viewer, saying
 * which surface it will start on, loading the photoreal tileset, initializing
 * the systems, then either flying to the default city or restoring a shared
 * view. The last one is the failure line, and it is the only place the reader
 * is told the globe did not come up.
 *
 * `index.html` carries the FIRST line (`loader.status` in
 * src/i18n/markup.i18n.js); these replace it as the boot advances.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  configuring: { fr: 'Configuration du globe…', en: 'Configuring viewer…' },
  photorealOff: {
    fr: 'Tuiles 3D Google éteintes pour cette session — départ sur le globe…',
    en: 'Google 3D Tiles off for this session — starting on the globe…',
    note: '`?photoreal=0`, or a QA run that refuses to spend a metered tile.',
  },
  keyless: {
    fr: 'Ni clé Google ni jeton ion — départ sans clé…',
    en: 'No Google key or ion token — starting keyless…',
  },
  photorealViaIon: { fr: 'Chargement des tuiles 3D Google via Cesium ion…', en: 'Loading Google 3D Tiles via Cesium ion…' },
  photoreal: { fr: 'Chargement des tuiles 3D Google…', en: 'Loading Google 3D Tiles…' },
  systems: { fr: 'Démarrage des systèmes…', en: 'Initializing systems…' },
  flyingTo: {
    fr: (place) => `Vol vers ${place}…`,
    en: (place) => `Flying to ${place}…`,
    sample: ['Paris'],
    note: 'The default city of a first visit; a phone lands there without the flight.',
  },
  restoringShared: { fr: 'Restauration de la vue partagée…', en: 'Restoring shared view…' },
  error: {
    fr: (reason) => `Erreur : ${reason}`,
    en: (reason) => `Error: ${reason}`,
    sample: ['WebGL is not available'],
    note: 'The veil is the only surface left when the globe fails to start.',
  },
});
