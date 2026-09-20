/**
 * Strings of `src/data/urbanismeGpu.js` — the PLU zoning wash, the easement
 * outlines, and the cards both of them answer with.
 *
 * TWO TABLES HERE ARE KEYED BY DATA, not by a message name. {@link default}'s
 * `family` group is keyed by the register's own `typezone` letters (`U`, `AUc`,
 * `Ah`…) and the easement families live one file over, in `gpuFeed.i18n.js`,
 * keyed by the national SUP codes. Neither key is ever translated: they are
 * what the register publishes, what a card prints beside the sentence, and
 * what a share link carries.
 *
 * The register's own `libelong` (`Zone UB`) restates the code instead of
 * explaining it, so the family letter — the one part of the national grammar
 * that IS standard across communes — is the one part this module spells out.
 * An unknown letter stays unexplained rather than guessed at, in either
 * language.
 */
import { monthName, plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * What each `typezone` family means, in the words someone buying a house
   * would use. Keyed by the register's own spelling.
   */
  family: {
    U: { fr: 'zone urbaine — déjà bâtie et équipée', en: 'urban zone — already built and serviced' },
    AU: {
      fr: 'zone à urbaniser — constructible, aujourd\'hui non bâtie',
      en: 'future urban zone — buildable, unbuilt today',
      note: 'Legacy spelling of the à-urbaniser family; never observed in the 4,216-feature census.',
    },
    AUc: {
      fr: 'zone à urbaniser OUVERTE — constructible sous le PLU en vigueur',
      en: 'future urban zone, OPEN — buildable under the PLU as it stands',
      note: 'The one family that changes a view: the car park opposite can become flats.',
    },
    AUs: {
      fr: 'zone à urbaniser FERMÉE — constructible seulement après modification ou révision du PLU',
      en: 'future urban zone, CLOSED — buildable only after the PLU is modified or revised',
    },
    A: { fr: 'zone agricole — construction très limitée', en: 'agricultural zone — building severely limited' },
    Ah: {
      fr: 'secteur bâti dans la zone agricole — quelques constructions admises, à la différence du reste de la zone',
      en: 'built pocket inside the agricultural zone — a few buildings allowed, unlike the rest of the zone',
    },
    N: { fr: 'zone naturelle — construction très limitée', en: 'natural zone — building severely limited' },
    Nh: {
      fr: 'secteur bâti dans la zone naturelle — quelques constructions admises, à la différence du reste de la zone',
      en: 'built pocket inside the natural zone — a few buildings allowed, unlike the rest of the zone',
    },
  },

  /** The two halves of the answer, each on its own chip. */
  halves: {
    plu: {
      label: { fr: 'Zonage PLU', en: 'PLU zoning' },
      subject: { fr: 'le zonage du PLU', en: 'the PLU zoning' },
      blurb: {
        fr: 'l’aplat coloré, ses contours et les codes écrits au sol',
        en: 'the colored fill, its outlines and the codes written on the ground',
      },
    },
    sup: {
      label: { fr: 'Servitudes', en: 'Easements' },
      subject: {
        fr: 'les servitudes d’utilité publique',
        en: 'the public utility easements (SUP)',
      },
      blurb: {
        fr: 'les emprises tiretées rouges, posées par-dessus le zonage',
        en: 'the dashed red extents, laid over the zoning',
      },
    },
  },
  hide: { fr: 'Masquer', en: 'Hide' },
  show: { fr: 'Afficher', en: 'Show' },

  /** The key to the ground wash. */
  legend: {
    unknownFamily: { fr: 'Famille non publiée', en: 'Family not published' },
    unknownFamilyBlurb: {
      fr: 'Le registre publie une lettre que cette grammaire ne connaît pas — '
        + 'la zone est dessinée, pas expliquée.',
      en: 'The register publishes a letter this grammar does not know — '
        + 'the zone is drawn, not explained.',
    },
    easement: { fr: 'Servitude d’utilité publique', en: 'Public utility easement (SUP)' },
    easementBlurb: {
      fr: 'Contour tireté, sans aplat : une seule enveloppe mesurée fait '
        + '759 polygones sur des kilomètres, et la remplir teinterait la vue '
        + 'au lieu d’une parcelle.',
      en: 'Dashed outline, no fill: one measured envelope is '
        + '759 polygons spanning kilometers, and filling it would tint the view '
        + 'instead of one plot.',
    },
    zonesHidden: {
      fr: (zones) => `${zones} zone${zones > 1 ? 's' : ''} de PLU masquée${zones > 1 ? 's' : ''}`,
      en: (zones) => `${zones} PLU ${plural(zones, 'zone', 'zones')} hidden`,
      note: 'Only ever built with a count of one or more.',
      sample: [3],
    },
    easementsHidden: {
      fr: (found) => `${found} servitude${found > 1 ? 's' : ''} masquée${found > 1 ? 's' : ''}`,
      en: (found) => `${found} ${plural(found, 'easement', 'easements')} hidden`,
      sample: [5],
    },
    stillAnswered: {
      fr: (hidden) => `${hidden} — le repère porte toujours la réponse du registre.`,
      en: (hidden) => `${hidden} — the marker still carries the register’s answer.`,
      note: '`hidden` is the joined list of what the chips took off the map.',
      sample: ['5 easements hidden'],
    },
  },

  /** A zone, on its card and in the title of its own outline. */
  zone: {
    fallbackCode: { fr: 'Zone', en: 'Zone' },
    fallbackLabel: { fr: 'zonage PLU', en: 'PLU zoning' },
    title: {
      fr: (code, label) => `${code} — ${label}`,
      en: (code, label) => `${code} — ${label}`,
      note: 'Both halves come from the register, or from the two fallbacks above.',
      sample: ['UB', 'PLU zoning'],
    },
    neighbor: {
      fr: 'zone voisine — pas celle sous le repère',
      en: 'neighboring zone — not the one under the marker',
    },
    approvedOn: {
      fr: (date) => `PLU approuvé le ${date}`,
      en: (date) => `PLU approved on ${date}`,
      sample: ['Mar 23, 2024'],
    },
    /**
     * The register publishes `datvalid` two ways in the same national schema —
     * `20240323` at Ustaritz, `2026-06-16` in Paris. The parts arrive as the
     * strings the register wrote them with, zero padding included.
     */
    approvalDate: {
      fr: (year, month, day) => `${day}/${month}/${year}`,
      en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short' })} ${Number(day)}, ${year}`,
      sample: ['2024', '03', '23'],
    },
    enclaves: {
      fr: (holes) => `${holes} enclave${holes > 1 ? 's' : ''} découpée${holes > 1 ? 's' : ''} dans la zone`,
      en: (holes) => `${holes} ${plural(holes, 'enclave', 'enclaves')} cut out of the zone`,
      sample: [2],
    },
    enclavesElsewhere: {
      fr: (enclaves) => `${enclaves} enclave${enclaves > 1 ? 's' : ''} découpée${enclaves > 1 ? 's' : ''} — un autre zonage s'y applique`,
      en: (enclaves) => `${enclaves} ${plural(enclaves, 'enclave', 'enclaves')} cut out — another zoning applies there`,
      note: 'On the marker card: the unpainted islands are the register’s, not a gap in the draw.',
      sample: [2],
    },
    simplified: {
      fr: (vertices) => `contour simplifié (${vertices} sommets à l'amont)`,
      en: (vertices) => `simplified outline (${vertices} vertices upstream)`,
      note: 'The upstream vertex count, ungrouped: it is a size, not a quantity a reader adds up.',
      sample: [3588],
    },
    overlapHere: {
      fr: (zones) => `${zones} zonages se superposent ici — deux communes, deux tracés de la limite`,
      en: (zones) => `${zones} zonings overlap here — two municipalities, two drawings of the boundary`,
      sample: [2],
    },
    overlapAtMarker: {
      fr: (zones) => `${zones} zonages se superposent ici — deux communes ne placent pas leur limite au même endroit`,
      en: (zones) => `${zones} zonings overlap here — two municipalities do not put their boundary in the same place`,
      sample: [2],
    },
    neighborsInBlock: {
      fr: (zones) => `${zones} autres zones autour, dans le bloc`,
      en: (zones) => `${zones} other zones around, in the block`,
      sample: [12],
    },
    simplifiedNearLimit: {
      fr: 'contours simplifiés — près d\'une limite, c\'est le document qui fait foi',
      en: 'outlines are simplified — near a boundary, the document is what counts',
    },
    hiddenOnMap: { fr: 'zonage masqué sur la carte', en: 'zoning hidden on the map' },
  },

  /**
   * Why a point has no zoning, which is never just "it has none". Four
   * reasons, and only one of them is about the ground.
   */
  gap: {
    refusedTitle: { fr: 'Zonage non dessiné', en: 'Zoning not drawn' },
    refused: {
      fr: (found, limit) => `${found} zones dans ce cadre, au-delà des `
        + `${limit} que le service renvoie — zoome`,
      en: (found, limit) => `${found} zones in this frame, past the `
        + `${limit} the service returns — zoom in`,
      sample: ['17,182', '5,000'],
    },
    outsideBoxTitle: { fr: 'Hors du bloc interrogé', en: 'Outside the block queried' },
    outsideBox: {
      fr: 'le zonage n\'a été demandé que pour le bloc dessiné — recentrez la vue sur ce point',
      en: 'the zoning was only asked for the block drawn — recenter the view on this point',
    },
    notQueriedTitle: { fr: 'Zonage non interrogé ici', en: 'Zoning not queried here' },
    notQueried: {
      fr: (altitude) => `au-dessus de ${altitude} m le zonage n'est demandé`
        + ' que pour le repère',
      en: (altitude) => `above ${altitude} m the zoning is only asked`
        + ' for the marker',
      sample: ['1,500'],
    },
    noneTitle: { fr: 'Aucun zonage à ce point', en: 'No zoning at this point' },
    none: {
      fr: 'le bloc a bien été interrogé : le document publié ne couvre pas ce point',
      en: 'the block was indeed queried: the published document does not cover this point',
    },
    refusedAtMarker: {
      fr: (found, limit) => `zonage non dessiné : ${found} zones dans ce cadre, au-delà des ${limit} que le service renvoie`,
      en: (found, limit) => `zoning not drawn: ${found} zones in this frame, past the ${limit} the service returns`,
      sample: [17182, 5000],
    },
  },

  /**
   * The easement half of a card. THE ABSENCES ARE THREE DIFFERENT SENTENCES
   * and that is the point: "no easement here" is a strong claim from a layer
   * whose reason to exist is that the state has quietly encumbered ground, and
   * it is only true where the register was asked.
   */
  easements: {
    fallbackName: { fr: 'Servitude', en: 'Easement' },
    atAddress: { fr: 'Servitudes à cette adresse', en: 'Easements at this address' },
    countHere: {
      fr: (found) => `${found} servitude${found > 1 ? 's' : ''} ici`,
      en: (found) => `${found} ${plural(found, 'easement', 'easements')} here`,
      note: 'The head of a ground card’s easement line; always one or more.',
      sample: [3],
    },
    named: {
      fr: (head, families) => `${head} : ${families}`,
      en: (head, families) => `${head}: ${families}`,
      note: '`families` is the comma-joined list of family sentences.',
      sample: ['3 easements here', 'Gas pipeline, Power line'],
    },
    andMore: {
      fr: (rest) => ` et ${rest} autre${rest > 1 ? 's' : ''}`,
      en: (rest) => ` and ${rest} more`,
      note: 'Appended to a named list that ran out of width. Leading space on purpose.',
      sample: [5],
    },
    listHead: {
      fr: (head) => `${head} :`,
      en: (head) => `${head}:`,
      sample: ['3 easements here'],
    },
    listItem: {
      fr: (family) => `· ${family}`,
      en: (family) => `· ${family}`,
      sample: ['Gas pipeline'],
    },
    listMore: {
      fr: (rest) => `· et ${rest} autre${rest > 1 ? 's' : ''}`,
      en: (rest) => `· and ${rest} more`,
      sample: [5],
    },
    noneAtPoint: { fr: 'aucune servitude à ce point', en: 'no easement at this point' },
    noneReaches: {
      fr: (scanned) => `aucune des ${scanned} servitudes du repère n'atteint ce point`,
      en: (scanned) => `none of the marker’s ${scanned} easements reaches this point`,
      note: '"du repère" carries the whole caveat: they are the only easements looked for anywhere.',
      sample: [5],
    },
    noneScanned: {
      fr: 'aucune servitude relevée au repère — elles ne sont interrogées qu\'au repère',
      en: 'no easement found at the marker — they are only ever queried at the marker',
    },
    noneFound: { fr: 'aucune servitude relevée', en: 'no easement found' },
    listAtMarker: {
      fr: (found, families) => `${found} servitude${found > 1 ? 's' : ''} : ${families}`,
      en: (found, families) => `${found} ${plural(found, 'easement', 'easements')}: ${families}`,
      sample: [3, 'Gas pipeline, Power line'],
    },
    simplifiedForDisplay: {
      fr: 'contours simplifiés pour l\'affichage — voir le règlement',
      en: 'outlines simplified for display — see the regulation',
    },
    hiddenOnMap: { fr: 'servitudes masquées sur la carte', en: 'easements hidden on the map' },
    buffer: {
      fr: (meters) => `zone tampon de ${meters} m`,
      en: (meters) => `buffer zone of ${meters} m`,
      sample: ['500'],
    },
    partsDrawn: {
      fr: (served, source) => `${served} des ${source} pièces de l'emprise dessinées`,
      en: (served, source) => `${served} of the extent’s ${source} pieces drawn`,
      note: 'A dropped PIECE is not a decimated ring; the two losses are reported apart.',
      sample: [24, 759],
    },
    regulation: {
      fr: (url) => `règlement : ${url}`,
      en: (url) => `regulation: ${url}`,
      sample: ['https://www.geoportail-urbanisme.gouv.fr/document/…'],
    },
  },
});
