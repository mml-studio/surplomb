/**
 * Strings of `src/data/sharedMobilityFrance.js` — shared vehicles.
 * See docs/i18n/CONVENTIONS.md.
 *
 * ── TWO CHANNELS, NAMED ─────────────────────────────────────────────────────
 *
 * The map says two things at once: the SHAPE is what an object is, the COLOR
 * (and, up close, the letter on the plate) is who runs it. The key prints both
 * channel names over its own entries, and closes with the sentence that stops
 * a reader summing two lists of the same population: it is one set, counted
 * twice.
 *
 * ── WHAT THE CHIPS PROMISE ──────────────────────────────────────────────────
 *
 * The two filters are a PARTITION: every object is on exactly one side, an
 * e-bike is a bike, and a dock that publishes no inventory counts as a bike
 * dock because that is GBFS's own default. The tooltips say all three, and
 * the English says them too — a filter that hides half the fleet has to state
 * what it costs.
 *
 * Operator names, system names and station names are data.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  channels: {
    shape: { fr: 'forme = quoi', en: 'shape = what' },
    operator: {
      fr: 'couleur + lettre = qui',
      en: 'color + letter = who',
      note: 'The plate carries a hue and, close up, the operator\'s initial.',
    },
  },

  filters: {
    velo: { fr: 'Vélos', en: 'Bikes' },
    autres: { fr: 'Le reste', en: 'Everything else' },
  },
  chipTitles: {
    share: {
      fr: (kept, total) => ` — ${kept} objet${kept > 1 ? 's' : ''} sur ${total}`,
      en: (kept, total) => ` — ${kept} ${plural(kept, 'object', 'objects', { locale: 'en' })} of ${total}`,
      sample: ['84', '168'],
    },
    active: {
      fr: (label, share) => `${label} seuls${share}. Appuyer à nouveau pour tout revoir.`,
      en: (label, share) => `${label} only${share}. Press again to see everything.`,
      sample: ['Bikes', ' — 84 objects of 168'],
    },
    bikes: {
      fr: (share) => `Ne garder que les vélos${share}. Vélo mécanique et VAE, plus les stations`
        + ' qui en tiennent ; une station qui ne publie pas son inventaire est comptée ici,'
        + ' comme le veut le défaut GBFS.',
      en: (share) => `Keep only the bikes${share}. Pedal bikes and e-bikes, plus the docks`
        + ' that hold them; a dock that publishes no inventory is counted here,'
        + ' as GBFS’s own default has it.',
      sample: [' — 84 objects of 168'],
    },
    rest: {
      fr: (share) => `Ne garder que le reste${share}. Trottinettes, scooters, voitures partagées`
        + ' et formes non nommées, plus les stations sans vélo.',
      en: (share) => `Keep only the rest${share}. E-scooters, mopeds, shared cars`
        + ' and unnamed form factors, plus the docks with no bike.',
      sample: [' — 84 objects of 168'],
    },
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
    stations: { fr: 'Stations', en: 'Docks' },
    stationsBlurb: {
      fr: 'Emplacements de l’exploitant — remplissage selon la disponibilité, contour selon l’exploitant. Les places municipales que tous republient sont fusionnées.',
      en: 'The operator’s own sites — fill by availability, outline by operator. Municipal stands that every system republishes are merged.',
    },
    vehiclesBlurb: {
      fr: 'En stationnement et disponible — GBFS ne publie jamais un véhicule pendant une location.',
      en: 'Parked and available — GBFS never publishes a vehicle during a rental.',
    },
    derivedHue: {
      fr: (operator) => `${operator} — teinte dérivée du titre publié ; aucun flux français ne publie sa couleur de marque.`,
      en: (operator) => `${operator} — hue derived from the published title; no French feed publishes its brand color.`,
      sample: ['Pony'],
    },
    moreOperators: {
      fr: (count) => `+${count} exploitants`,
      en: (count) => `+${count} operators`,
      sample: [3],
    },
    alsoInView: {
      fr: (operators) => `Également dans la vue : ${operators}.`,
      en: (operators) => `Also in view: ${operators}.`,
      sample: ['Citiz, Lime'],
    },
    note: {
      fr: 'Le même ensemble, compté deux fois.',
      en: 'The same set, counted twice.',
      note: 'The two lists are one population read through two channels; they must not be summed.',
    },
  },

  row: {
    zoomIn: {
      fr: 'Zoome pour charger les véhicules partagés',
      en: 'Zoom in to load shared vehicles',
    },
    refreshing: { fr: 'actualisation des opérateurs…', en: 'refreshing operators…' },
    searching: { fr: 'recherche des opérateurs…', en: 'looking for operators…' },
    noBikes: {
      fr: 'aucun vélo dans cette vue — le reste est filtré',
      en: 'no bike in this view — the rest is filtered out',
    },
    onlyBikes: {
      fr: 'rien que des vélos dans cette vue — ils sont filtrés',
      en: 'nothing but bikes in this view — they are filtered out',
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
    bikesOnly: { fr: 'vélos seuls', en: 'bikes only' },
    bikesHidden: { fr: 'vélos masqués', en: 'bikes hidden' },
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
