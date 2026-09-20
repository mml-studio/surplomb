/**
 * Strings of src/data/layerCoverage.js — a layer's territory as the reader
 * meets it: the long form under a dimmed control, the notice that says "no data
 * in this view", and the one first-activation card the table carries.
 *
 * The SHORT form (`chip`: `PARIS`, `IDF`, `FR`, `PARIS · LYON`) is not here.
 * Those are place names and country codes, identical in both languages, and
 * they are written where the boxes are, next to the measurement they belong to.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The long form of a territory: tooltips, notices, the briefing card. */
  where: {
    'comptages-fr': {
      fr: 'Paris intra-muros',
      en: 'Paris proper',
      note: '“intra-muros”: inside the périphérique, which is the layer’s real extent.',
    },
    'fraicheur-fr': { fr: 'Paris et sa proche couronne', en: 'Paris and its inner suburbs' },
    'idfm-network': { fr: 'Île-de-France', en: 'Île-de-France', keep: ['Île-de-France'] },
    'velo-pulse-fr': { fr: 'Paris et Lyon', en: 'Paris and Lyon' },
    'road-status-fr': {
      fr: 'réseau routier national non concédé',
      en: 'State-run national road network',
      note: 'The RRN minus the conceded motorways, which no DIR publishes.',
    },
  },

  /** The first-activation card, for the one layer whose subject surprises. */
  briefs: {
    'comptages-fr': {
      title: { fr: 'Comptages routiers', en: 'Traffic counts' },
      lines: {
        fr: [
          'Des capteurs installés dans les rues de Paris comptent les véhicules qui passent, rue par rue.',
          'Ce n’est pas de la congestion : c’est un nombre de véhicules par heure. Les sept boutons de créneau lisent la même semaine à des heures différentes.',
          'Semaine archivée, pas du direct — et Paris intra-muros uniquement : ailleurs, cette couche ne dessine rien.',
        ],
        en: [
          'Sensors in the streets of Paris count the vehicles going past, street by street.',
          'This is not congestion: it is a number of vehicles per hour. The seven slot buttons read the same week at different hours.',
          'An archived week, not live — and Paris proper only: anywhere else, this layer draws nothing.',
        ],
        note: 'Three lines, each answering a question a reader actually has. A fourth is a card nobody reads.',
      },
    },
  },

  /** What a control says when the camera is somewhere the layer has nothing. */
  notice: {
    out: {
      fr: (where) => `Aucune donnée dans cette vue — couvre ${where}.`,
      en: (where) => `No data in this view — covers ${where}.`,
      sample: ['Paris proper'],
    },
    outClickable: {
      fr: (where) => `Aucune donnée dans cette vue — couvre ${where}. Cliquer pour y aller.`,
      en: (where) => `No data in this view — covers ${where}. Click to go there.`,
      sample: ['Paris proper'],
    },
    dark: {
      fr: (area, operator) => `${area} : ${operator} ne publie rien ici — le reste du réseau reste dessiné.`,
      en: (area, operator) => `${area}: ${operator} publishes nothing here — the rest of the network is still drawn.`,
      note: 'Covered, and empty, with the name of whoever does not publish. Both arrive as data.',
      sample: ['Lille', 'DIR Nord'],
    },
    darkUnnamed: {
      fr: 'Zone non publiée — le reste du réseau reste dessiné.',
      en: 'Unpublished area — the rest of the network is still drawn.',
    },
  },
});
