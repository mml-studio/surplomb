/**
 * Strings of src/data/militaryInstallations.js — Military sites.
 *
 * A MIXED-LANGUAGE MODULE MADE WHOLE. The layer is inherited from upstream and
 * its status lines shipped in English; the four-class key was written here, in
 * French. Both halves are now bilingual, each keeping its original as its own
 * side.
 *
 * THE KEY IS AN ADMISSION, NOT A TAXONOMY. Every row says which OSM tag it
 * reads and what that tag does NOT prove: the layer says the ground is
 * mapped, never that it is active or what stands on it. `military_land` is
 * the catch-all and by far the biggest class — 39 of the 44 objects in the
 * Toulon roadstead, 68 of the 69 west of Paris — so its row says outright that
 * a grey dot means almost nothing on its own. None of that may soften in
 * English; the tone rule of the glossary applies twice here, because this is
 * public data about places and not intelligence about people.
 *
 * OSM tag names (`military=airfield`, `landuse=military`) are the register's
 * own keys and are never translated.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The four classes, in the key's own order. */
  classes: {
    airfield: {
      label: { fr: 'Base aérienne', en: 'Air base' },
      blurb: {
        fr: 'Le tag OSM military=airfield. La couche dit que le terrain est levé, '
          + 'jamais qu’il est actif ni ce qui s’y trouve.',
        en: 'The OSM tag military=airfield. The layer says the ground is mapped, '
          + 'never that it is active nor what stands on it.',
      },
    },
    navalBase: {
      label: { fr: 'Base navale', en: 'Naval base' },
      blurb: {
        fr: 'Le tag OSM military=naval_base : arsenal, base ou darse militaire.',
        en: 'The OSM tag military=naval_base: naval dockyard, base or military basin.',
      },
    },
    range: {
      label: { fr: 'Champ de tir', en: 'Firing range' },
      blurb: {
        fr: 'Le tag OSM military=range, et lui seul. Un champ de manœuvre '
          + '(training_area) ou une zone dangereuse (danger_area) n’a pas de classe '
          + 'propre : il n’entre dans la couche que s’il porte aussi '
          + 'landuse=military, et tombe alors dans « Terrain militaire ».',
        en: 'The OSM tag military=range, and nothing else. A training area '
          + '(training_area) or a danger area (danger_area) has no class of its '
          + 'own: it enters the layer only if it also carries '
          + 'landuse=military, and then falls under “Military land”.',
      },
    },
    militaryLand: {
      label: { fr: 'Terrain militaire', en: 'Military land' },
      blurb: {
        fr: 'landuse=military, plus les tags military=barracks et military=base. '
          + 'C’est le fourre-tout de la couche, et de loin sa classe la plus '
          + 'fournie — 39 des 44 objets de la rade de Toulon, 68 des 69 de l’ouest '
          + 'parisien. Une pastille grise ne dit donc presque rien de ce qu’elle '
          + 'marque ; la fiche, si.',
        en: 'landuse=military, plus the tags military=barracks and military=base. '
          + 'This is the layer’s catch-all, and by far its best-stocked class — '
          + '39 of the 44 objects in the Toulon roadstead, 68 of the 69 west of '
          + 'Paris. A grey dot therefore says almost nothing about what it marks; '
          + 'the card does.',
      },
    },
  },

  /** What the key still owes the reader about what is NOT on screen. */
  note: {
    capped: {
      fr: (drawn, inView) => `${drawn} marques sur ${inView} dans la vue — les classes nommées `
        + '(base aérienne, base navale, champ de tir) passent avant le fourre-tout, '
        + 'et un site nommé avant un site sans nom.',
      en: (drawn, inView) => `${drawn} marks out of ${inView} in view — the named classes `
        + '(air base, naval base, firing range) come before the catch-all, '
        + 'and a named site before an unnamed one.',
      sample: [400, 912],
    },
    fromPack: {
      fr: (count, retrievedAt) => `${count} viennent du pack France embarqué, relevé OSM du `
        + `${retrievedAt} : un point par site, sans emprise. Zoomez pour `
        + 'interroger OpenStreetMap en direct et récupérer les contours.',
      en: (count, retrievedAt) => `${count} come from the bundled France pack, an OSM survey of `
        + `${retrievedAt}: one point per site, with no outline. Zoom in to `
        + 'query OpenStreetMap live and get the footprints.',
      note: 'The date is the pack’s own stamp, printed as stored.',
      sample: [120, '2026-08-14'],
    },
  },

  /** The row's one line of status. */
  status: {
    loading: {
      fr: 'lecture du contexte des sites cartographiés',
      en: 'loading mapped installation context',
    },
    zoomIn: {
      fr: 'Zoome pour charger le contexte des sites cartographiés',
      en: 'Zoom in to load mapped installation context',
    },
    widePack: {
      fr: 'vue large — pack France embarqué',
      en: 'wide view — bundled France pack',
    },
  },

  /** What a mark says when it has no name of its own. */
  unnamed: { fr: 'SITE CARTOGRAPHIÉ', en: 'MAPPED INSTALLATION' },
  /** How the entity registry names this layer to the context card. */
  layerName: { fr: 'Sites militaires cartographiés', en: 'Mapped Military Installations' },
  /** No source in the record at all — not the same as an unknown operator. */
  unknownSource: { fr: 'Source cartographique inconnue', en: 'Unknown mapped source' },
});
