/**
 * Strings of src/data/datasetPlugPanel.js — the box under the layer list.
 *
 * ONE FIELD, TWO INTENTS, AND THE BUTTON SAYS WHICH. `CHERCHER` / `SEARCH` for
 * words, `ANALYSER` / `ANALYZE` for an address: the label is the whole of the
 * mode indicator, so the two must stay as short and as different from each
 * other in English as they are in French.
 *
 * THE STATUS LINE IS A NARRATOR, NOT A SPINNER. Every sentence under the field
 * either reports something read (“4 000 objets”), something refused (with the
 * cause), or something drawn — including the two a proposal cannot promise: a
 * source that failed on the way in, and a dataset that loaded fine and has
 * nothing where the reader is looking. None of them may be vaguer in English
 * than in French.
 *
 * The wording follows `docs/DATASETS.md`, which documents the same panel for
 * contributors, and `scripts/dataset-manifest.mjs`, the command line that does
 * the same job.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The resting line, the field, and the two buttons under the draft. */
  open: { fr: 'BRANCHER UN JEU DE DONNÉES', en: 'PLUG IN A DATASET' },
  openTitle: { fr: 'Ajouter un jeu de données au globe', en: 'Add a dataset to the globe' },
  closeTitle: {
    fr: 'Fermer et rendre la place aux couches',
    en: 'Close and give the room back to the layers',
  },
  placeholder: {
    fr: 'Un sujet — « défibrillateurs » — ou une adresse…',
    en: 'A subject — “defibrillators” — or an address…',
  },
  search: { fr: 'CHERCHER', en: 'SEARCH' },
  analyse: { fr: 'ANALYSER', en: 'ANALYZE' },
  plug: { fr: 'BRANCHER', en: 'PLUG IN' },
  cancel: { fr: 'ANNULER', en: 'CANCEL' },

  /** The draft form. */
  draft: {
    name: { fr: 'Nom', en: 'Name' },
    colorTitle: { fr: 'Couleur des marques', en: 'Color of the marks' },
    resource: { fr: 'Ressource', en: 'Resource' },
    position: { fr: 'Position', en: 'Position' },
    longitude: { fr: 'longitude…', en: 'longitude…' },
    latitude: { fr: 'latitude…', en: 'latitude…' },
  },

  /** The facts read from the platform, listed under the form. */
  facts: {
    source: { fr: 'Source', en: 'Source' },
    loadedForView: { fr: ' · chargée pour la vue', en: ' · loaded for the view' },
    publisher: { fr: 'Éditeur', en: 'Publisher' },
    licence: { fr: 'Licence', en: 'License' },
    rows: { fr: 'Lignes', en: 'Rows' },
    columns: { fr: 'Colonnes', en: 'Columns' },
    columnsValue: {
      fr: (count, names, more) => `${count} — ${names}${more}`,
      en: (count, names, more) => `${count} — ${names}${more}`,
      note: 'The first six column names, then an ellipsis when there are more.',
      sample: [12, 'c_nom, c_adr_voie, c_com_nom', '…'],
    },
    position: { fr: 'Position', en: 'Position' },
  },

  /** What the buttons promise before they are pressed. */
  plugTitle: { fr: 'Enregistrer ce jeu et l\'allumer', en: 'Save this dataset and switch it on' },
  noDraft: { fr: 'aucun brouillon', en: 'no draft' },
  exportTitle: {
    fr: 'Copier le manifeste (à déposer dans datasets/)',
    en: 'Copy the manifest (to drop into datasets/)',
  },
  unplugTitle: { fr: 'Débrancher', en: 'Unplug' },

  /** The status line, in the order a reader meets it. */
  status: {
    toComplete: {
      fr: (fault) => `À compléter : ${fault}`,
      en: (fault) => `To complete: ${fault}`,
      note: 'The first fault of `datasetManifestFaults()`, already in the page’s language.',
      sample: ['`geometry`: a tabular source must say how a row becomes a point'],
    },
    searching: { fr: 'Recherche sur data.gouv.fr…', en: 'Searching data.gouv.fr…' },
    nothingPublished: {
      fr: (query) => `Aucun jeu publié sur « ${query} ».`,
      en: (query) => `No dataset published on “${query}”.`,
      sample: ['defibrillators'],
    },
    noneUsable: {
      fr: (total, tried) => `${total} jeux trouvés, aucun des ${tried} premiers n'est exploitable — précisez le sujet, ou collez une adresse.`,
      en: (total, tried) => `${total} datasets found, none of the first ${tried} is usable — narrow the subject, or paste an address.`,
      sample: [42, 5],
    },
    chooseOne: {
      fr: (total) => `${total} jeux trouvés — voici ceux qui se dessinent. Choisissez.`,
      en: (total) => `${total} datasets found — here are the ones that draw. Pick one.`,
      sample: [42],
    },
    searchFailed: {
      fr: (detail) => `Recherche impossible : ${detail}`,
      en: (detail) => `Search failed: ${detail}`,
      sample: ['source unreachable'],
    },
    pasteAddress: {
      fr: 'Collez l\'adresse d\'un jeu de données.',
      en: 'Paste the address of a dataset.',
    },
    reading: { fr: 'Lecture de la source…', en: 'Reading the source…' },
    draftReady: {
      fr: 'Brouillon prêt — vérifiez, puis BRANCHER.',
      en: 'Draft ready — check it, then PLUG IN.',
    },
    chosen: {
      fr: (title) => `« ${title} » — vérifiez, puis BRANCHER pour le voir sur le globe.`,
      en: (title) => `“${title}” — check it, then PLUG IN to see it on the globe.`,
      sample: ['GeoDAE national defibrillator register'],
    },
    readFailed: {
      fr: (detail) => `Impossible de lire cette adresse : ${detail}`,
      en: (detail) => `Cannot read this address: ${detail}`,
      sample: ['unreadable JSON'],
    },
    plugging: { fr: 'Branchement…', en: 'Plugging in…' },
    loading: {
      fr: (label) => `« ${label} » — chargement…`,
      en: (label) => `“${label}” — loading…`,
      sample: ['Defibrillators (GeoDAE)'],
    },
    progress: {
      fr: (label, line) => `« ${label} » — ${line}`,
      en: (label, line) => `“${label}” — ${line}`,
      note: '`line` is the loader’s own progress line, already worded.',
      sample: ['Defibrillators (GeoDAE)', '2,400 of 16,474'],
    },
    plugged: {
      fr: (label, caveat) => `« ${label} » branché.${caveat}`,
      en: (label, caveat) => `“${label}” plugged in.${caveat}`,
      sample: ['Defibrillators (GeoDAE)', ''],
    },
    drawn: {
      fr: (label, coverage, caveat) => `« ${label} » — ${coverage}.${caveat}`,
      en: (label, coverage, caveat) => `“${label}” — ${coverage}.${caveat}`,
      note: '`coverage` is the row’s own coverage line, already worded.',
      sample: ['Defibrillators (GeoDAE)', '888 features, whole dataset', ''],
    },
    drawnCount: {
      fr: (count) => `${count} objets`,
      en: (count) => `${count} features`,
      note: 'Only when the layer answered a count and no coverage line.',
      sample: ['888'],
    },
    sourceFailed: {
      fr: (label, detail) => `« ${label} » branché, mais la source a échoué : ${detail}`,
      en: (label, detail) => `“${label}” plugged in, but the source failed: ${detail}`,
      sample: ['Defibrillators (GeoDAE)', 'source unreachable'],
    },
    nothingHere: {
      fr: (label, caveat) => `« ${label} » branché, mais rien à cet endroit — déplacez ou rapprochez la vue.${caveat}`,
      en: (label, caveat) => `“${label}” plugged in, but nothing here — move or zoom the view.${caveat}`,
      note: 'The honest answer no proposal could have foreseen.',
      sample: ['Defibrillators (GeoDAE)', ''],
    },
    notPersisted: {
      fr: ' — le stockage a refusé : il ne survivra pas à cet onglet.',
      en: ' — storage refused: it will not survive this tab.',
      note: 'Appended to whatever the plug reported; starts with its own separator.',
    },
    plugFailed: {
      fr: (detail) => `Échec : ${detail}`,
      en: (detail) => `Failed: ${detail}`,
      sample: ['A dataset “ds-x” is already plugged in'],
    },
    manifestCopied: {
      fr: (id) => `Manifeste « ${id}.json » copié.`,
      en: (id) => `Manifest “${id}.json” copied.`,
      sample: ['defibrillateurs-geodae'],
    },
    clipboardRefused: {
      fr: 'Presse-papiers refusé — le manifeste est dans la console.',
      en: 'Clipboard refused — the manifest is in the console.',
    },
    unplugged: {
      fr: (label) => `« ${label} » débranché.`,
      en: (label) => `“${label}” unplugged.`,
      sample: ['Defibrillators (GeoDAE)'],
    },
    unplugRefused: { fr: 'Débranchement refusé.', en: 'Unplug refused.' },
  },

  /** The shortlist, and what it set aside. */
  shortlist: {
    setAside: {
      fr: (entries) => `Écartés : ${entries}`,
      en: (entries) => `Set aside: ${entries}`,
      note: 'A reader who asked for a subject is owed the whole answer.',
      sample: ['Paris pharmacies (no position column)'],
    },
    setAsideEntry: {
      fr: (title, reason) => `${title} (${reason})`,
      en: (title, reason) => `${title} (${reason})`,
      sample: ['Paris pharmacies', 'no position column'],
    },
  },

  /** Byte sizes of a resource in the picker. */
  bytes: {
    megabytes: {
      fr: (value) => `${value} Mo`,
      en: (value) => `${value} MB`,
      sample: ['161'],
    },
    kilobytes: {
      fr: (value) => `${value} ko`,
      en: (value) => `${value} kB`,
      sample: ['48'],
    },
    bytes: {
      fr: (value) => `${value} o`,
      en: (value) => `${value} B`,
      sample: ['512'],
    },
  },
});
