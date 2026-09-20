/**
 * Strings of src/mapStackController.js — the basemap tray.
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT. Six of the eight stacks are named after
 * their provider (`Google 3D`, `Bing Aerial`, `OSM`), and a brand does not
 * change with the reader's language. The three that describe their CONTENT do:
 * « Plan Google » is a roadmap, « Relief Google » is terrain, and « Plan IGN »
 * is IGN's own cartography — the glossary renders that last one *IGN map
 * (Plan IGN)*, and the chip keeps the short half because it is 60 px wide.
 *
 * The coverage notes and the unavailability reasons are INHERITED ENGLISH and
 * stay identical in both languages for now, like the HUD's readouts: they are
 * operator diagnostics ("Google Maps API key required"), the French page has
 * always shown them in English, and their French is a product decision rather
 * than a translation. They are catalogued so that decision is one column.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  /** The name on a chip, and the short form the phone tray uses. */
  stacks: {
    photoreal: {
      label: { fr: 'Google 3D', en: 'Google 3D' },
      shortLabel: { fr: '3D', en: '3D' },
    },
    'google-roadmap': {
      label: { fr: 'Plan Google', en: 'Google map' },
      shortLabel: { fr: 'Plan G', en: 'Map G' },
    },
    'google-terrain': {
      label: { fr: 'Relief Google', en: 'Google terrain' },
      shortLabel: { fr: 'Relief G', en: 'Terrain G' },
    },
    'bing-aerial': {
      label: { fr: 'Bing Aerial', en: 'Bing Aerial' },
      shortLabel: { fr: 'Aerial', en: 'Aerial' },
    },
    'bing-labels': {
      label: { fr: 'Bing Labels', en: 'Bing Labels' },
      shortLabel: { fr: 'Labels', en: 'Labels' },
    },
    osm: {
      label: { fr: 'OSM', en: 'OSM' },
      shortLabel: { fr: 'OSM', en: 'OSM' },
    },
    'ign-ortho': {
      label: { fr: 'Satellite', en: 'Satellite' },
      shortLabel: { fr: 'Sat', en: 'Sat' },
      coverageNote: {
        fr: 'IGN 20 cm over France, world satellite beyond',
        en: 'IGN 20 cm over France, world satellite beyond',
        note: 'Inherited English on both pages — see the file header.',
      },
    },
    'ign-plan': {
      label: { fr: 'Plan IGN', en: 'IGN map' },
      shortLabel: { fr: 'Plan', en: 'Map' },
      coverageNote: {
        fr: 'metropolitan France only',
        en: 'metropolitan France only',
        note: 'Inherited English on both pages — see the file header.',
      },
    },
  },

  /** Why a stack cannot be picked. Operator diagnostics, English in both. */
  unavailable: {
    ionRequired: {
      fr: 'Cesium ion token required',
      en: 'Cesium ion token required',
    },
    photorealKeys: {
      fr: 'Google Maps API key or Cesium ion token required for Google 3D',
      en: 'Google Maps API key or Cesium ion token required for Google 3D',
    },
    photorealFailed: {
      fr: 'Google 3D Tiles failed to load',
      en: 'Google 3D Tiles failed to load',
    },
    photorealFailedBecause: {
      fr: (reason) => `Google 3D Tiles failed to load: ${reason}`,
      en: (reason) => `Google 3D Tiles failed to load: ${reason}`,
      sample: ['HTTP 403'],
    },
    googleKeyRequired: {
      fr: (stack) => `Google Maps API key required for ${stack}`,
      en: (stack) => `Google Maps API key required for ${stack}`,
      sample: ['Google map'],
    },
    stackUnavailable: {
      fr: (stack) => `${stack} is unavailable`,
      en: (stack) => `${stack} is unavailable`,
      sample: ['Bing Aerial'],
    },
    thisStack: {
      fr: 'This map stack',
      en: 'This map stack',
      note: 'Subject of `stackUnavailable` when the stack has no name to give.',
    },
  },

  /** The notice a boot that fell back to another basemap leaves on the chip. */
  bootFallback: {
    fr: (reason, stack) => `Google 3D Tiles failed to load: ${reason} — showing ${stack}`,
    en: (reason, stack) => `Google 3D Tiles failed to load: ${reason} — showing ${stack}`,
    sample: ['HTTP 403', 'Satellite'],
  },
});
