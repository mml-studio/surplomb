/**
 * Strings of src/data/datasetInference.js — the notes a draft owes its reader,
 * and the refusals it returns instead of a draft.
 *
 * A NOTE IS THE HALF OF THE DRAFT THAT IS NOT A PROMISE. The manifest shown
 * after a paste looks finished; these lines say which parts of it were read
 * from the platform, which were guessed, and what must be checked before
 * anything is drawn. That is the doctrine's A1 — a guess never gets the same
 * sign as a published fact — spelled out in words.
 *
 * The licence LABELS are data: `licenceLabel()` writes one into the manifest,
 * which is persisted in this browser and exported as a `datasets/*.json` file,
 * so the value must not change with the page's language. `LICENCE_DISPLAY`
 * below is how the panel reads one back out.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The four licence labels that are prose rather than a name, keyed by the
 * French value stored in the manifest.
 *
 * Everything else data.gouv.fr publishes is a proper noun — `Licence Ouverte
 * 2.0`, `ODbL`, `CC BY 4.0` — and reads the same in both languages, so it
 * falls through `labelFor` untouched.
 */
export const LICENCE_DISPLAY = defineMessages({
  'licence ouverte (autre)': { fr: 'licence ouverte (autre)', en: 'open license (other)' },
  'domaine public': { fr: 'domaine public', en: 'public domain' },
  'attribution (autre)': { fr: 'attribution (autre)', en: 'attribution (other)' },
  'non précisée': { fr: 'non précisée', en: 'not specified' },
  'à confirmer': { fr: 'à confirmer', en: 'to be confirmed' },
});

export default defineMessages({
  /** What the platform answered with, when it was not JSON. */
  unreadableAnswer: {
    fr: (what) => `${what} : réponse illisible`,
    en: (what) => `${what}: unreadable answer`,
    note: '`what` names the endpoint — data.gouv.fr, Tabular API, Opendatasoft.',
    sample: ['data.gouv.fr'],
  },

  notes: {
    geometryGuessed: {
      fr: (reason) => `Géométrie déduite : ${reason}. Vérifiez-la avant de brancher.`,
      en: (reason) => `Geometry inferred: ${reason}. Check it before plugging in.`,
      note: '`reason` comes from `datasetGeometry.js` and is already in the page’s language.',
      sample: ['columns Longitude / Latitude'],
    },
    noPositionColumn: {
      fr: 'Aucune colonne de position reconnue : choisissez les colonnes longitude / latitude.',
      en: 'No position column recognized: pick the longitude / latitude columns.',
    },
    licence: {
      fr: 'Licence lue sur la plateforme — à confirmer sur la page du jeu avant toute réutilisation.',
      en: 'License read from the platform — confirm it on the dataset’s own page before reusing anything.',
    },
    fileOverCap: {
      fr: (megabytes) => `Fichier de ${megabytes} Mo : au-delà du plafond de lecture directe (24 Mo).`,
      en: (megabytes) => `File of ${megabytes} MB: over the direct-read cap (24 MB).`,
      sample: ['161'],
    },
    notTabularised: {
      fr: 'Ressource non indexée par la Tabular API : le fichier sera lu en entier (plafond 24 Mo).',
      en: 'Resource not indexed by the Tabular API: the whole file will be read (24 MB cap).',
    },
    resourcePicked: {
      fr: (title, count) => `Ressource retenue : « ${title} » parmi ${count}.`,
      en: (title, count) => `Resource picked: “${title}” of ${count}.`,
      note: 'A dataset that publishes several files: which one the box chose, out of how many.',
      sample: ['geodae.csv', '4'],
    },
    noGeoField: {
      fr: 'Aucun champ géographique déclaré par le portail : ce jeu ne se dessine pas.',
      en: 'No geographic field declared by the portal: this dataset does not draw.',
    },
    bareFile: {
      fr: 'Éditeur et licence inconnus pour un fichier nu : complétez-les.',
      en: 'Publisher and license unknown for a bare file: fill them in.',
    },
    bareWfs: {
      fr: 'Éditeur et licence inconnus pour ce WFS : complétez-les.',
      en: 'Publisher and license unknown for this WFS: fill them in.',
    },
    ignWfs: {
      fr: 'La plupart des couches IGN sont sous Licence Ouverte 2.0 — confirmez pour celle-ci.',
      en: 'Most IGN layers are under Licence Ouverte 2.0 — confirm it for this one.',
      keep: ['Licence Ouverte'],
    },
  },

  errors: {
    resourceNotFound: {
      fr: 'ressource data.gouv.fr introuvable',
      en: 'data.gouv.fr resource not found',
    },
    wfsWithoutTypeName: {
      fr: 'ressource WFS sans typeName exploitable',
      en: 'WFS resource with no usable typeName',
    },
    noReadableResource: {
      fr: 'ce jeu ne publie aucune ressource lisible',
      en: 'this dataset publishes no readable resource',
    },
    wfsAddressWithoutTypeNames: {
      fr: 'adresse WFS sans typeNames : indiquez la couche (ex. …?typeNames=BDTOPO_V3:aerodrome)',
      en: 'WFS address with no typeNames: name the layer (e.g. …?typeNames=BDTOPO_V3:aerodrome)',
    },
    unknownAddress: {
      fr: 'adresse non reconnue : page data.gouv.fr, portail Opendatasoft, WFS, GeoJSON ou CSV',
      en: 'address not recognized: a data.gouv.fr page, an Opendatasoft portal, WFS, GeoJSON or CSV',
    },
  },
});
