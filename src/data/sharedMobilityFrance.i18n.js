/**
 * Strings of `src/data/sharedMobilityFrance.js` — shared vehicles.
 * See docs/i18n/CONVENTIONS.md.
 *
 * ── THE KEY ─────────────────────────────────────────────────────────────────
 *
 * « Mobilités partagées » since 2026-09-21: a segmented control by family
 * (Tous · Vélos · Trottinettes · Scooters · Voitures), then the operators by
 * name. The words shared with the Vélib' block — « Fournisseurs », the dock
 * fill, « Tout afficher » — live in `mobilityOperators.i18n.js`, so the two
 * blocks cannot drift apart. Families follow docs/GLOSSARY.md: a trottinette
 * is an e-scooter, a scooter is a moped.
 *
 * Operator names, system names and station names are data.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  filters: {
    all: { fr: 'Tous', en: 'All', note: 'The segment that clears the family filter.' },
    velo: { fr: 'Vélos', en: 'Bikes', note: 'Pedal bikes and e-bikes.' },
    trottinette: { fr: 'Trottinettes', en: 'E-scooters' },
    scooter: { fr: 'Scooters', en: 'Mopeds', note: 'GBFS moped: the seated one. See the glossary.' },
    voiture: { fr: 'Voitures', en: 'Cars' },
  },

  card: {
    noInventory: {
      fr: 'Inventaire non publié',
      en: 'Inventory not published',
      note: '"we do not know" and "there is nothing" are different facts; only the second is worth walking to.',
    },
    available: {
      fr: (count, noun) => `${count} ${noun} disponible${count > 1 ? 's' : ''}`,
      en: (count, noun) => `${count} ${noun} available`,
      note: '`count` is already formatted; `noun` is the kind, lower-cased.',
      sample: ['7', 'bikes'],
    },
    ofPlaces: {
      fr: (count) => ` sur ${count} place${count > 1 ? 's' : ''}`,
      en: (count) => ` of ${count} ${plural(count, 'space', 'spaces', { locale: 'en' })}`,
      sample: ['19'],
    },
    freeDocks: {
      fr: (count, plural) => `${count} borne${plural} libre${plural}`,
      en: (count, plural) => `${count} free dock${plural}`,
      note: '`plural` is the agreement suffix the two languages place differently.',
      sample: ['5', 's'],
    },
    freeSpaces: {
      fr: (count, plural) => `${count} place${plural} libre${plural}`,
      en: (count, plural) => `${count} free space${plural}`,
      note: 'A painted bay has no dock to lock into: what is free is ground, not a stand.',
      sample: ['5', 's'],
    },
    ofWhich: {
      fr: (split) => `dont ${split}`,
      en: (split) => `of which ${split}`,
      sample: ['5 pedal bikes and 2 e-bikes'],
    },
    mechanical: {
      fr: (count) => `mécanique${count > 1 ? 's' : ''}`,
      en: (count) => `pedal ${plural(count, 'bike', 'bikes', { locale: 'en' })}`,
      note: 'Inside a bikes-only dock the split IS the power source.',
      sample: [5],
    },
    rentingSuspended: { fr: '⚠️ Location suspendue', en: '⚠️ Rentals suspended' },
    vehicleWithOperator: {
      fr: (kind, operator) => `${kind} ${operator}`,
      en: (kind, operator) => `${kind} ${operator}`,
      note: 'The operator is half of what the glyph says; the card is where the color gets a name.',
      sample: ['E-scooter', 'Dott'],
    },
    range: {
      fr: (km) => `🔋 ${km} km d’autonomie`,
      en: (km) => `🔋 ${km} km of range`,
      sample: ['12.4'],
    },
    fixSeconds: {
      fr: (seconds) => `⏱ position il y a ${seconds} s`,
      en: (seconds) => `⏱ position ${seconds} s ago`,
      sample: [42],
    },
    fixMinutes: {
      fr: (minutes) => `⏱ position il y a ${minutes} min`,
      en: (minutes) => `⏱ position ${minutes} min ago`,
      sample: ['7'],
    },
  },

  legend: {
    segmentsLabel: { fr: 'Type de véhicule', en: 'Vehicle type', note: 'Accessible name of the segmented control.' },
    familyTitle: {
      fr: (count) => `${count} à l’écran`,
      en: (count) => `${count} on screen`,
      sample: ['12'],
    },
    moreOperators: {
      fr: (count) => `+${count} fournisseurs`,
      en: (count) => `+${count} operators`,
      sample: [3],
    },
    alsoInView: {
      fr: (operators) => `Également dans la vue : ${operators}.`,
      en: (operators) => `Also in view: ${operators}.`,
      sample: ['Citiz, Lime'],
    },
  },

  row: {
    zoomIn: {
      fr: 'Zoome pour charger les véhicules partagés',
      en: 'Zoom in to load shared vehicles',
    },
    refreshing: { fr: 'actualisation des opérateurs…', en: 'refreshing operators…' },
    searching: { fr: 'recherche des opérateurs…', en: 'looking for operators…' },
    filteredOut: {
      fr: 'rien ne correspond au filtre dans cette vue',
      en: 'nothing in this view matches the filter',
    },
    nothingReporting: {
      fr: 'aucun véhicule ne se signale ici',
      en: 'no vehicle is reporting here',
    },
    noSystem: {
      fr: 'aucun système du PAN ne couvre cette vue',
      en: 'no national access point (PAN) system covers this view',
    },
    operators: {
      fr: (count, one) => `${count} opérateur${one ? '' : 's'}`,
      en: (count, one) => `${count} operator${one ? '' : 's'}`,
      sample: ['6', false],
    },
    familyOnly: {
      fr: (family) => `filtre : ${family}`,
      en: (family) => `filter: ${family}`,
      sample: ['Scooters'],
    },
    operatorOnly: {
      fr: (operator) => `fournisseur : ${operator}`,
      en: (operator) => `operator: ${operator}`,
      sample: ['Lime'],
    },
    capped: { fr: 'plafonné', en: 'capped' },
    mergedStations: {
      fr: (count, plural) => `${count} station${plural} mutualisée${plural} fusionnée${plural}`,
      en: (count, plural) => `${count} shared dock${plural} merged`,
      sample: ['4', 's'],
    },
    hiddenBays: {
      fr: (count, plural) => `${count} aire${plural} vide${plural} masquée${plural}`,
      en: (count, plural) => `${count} empty bay${plural} hidden`,
      sample: ['3', 's'],
    },
    staleFeeds: {
      fr: (count, plural) => `${count} flux périmé${plural}`,
      en: (count, plural) => `${count} stale feed${plural}`,
      sample: ['2', 's'],
    },
  },

  fallbackVehicle: { fr: 'Véhicule', en: 'Vehicle' },
});
