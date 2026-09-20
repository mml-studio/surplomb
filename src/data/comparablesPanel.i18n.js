/**
 * Strings of `src/data/comparablesPanel.js` — the only panel in this globe
 * the reader TYPES into.
 *
 * THE PROVENANCE PARAGRAPH IS THE POINT OF THE PANEL, and it is a promise
 * rather than a caption: nothing is scraped, a listing's link is never
 * followed by the application, and prices, areas and links never leave this
 * browser. Only the address typed (to the geocoder) and the property's
 * position (to DVF) go out. The English says exactly that, or it is not the
 * same product.
 *
 * `Appartement`, `Maison`, `Terrain`, `Local` are DVF's own `type_local`
 * values: they are stored in the dossier, written into an export, and shown
 * as the register writes them.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** The static shell, built once into `innerHTML`. */
  shell: {
    ariaLabel: { fr: 'Dossier de comparables', en: 'Comparables file' },
    gripTitle: {
      fr: 'Glissez pour déplacer le panneau · double-clic ou appui long pour le remettre en place',
      en: 'Drag to move the panel · double-click or long-press to put it back',
    },
    title: { fr: 'DOSSIER · COMPARABLES', en: 'FILE · COMPARABLES' },
    subjectHead: { fr: 'LE BIEN', en: 'THE PROPERTY' },
    addressPlaceholder: { fr: 'Adresse du bien…', en: 'Property address…' },
    geocodeTitle: {
      fr: 'Chercher cette adresse (BAN / IGN)',
      en: 'Look this address up (BAN / IGN)',
    },
    hereTitle: {
      fr: 'Poser le bien au centre de la vue',
      en: 'Place the property at the center of the view',
    },
    here: { fr: 'CENTRE', en: 'CENTER' },
    roomsPlaceholder: { fr: 'pièces', en: 'rooms' },
    linesHead: { fr: 'CE QUE LE DOSSIER DIT', en: 'WHAT THE FILE SAYS' },
    retainedHead: { fr: 'RETENUS', en: 'SHORTLISTED' },
    poolHead: { fr: 'VENTES AUTOUR DU BIEN', en: 'SALES AROUND THE PROPERTY' },
    addHead: { fr: 'AJOUTER UNE ANNONCE', en: 'ADD A LISTING' },
    newAddressPlaceholder: { fr: 'Adresse de l’annonce…', en: 'Listing address…' },
    pricePlaceholder: { fr: 'prix €', en: 'price €' },
    urlPlaceholder: {
      fr: 'lien de l’annonce (facultatif, jamais consulté)',
      en: 'listing link (optional, never followed)',
    },
    add: { fr: 'AJOUTER', en: 'ADD' },
    export: { fr: 'EXPORTER', en: 'EXPORT' },
    import: { fr: 'IMPORTER', en: 'IMPORT' },
    clear: { fr: 'VIDER', en: 'CLEAR' },
    confirm: { fr: 'CONFIRMER ?', en: 'CONFIRM?' },
    provenance: {
      fr: 'Sélection manuelle, comme chez le concurrent. Aucune annonce n’est collectée\n'
        + '    automatiquement : ce dossier ne contient que ce que vous y mettez, et le lien\n'
        + '    d’une annonce n’est jamais consulté par l’application.',
      en: 'A manual shortlist, as the competitor does it. No listing is collected\n'
        + '    automatically: this file holds only what you put in it, and a listing’s link\n'
        + '    is never followed by the application.',
    },
    provenanceOutbound: {
      fr: 'Prix, surfaces et liens ne sont jamais transmis — ils restent dans ce\n'
        + '    navigateur. Seules sortent l’adresse que vous tapez, envoyée au géocodeur\n'
        + '    (BAN / IGN) pour devenir des coordonnées, et la position du bien, envoyée à\n'
        + '    DVF pour lister les ventes autour.',
      en: 'Prices, areas and links are never transmitted — they stay in this\n'
        + '    browser. The only things that leave are the address you type, sent to the\n'
        + '    geocoder (BAN / IGN) to become coordinates, and the property’s position,\n'
        + '    sent to DVF to list the sales around it.',
    },
    typePlaceholder: { fr: 'type…', en: 'type…' },
  },

  /** What the status line says, one action at a time. */
  status: {
    typeAddress: { fr: 'Tapez une adresse à chercher.', en: 'Type an address to look up.' },
    searching: { fr: 'Recherche de l’adresse…', en: 'Looking the address up…' },
    notFound: {
      fr: 'Adresse introuvable — précisez la commune.',
      en: 'Address not found — name the municipality.',
    },
    placed: {
      fr: (label) => `Bien posé sur ${label}.`,
      en: (label) => `Property placed on ${label}.`,
      sample: ['20 Place Bellecour'],
    },
    noGround: {
      fr: 'La vue ne regarde pas le sol.',
      en: 'The view is not looking at the ground.',
    },
    readingCentre: {
      fr: 'Lecture de l’adresse au centre de la vue…',
      en: 'Reading the address at the center of the view…',
    },
    placedNoAddress: {
      fr: 'Bien posé — aucune adresse à ce point.',
      en: 'Property placed — no address at that point.',
    },
    placeFirst: { fr: 'Posez d’abord le bien.', en: 'Place the property first.' },
    noPrice: {
      fr: 'Une annonce sans prix n’est pas un comparable.',
      en: 'A listing with no price is not a comparable.',
    },
    badLink: {
      fr: 'Lien ignoré — seuls http et https sont acceptés.',
      en: 'Link ignored — only http and https are accepted.',
    },
    searchingListing: {
      fr: 'Recherche de l’adresse de l’annonce…',
      en: 'Looking the listing’s address up…',
    },
    refused: {
      fr: 'Annonce refusée — il faut au moins un prix et une adresse.',
      en: 'Listing refused — a price and an address are the minimum.',
    },
    listingPlaced: { fr: 'Annonce retenue et placée.', en: 'Listing shortlisted and placed.' },
    listingUnplaced: {
      fr: 'Annonce retenue — sans adresse trouvée, elle compte mais ne se trace pas.',
      en: 'Listing shortlisted — with no address found, it counts but is not drawn.',
    },
    exported: { fr: 'Dossier exporté.', en: 'File exported.' },
    exportFailed: {
      fr: 'Export impossible dans ce navigateur.',
      en: 'Export is not possible in this browser.',
    },
    unreadable: {
      fr: 'Fichier illisible — un export JSON est attendu.',
      en: 'Unreadable file — a JSON export is expected.',
    },
    imported: {
      fr: (added, rejected, already) => `${added} comparables ajoutés${rejected}${already}.`,
      en: (added, rejected, already) => `${added} comparables added${rejected}${already}.`,
      sample: [12, ', 2 rows refused', ', 3 already present'],
    },
    importedRejected: {
      fr: (rejected) => `, ${rejected} lignes refusées`,
      en: (rejected) => `, ${rejected} rows refused`,
      sample: [2],
    },
    importedAlready: {
      fr: (already) => `, ${already} déjà présents`,
      en: (already) => `, ${already} already present`,
      sample: [3],
    },
    clearArmed: {
      fr: 'Appuyez à nouveau pour vider le dossier.',
      en: 'Press again to clear the file.',
    },
    cleared: { fr: 'Dossier vidé.', en: 'File cleared.' },
    notSaved: {
      fr: 'Le navigateur refuse d’enregistrer — le dossier ne survivra pas au rechargement.',
      en: 'The browser refuses to save — this file will not survive a reload.',
      note: 'The dossier lives in localStorage; a private window or a full quota '
        + 'silently loses an afternoon of work unless this is said.',
    },
  },

  /** One row of the shortlist, and one of the candidate pool. */
  row: {
    noRatio: {
      fr: (multi) => `pas de €/m²${multi}`,
      en: (multi) => `no €/m²${multi}`,
      sample: [' — multiple lots'],
    },
    multiLot: { fr: ' — lot multiple', en: ' — multiple lots' },
    prixM2: {
      fr: (value) => `${value} €/m²`,
      en: (value) => `€${value}/m²`,
      sample: ['3,200'],
    },
    rooms: {
      fr: (rooms, n) => `${rooms} ${Math.abs(n) >= 2 ? 'pièces' : 'pièce'}`,
      en: (rooms, n) => `${rooms} ${plural(n, 'room', 'rooms')}`,
      sample: [3, 3],
    },
    badgeSale: { fr: 'VENTE', en: 'SALE' },
    badgeListing: { fr: 'ANNONCE', en: 'LISTING' },
    flyTo: { fr: 'Voler jusqu’à ce comparable', en: 'Fly to this comparable' },
    seeOn: {
      fr: (portal) => `voir sur ${portal}`,
      en: (portal) => `see on ${portal}`,
      sample: ['seloger.com'],
    },
    seeListing: { fr: 'voir l’annonce', en: 'see the listing' },
    putBack: {
      fr: 'Remettre ce comparable dans le calcul',
      en: 'Put this comparable back into the calculation',
    },
    takeOut: {
      fr: 'Sortir ce comparable du calcul, sans le supprimer',
      en: 'Take this comparable out of the calculation, without deleting it',
    },
    remove: { fr: 'Retirer du dossier', en: 'Remove from the file' },
    already: { fr: 'Déjà dans le dossier', en: 'Already in the file' },
    take: {
      fr: 'Retenir cette vente comme comparable',
      en: 'Shortlist this sale as a comparable',
    },
  },

  /** The two counters, and the empty state. */
  summary: {
    noSubject: { fr: 'Aucun bien posé', en: 'No property placed' },
    incompletePosition: { fr: 'position incomplète', en: 'incomplete position' },
    inCalculation: {
      fr: (retained, total) => `${retained}/${total} dans le calcul`,
      en: (retained, total) => `${retained}/${total} in the calculation`,
      sample: [8, 12],
    },
    none: { fr: 'aucun', en: 'none' },
    medianK: {
      fr: (thousands) => `${thousands} k€ médian`,
      en: (thousands) => `median €${thousands}k`,
      sample: [250],
    },
    retained: {
      fr: (n) => `${n} retenus`,
      en: (n) => `${n} shortlisted`,
      sample: [8],
    },
    dvfSilent: { fr: 'DVF muet', en: 'DVF silent' },
    noneWithin: {
      fr: (radius) => `aucune dans ${radius} m`,
      en: (radius) => `none within ${radius} m`,
      sample: [300],
    },
    nearest: {
      fr: (shown, total, radius) => `${shown} des ${total} plus proches, dans ${radius} m`,
      en: (shown, total, radius) => `${shown} of the ${total} nearest, within ${radius} m`,
      note: 'A5: the count shown, the count found, and the criterion that chose.',
      sample: [24, 118, 300],
    },
    within: {
      fr: (shown, radius) => `${shown} dans ${radius} m`,
      en: (shown, radius) => `${shown} within ${radius} m`,
      sample: [12, 300],
    },
  },
});
