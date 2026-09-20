/**
 * Strings of `src/data/ficheSheet.js` — the panel that frames the Address
 * X-ray over the globe. See docs/i18n/CONVENTIONS.md.
 *
 * The sheet INSIDE the frame is `fiche.html`, which carries its own catalog
 * (`src/fiche.i18n.js`); only the panel's head is written here.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Accessible name of the panel, and of the frame it holds. */
  label: { fr: 'Radiographie d’adresse', en: 'Address X-ray' },
  /** The head bar: a drag handle, a title, three buttons. */
  head: {
    title: {
      fr: 'RADIOGRAPHIE D’ADRESSE',
      en: 'ADDRESS X-RAY',
      note: 'Capitals, like every panel header on the globe.',
    },
    dragTitle: {
      fr: 'Glissez pour déplacer le panneau · double-clic ou appui long pour le remettre en place',
      en: 'Drag to move the panel · double-click or long-press to put it back',
    },
    open: { fr: 'ONGLET', en: 'TAB', note: 'Opens the whole sheet in a browser tab.' },
    openTitle: {
      fr: 'Ouvrir la feuille entière dans un onglet — avec le formulaire et l’impression',
      en: 'Open the whole sheet in a tab — with the lookup form and the print button',
    },
    print: { fr: 'PDF', en: 'PDF', note: 'Prints the framed sheet; the browser saves it as a PDF.' },
    printTitle: {
      fr: 'Imprimer la feuille — « Enregistrer au format PDF » suffit',
      en: 'Print the sheet — “Save as PDF” is enough',
    },
    close: { fr: 'Fermer la radiographie', en: 'Close the X-ray', note: 'Accessible name of the × button.' },
  },
});
