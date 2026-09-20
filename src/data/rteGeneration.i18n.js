/**
 * Strings of src/data/rteGeneration.js — the Generating units layer: the card
 * a clicked station opens, the ring-and-disc key, and the row's own line.
 *
 * The thirteen generation classes are named next door, in
 * `rteGenerationFeed.i18n.js`, because the table that holds them lives there.
 * Station names, communes and départements are data.
 *
 * TWO CLAIMS THIS CATALOG MUST NOT SOFTEN, both of them the reason the card
 * was rewritten in the first place:
 *
 *   - an unmeasured station is NOT a station at zero. « RTE n’a publié aucune
 *     mesure » / “RTE published no reading” — never “no output”.
 *   - a negative value is the machine TAKING power from the grid, which a
 *     stopped reactor does with its own pumps. The English keeps the shouted
 *     verb the French shouts.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** Where the mark stands, and how sure we are of it. Printed on every card. */
  placement: {
    'edf-published': {
      fr: 'posée sur la coordonnée qu’EDF publie pour cette centrale',
      en: 'placed on the coordinate EDF publishes for this plant',
    },
    'osm-plant': {
      fr: 'posée sur l’emprise de la centrale cartographiée dans OpenStreetMap',
      en: 'placed on the plant’s footprint as mapped in OpenStreetMap',
    },
    'rte-switchyard': {
      fr: 'posée sur le poste électrique que son entrée au registre nomme — le poste, pas la salle des machines',
      en: 'placed on the substation its register entry names — the substation, not the turbine hall',
    },
    'commune-centre': {
      fr: 'posée au centre de sa commune : aucune source ouverte ne publie où elle est',
      en: 'placed at the center of its municipality: no open source publishes where it is',
    },
  },
  /** How far the mark sits from the municipality's center, when that is the anchor. */
  placementDistance: {
    fr: (km) => ` (à ${km} km du centre de la commune)`,
    en: (km) => ` (${km} km from the center of the municipality)`,
    sample: ['3.4'],
  },

  /** How long ago RTE published the step on screen. */
  age: {
    ahead: { fr: 'publié pour l’heure à venir', en: 'published for the hour ahead' },
    minutes: {
      fr: (n) => `il y a ${n} min`,
      en: (n) => `${n} min ago`,
      sample: ['25'],
    },
    hours: {
      fr: (n) => `il y a ${n} h`,
      en: (n) => `${n} h ago`,
      sample: ['3'],
    },
    days: {
      fr: (n) => `il y a ${n} j`,
      en: (n) => `${n} d ago`,
      sample: ['2'],
    },
  },

  /**
   * A load factor, sign kept. French holds a NO-BREAK space before its `%`
   * (U+00A0, not the narrow one) because this string is measured and wrapped
   * by the overlay's own text layout; English has no space at all.
   */
  loadPercent: {
    fr: (percent) => `${percent}\u00a0%`,
    en: (percent) => `${percent}%`,
    sample: ['69'],
  },

  /** The card of a selected station, line by line. */
  card: {
    fallbackName: { fr: 'Site de production', en: 'Generating site' },
    load: {
      fr: (percent) => ` · ${percent} de son maximum`,
      en: (percent) => ` · ${percent} of its maximum`,
      sample: ['69%'],
    },
    installedOf: {
      fr: (power) => ` sur ${power} installés`,
      en: (power) => ` of ${power} installed`,
      sample: ['5,460 MW'],
    },
    pumping: {
      fr: '↓ elle PREND du courant au réseau au lieu d’en fournir — ses propres pompes et instruments, ou un stockage en train de se remplir',
      en: '↓ it is TAKING power from the grid instead of supplying it — its own pumps and instruments, or storage filling up',
    },
    measuredAt: {
      fr: (clock, age) => `🕐 mesure de l’heure de ${clock}${age}`,
      en: (clock, age) => `🕐 reading for the hour of ${clock}${age}`,
      sample: ['10:00', ', published 25 min ago'],
    },
    published: {
      fr: (age) => `, publiée ${age}`,
      en: (age) => `, published ${age}`,
      sample: ['25 min ago'],
    },
    reporting: {
      fr: (reporting, total) => `▸ ${reporting} de ses ${total} groupes ont transmis une mesure — un groupe est une turbine ou un réacteur`,
      en: (reporting, total) => `▸ ${reporting} of its ${total} generating units reported a reading — a unit is one turbine or one reactor`,
      sample: [3, 4],
    },
    matchedByName: {
      fr: (count) => `↳ ${count} d’entre eux rattachés par le NOM de la centrale : RTE la publie groupe par groupe, le registre ne la connaît qu’en bloc`,
      en: (count) => `↳ ${count} of them attached by the plant’s NAME: RTE publishes it unit by unit, the register only knows it as a whole`,
      sample: [2],
    },
    installedOnly: {
      fr: (power) => `${power} installés, son maximum`,
      en: (power) => `${power} installed, its maximum`,
      sample: ['1,080 MW'],
    },
    installedUnpublished: {
      fr: 'puissance installée non publiée',
      en: 'installed capacity not published',
    },
    noReading: {
      fr: 'RTE n’a publié aucune mesure pour cette centrale — ce n’est PAS « elle ne produit rien »',
      en: 'RTE published no reading for this plant — this is NOT “it is generating nothing”',
    },
    unitsHeader: {
      fr: (count) => `── ${count} groupe${count > 1 ? 's' : ''} ──`,
      en: (count) => `── ${count} generating ${plural(count, 'unit', 'units', { locale: 'en' })} ──`,
      sample: [4],
    },
    moreUnits: {
      fr: (count) => `… et ${count} de plus`,
      en: (count) => `… and ${count} more`,
      sample: [2],
    },
  },

  /** One row per unit, under the header. */
  unit: {
    fallbackName: { fr: 'groupe', en: 'unit' },
    noReading: { fr: 'pas de mesure', en: 'no reading' },
    registry: {
      fr: (power) => ` (registre : ${power} MW)`,
      en: (power) => ` (register: ${power} MW)`,
      note: 'RTE and the ODRÉ register disagree about this machine’s nameplate.',
      sample: ['226'],
    },
  },

  /** The label riding beside a station on the globe. */
  ambient: {
    installed: {
      fr: (power) => `${power} installés`,
      en: (power) => `${power} installed`,
      sample: ['1,080 MW'],
    },
  },

  /** The key: the grammar first, then one row per generation class. */
  legend: {
    ringAndDisc: {
      fr: 'Anneau = puissance installée · disque = production',
      en: 'Ring = installed capacity · disc = output',
    },
    ringOnly: {
      fr: 'Anneau = puissance installée',
      en: 'Ring = installed capacity',
    },
    grammar: {
      fr: 'Un anneau pâle et vide : RTE n’a rien publié pour cette centrale. Un anneau net et '
        + 'vide : elle a été mesurée à zéro, elle est à l’arrêt. Un disque magenta : elle PREND '
        + 'du courant au réseau — un réacteur arrêté fait encore tourner ses pompes, et pèse '
        + 'une cinquantaine de MW de consommation.',
      en: 'A pale empty ring: RTE published nothing for this plant. A crisp empty ring: it was '
        + 'measured at zero, it is stopped. A magenta disc: it is TAKING power from the grid — '
        + 'a stopped reactor still runs its pumps, and that is worth some fifty MW of '
        + 'consumption.',
    },
    keyless: {
      fr: 'Aucune clé RTE, donc aucune production dessinée. Renseignez RTE_CLIENT_ID et '
        + 'RTE_CLIENT_SECRET depuis un compte gratuit data.rte-france.com et les anneaux se '
        + 'remplissent.',
      en: 'No RTE credential, so no output is drawn. Set RTE_CLIENT_ID and RTE_CLIENT_SECRET '
        + 'from a free data.rte-france.com account and the rings fill in.',
    },
    measured: {
      fr: (output, installed) => `${output} produits sur ${installed} installés — `,
      en: (output, installed) => `${output} generated of ${installed} installed — `,
      sample: ['7,730 MW', '10.8 GW'],
    },
    installedOnly: {
      fr: (installed) => `${installed} installés, aucune production publiée — `,
      en: (installed) => `${installed} installed, no output published — `,
      sample: ['4.2 GW'],
    },
  },

  /** The row's own line, under the layer name. */
  row: {
    loadingRegistry: { fr: 'chargement du registre des groupes…', en: 'loading the unit register…' },
    refreshing: { fr: 'actualisation de la production…', en: 'refreshing output…' },
    unavailable: { fr: 'indisponible', en: 'unavailable' },
    plants: {
      fr: (count) => `${count} centrales`,
      en: (count) => `${count} plants`,
      sample: [108],
    },
    deferred: {
      fr: (count) => `${count} déjà dessinées par Centrales EDF`,
      en: (count) => `${count} already drawn by Power plants`,
      note: 'Names the sibling layer as the panel names it.',
      sample: [69],
    },
    units: {
      fr: (count, power) => `${count} groupes · ${power}`,
      en: (count, power) => `${count} units · ${power}`,
      sample: [212, '48.3 GW'],
    },
    keyless: {
      fr: 'sans clé RTE — puissance installée seulement',
      en: 'no RTE credential — installed capacity only',
    },
    unplaced: {
      fr: (count) => `${count} groupes non placés`,
      en: (count) => `${count} units not placed`,
      sample: [14],
    },
    error: { fr: 'production RTE indisponible', en: 'RTE output unavailable' },
  },
});
