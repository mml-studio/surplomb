/**
 * Strings of src/data/frHydroPlants.js — the Hydro plants layer: the card of
 * a placed plant, of a world station and of a commune roll-up, the placement
 * audit trail under each of them, the power-floor chips and the key.
 *
 * The five technologies are named next door, in `frHydroFeed.i18n.js`, with
 * the table that holds them. Plant names, communes, départements, rivers,
 * operators, the register's own `regime` string and IGN's `ignKind` are data.
 *
 * THE CLAIMS THIS CARD IS BUILT AROUND, which the English has to keep:
 *
 *   - an unpublished figure is not a zero: « énergie injectée non publiée —
 *     ce n’est pas une centrale à l’arrêt ».
 *   - the card names WHICH OBJECT its coordinate is (the powerhouse, the
 *     substation, the building footprint), because pointing at the wrong one
 *     is the worst bug this layer has had.
 *   - a commune ring is not a plant, and says so in its first line.
 */
import { defineMessages } from '../i18n/messages.js';
import { monthName } from '../i18n/format.js';

export default defineMessages({
  /** The bucket the OpenStreetMap half of the layer falls into. */
  worldBucket: { fr: 'Hors registre français', en: 'Outside the French register' },

  /** The name a plant gets when ODRÉ withholds it. */
  unnamed: {
    fr: (where) => `Centrale hydraulique${where}`,
    en: (where) => `Hydro plant${where}`,
    sample: [' in Laruns'],
  },
  unnamedIn: {
    fr: (commune) => ` à ${commune}`,
    en: (commune) => ` in ${commune}`,
    sample: ['Laruns'],
  },

  /** The power floors on the row. `TOUT` is the whole register. */
  floors: {
    all: { fr: 'TOUT', en: 'ALL' },
    allTitle: {
      fr: (markers) => `Tout le registre — ${markers} marqueurs`,
      en: (markers) => `The whole register — ${markers} markers`,
      sample: ['3,127'],
    },
    hideBelow: {
      fr: (power) => `Masquer les installations sous ${power}`,
      en: (power) => `Hide installations below ${power}`,
      sample: ['1 MW'],
    },
  },

  /** What identified this plant — how much evidence its dot rests on. */
  match: {
    name: { fr: 'appariée sur le nom', en: 'matched on the name' },
    'name-partial': {
      fr: 'appariée sur une partie du nom seulement — appariement faible',
      en: 'matched on part of the name only — weak match',
    },
    power: {
      fr: 'appariée sur la puissance, seule candidate de la commune',
      en: 'matched on installed power, the only candidate in the municipality',
    },
    sole: {
      fr: 'seule centrale cartographiée de la commune, seule ligne au registre',
      en: 'the only plant mapped in the municipality, the only row in the register',
    },
    postesource: {
      fr: 'code de poste source publié des deux côtés',
      en: 'primary-substation code published on both sides',
    },
    toponyme: { fr: 'appariée sur le toponyme du plan IGN', en: 'matched on the IGN map’s place name' },
    'insee-sole': {
      fr: 'seule centrale au plan IGN dans la commune, seule ligne au registre',
      en: 'the only plant on the IGN map in the municipality, the only row in the register',
    },
  },

  /** WHICH OBJECT the coordinate actually is. */
  geometry: {
    'ign-footprint': { fr: 'emprise du bâtiment levée par l’IGN', en: 'building footprint surveyed by IGN' },
    'published-point': { fr: "point publié par l'exploitant", en: 'point published by the operator' },
    outline: { fr: 'emprise cartographiée de la centrale', en: 'the plant’s mapped footprint' },
    generators: {
      fr: 'groupes cartographiés à l’intérieur de l’emprise — la salle des machines',
      en: 'generating units mapped inside the footprint — the powerhouse',
    },
    switchyard: {
      fr: 'le POSTE de raccordement, pas la salle des machines',
      en: 'the connecting SUBSTATION, not the powerhouse',
    },
  },

  /** The card of a plant the register places. */
  card: {
    installed: {
      fr: (power) => `⚡ ${power} installés`,
      en: (power) => `⚡ ${power} installed`,
      sample: ['74.0 MW'],
    },
    injected: {
      fr: (energy, share) => `↻ ${energy} injectés sur les 12 derniers mois${share}`,
      en: (energy, share) => `↻ ${energy} fed into the grid over the last 12 months${share}`,
      sample: ['180.4 GWh', ' — 29% of what it would produce never stopping'],
    },
    loadShare: {
      fr: (percent) => ` — ${percent} de ce qu’elle produirait sans jamais s’arrêter`,
      en: (percent) => ` — ${percent} of what it would produce never stopping`,
      note: 'The capacity factor, named by what it divides rather than by its unit.',
      sample: ['29%'],
    },
    noEnergy: {
      fr: '↻ énergie injectée non publiée — ce n’est pas une centrale à l’arrêt',
      en: '↻ energy fed into the grid not published — this is not a stopped plant',
    },
    anonymous: {
      fr: '⊘ nom non publié — ODRÉ anonymise les petites installations privées',
      en: '⊘ name not published — ODRÉ anonymizes small private installations',
    },
    technology: {
      fr: (label, blurb) => `◈ ${label}${blurb}`,
      en: (label, blurb) => `◈ ${label}${blurb}`,
      sample: ['Reservoir', ' — water is held for months'],
    },
    technologyBlurb: {
      fr: (blurb) => ` — ${blurb}`,
      en: (blurb) => ` — ${blurb}`,
      sample: ['water is held for months'],
    },
    technologyOutside: {
      fr: (published) => `◈ technologie publiée : « ${published} » — hors vocabulaire hydraulique du registre`,
      en: (published) => `◈ technology published as “${published}” — outside the register’s hydro vocabulary`,
      note: 'The publisher’s word, shown and flagged rather than corrected.',
      keep: ['Photovoltaïque'],
      sample: ['Photovoltaïque'],
    },
    head: {
      fr: (metres) => `↧ ${metres} m de dénivelé entre la prise d’eau et les turbines`,
      en: (metres) => `↧ ${metres} m of head between the intake and the turbines`,
      sample: ['418'],
    },
    groups: {
      fr: (count) => `▸ ${count} groupes : ${count} turbines et leurs alternateurs`,
      en: (count) => `▸ ${count} generating units: ${count} turbines and their alternators`,
      sample: [3],
    },
    oneGroup: {
      fr: '▸ 1 groupe : une turbine et son alternateur',
      en: '▸ 1 generating unit: one turbine and its alternator',
    },
    aggregated: {
      fr: (count) => `▸ ligne agrégée : ${count} installations`,
      en: (count) => `▸ aggregated row: ${count} installations`,
      sample: [4],
    },
    communeContradicted: {
      fr: (km) => `  ⚠ selon le registre — et son propre poste source est à ${km} km de là`,
      en: (km) => `  ⚠ according to the register — and its own primary substation is ${km} km away`,
      note: 'The register’s two fields disagree; both claims are shown.',
      sample: ['612'],
    },
    connectedAt: {
      fr: (voltage) => `raccordée en ${voltage}`,
      en: (voltage) => `connected at ${voltage}`,
      sample: ['HTA'],
    },
    atSubstation: {
      fr: (poste) => `au poste électrique ${poste}`,
      en: (poste) => `at the ${poste} substation`,
      sample: ['BEAUMONT'],
    },
    commissioned: {
      fr: (day) => `🕐 en service depuis le ${day}`,
      en: (day) => `🕐 in service since ${day}`,
      sample: ['Jun 30, 1966'],
    },
    regime: {
      fr: (regime) => `⚠ régime : ${regime}`,
      en: (regime) => `⚠ status: ${regime}`,
      note: 'The register’s own word (« En service », « Arrêt provisoire ») stays as published.',
      keep: ['Arrêt provisoire'],
      sample: ['Arrêt provisoire'],
    },
  },

  /**
   * An ISO day as each language writes it: `30/06/1966`, `Jun 30, 1966`.
   * The parts arrive zero-padded, as the register publishes them.
   */
  day: {
    fr: (year, month, day) => `${day}/${month}/${year}`,
    en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
    sample: ['1966', '06', '30'],
  },

  /** The card of a station OpenStreetMap maps outside France. */
  world: {
    fallbackName: { fr: 'Centrale hydroélectrique', en: 'Hydroelectric plant' },
    noPower: {
      fr: '⚡ puissance non publiée par OpenStreetMap',
      en: '⚡ installed power not published by OpenStreetMap',
    },
    commissioned: {
      fr: (year) => `mise en service ${year}`,
      en: (year) => `commissioned ${year}`,
      sample: [1966],
    },
    sample: {
      fr: '🌍 OpenStreetMap, hors registre français — un échantillon de 592 centrales, pas un inventaire mondial',
      en: '🌍 OpenStreetMap, outside the French register — a sample of 592 plants, not a world inventory',
    },
  },

  /** What stands near this plant, when a sibling layer can answer. */
  neighbour: {
    gauge: {
      fr: (reading, distance, where) => `≋ ${reading} à ${distance} — station ${where}, la plus proche qui mesure un débit`,
      en: (reading, distance, where) => `≋ ${reading} at ${distance} — station ${where}, the nearest one measuring a flow`,
      keep: ['Gave d’Ossau'],
      sample: ['12.4 m³/s', '3.2 km', 'Gave d’Ossau'],
    },
    gaugeWhere: {
      fr: (name, river) => `${name} sur ${river}`,
      en: (name, river) => `${name} on ${river}`,
      keep: ['Gave d’Ossau'],
      sample: ['Laruns', 'the Gave d’Ossau'],
    },
    dam: {
      fr: (what, height, distance) => `▰ ${what}${height} à ${distance} — ouvrage voisin cartographié, aucun registre ne le relie à cette centrale`,
      en: (what, height, distance) => `▰ ${what}${height} at ${distance} — a mapped neighbouring structure; no register ties it to this plant`,
      keep: ['Barrage de Fabrèges'],
      sample: ['Barrage de Fabrèges', ', 61 m high', '1.8 km'],
    },
    damHeight: {
      fr: (metres) => `, ${metres} m de haut`,
      en: (metres) => `, ${metres} m high`,
      sample: ['61'],
    },
    damUnnamed: { fr: 'ouvrage non nommé', en: 'unnamed structure' },
  },

  /** The placement audit trail: where the dot came from, and how sure. */
  placement: {
    line: {
      fr: (source, geometry, distance) => `◎ ${source}${geometry}${distance}`,
      en: (source, geometry, distance) => `◎ ${source}${geometry}${distance}`,
      sample: ['IGN BD TOPO®', ' — building footprint surveyed by IGN', ''],
    },
    geometry: {
      fr: (geometry) => ` — ${geometry}`,
      en: (geometry) => ` — ${geometry}`,
      sample: ['the plant’s mapped footprint'],
    },
    fromCommuneCentre: {
      fr: (km) => ` · à ${km} km du centre de la commune`,
      en: (km) => ` · ${km} km from the center of the municipality`,
      sample: ['6.1'],
    },
    ignKind: {
      fr: (kind, precision) => `   « ${kind} » au plan IGN${precision}`,
      en: (kind, precision) => `   “${kind}” on the IGN map${precision}`,
      note: 'IGN’s own class name is quoted as published, in both languages.',
      keep: ['Centrale hydroélectrique'],
      sample: ['Centrale hydroélectrique', ' ± 5 m'],
    },
    ignUnstated: {
      fr: (precision) => `   ⚠ « Centrale électrique » au plan IGN, nature non précisée${precision}`,
      en: (precision) => `   ⚠ “Centrale électrique” on the IGN map, kind not stated${precision}`,
      note: 'IGN’s own label is quoted as published; the warning is that it says nothing more.',
      keep: ['Centrale électrique'],
      sample: [' ± 5 m'],
    },
    ignPrecision: {
      fr: (metres) => ` ± ${metres} m`,
      en: (metres) => ` ± ${metres} m`,
      sample: ['5'],
    },
    ignRefined: {
      fr: (from, metres) => `   ${from}, position affinée de ${metres} m`,
      en: (from, metres) => `   ${from}, position refined by ${metres} m`,
      sample: ['identified by OpenStreetMap', '38'],
    },
    identifiedBy: {
      fr: (source) => `identifiée par ${source}`,
      en: (source) => `identified by ${source}`,
      sample: ['OpenStreetMap'],
    },
    otherSource: { fr: 'une autre source', en: 'another source' },
    snapped: {
      fr: (km, span) => `   recalée de ${km} km depuis le centre${span}`,
      en: (km, span) => `   moved ${km} km off the center${span}`,
      note: 'The audit trail of the bug this replaced: the bbox centre of a whole scheme was on no object at all.',
      sample: ['2.7', ' of a 4.1 km footprint'],
    },
    snappedSpan: {
      fr: (km) => ` d’une emprise de ${km} km`,
      en: (km) => ` of a ${km} km footprint`,
      sample: ['4.1'],
    },
    switchyardContradiction: {
      fr: '   ⚠ la commune publiée par le registre est incompatible avec son propre poste'
        + ' source — c’est le poste qui a été suivi',
      en: '   ⚠ the municipality the register publishes is incompatible with its own primary'
        + ' substation — the substation is what was followed',
    },
    switchyardOnly: {
      fr: '   ⚠ la centrale elle-même n’est cartographiée nulle part',
      en: '   ⚠ the plant itself is mapped nowhere',
    },
  },

  /** The card of a commune roll-up — which is not a plant, and says so. */
  cluster: {
    fallbackCommune: { fr: 'Commune', en: 'Municipality' },
    title: {
      fr: (commune, count) => `${commune} — ${count} centrale${count > 1 ? 's' : ''} non localisée${count > 1 ? 's' : ''}`,
      en: (commune, count) => `${commune} — ${count} plant${count > 1 ? 's' : ''} with no published location`,
      sample: ['Laruns', 4],
    },
    installed: {
      fr: (power) => `⚡ ${power} installés au total`,
      en: (power) => `⚡ ${power} installed in total`,
      sample: ['12.4 MW'],
    },
    injected: {
      fr: (energy) => `↻ ${energy} injectés sur les 12 derniers mois, toutes ensemble`,
      en: (energy) => `↻ ${energy} fed into the grid over the last 12 months, all together`,
      sample: ['31 GWh'],
    },
    placement: {
      fr: '◎ marqueur posé au CENTRE DE LA COMMUNE — le registre ne publie aucune position',
      en: '◎ marker placed at the CENTER OF THE MUNICIPALITY — the register publishes no position',
    },
    placementTail: {
      fr: '   et aucune source ne place ces installations. Distance typique au bâtiment réel : 3 km.',
      en: '   and no source places these installations. Typical distance to the real building: 3 km.',
    },
    anonymous: {
      fr: (count) => `⊘ ${count} sans nom publié`,
      en: (count) => `⊘ ${count} with no published name`,
      sample: [3],
    },
    moreNames: {
      fr: (count) => `… et ${count} autre${count > 1 ? 's' : ''}`,
      en: (count) => `… and ${count} more`,
      sample: [2],
    },
  },

  /** The key: one row per technology drawn, then the two rows that are not one. */
  legend: {
    blurb: {
      fr: (blurb, power) => `${blurb} — ${power} installés`,
      en: (blurb, power) => `${blurb} — ${power} installed`,
      sample: ['water is held for months and released when demand climbs', '4.10 GW'],
    },
    unpublished: {
      fr: 'Le registre ne publie pas la technologie, ou en publie une qui n’est pas '
        + 'hydraulique — 25 centrales corses sont classées « Photovoltaïque » dans le fichier source',
      en: 'The register publishes no technology, or publishes one that is not hydro — 25 Corsican '
        + 'plants are filed as “Photovoltaïque” in the source file',
      keep: ['Photovoltaïque'],
    },
    world: {
      fr: (power) => `Centrales cartographiées hors de France — ${power} publiés `
        + 'sur les 273 qui déclarent une puissance. Un échantillon OpenStreetMap de 592 '
        + 'ouvrages, pas un inventaire mondial : la France, elle, est complète.',
      en: (power) => `Plants mapped outside France — ${power} published across the 273 that `
        + 'declare a power. An OpenStreetMap sample of 592 structures, not a world inventory: '
        + 'France itself is complete.',
      sample: ['48.2 GW'],
    },
    clusterLabel: {
      fr: 'Anneau = commune, pas centrale',
      en: 'Ring = municipality, not plant',
    },
    clusterBlurb: {
      fr: (count) => `${count} installations qu’aucune source ne localise, regroupées par commune. `
        + 'Le registre ne publie qu’un code INSEE ; le centre de commune est à 3 km de la centrale '
        + 'réelle en médiane, donc elles ne sont pas dessinées comme des centrales.',
      en: (count) => `${count} installations no source can locate, grouped by municipality. The `
        + 'register publishes only an INSEE code; the center of a municipality is a median 3 km '
        + 'from the real plant, so they are not drawn as plants.',
      sample: [418],
    },
  },

  /** Row status when the shipped register cannot be read. */
  errors: {
    malformed: { fr: 'Registre hydro malformé', en: 'Malformed hydro register' },
  },
});
