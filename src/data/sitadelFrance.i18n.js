/**
 * Strings of `src/data/sitadelFrance.js` — the permits drawn on their parcels,
 * the height key above them, and the provenance block every card ends with.
 *
 * WHAT THIS FILE WILL NOT LET THE LAYER FORGET. This is the only layer on the
 * globe whose every coordinate was computed rather than published, and the
 * three provenance lines say so in both languages: the municipality's own join
 * rate, the YEAR's rate (a parcel is divided precisely when somebody builds on
 * it), and the two editions the join was made between. A translation that
 * softened them would turn a measured claim into a decoration.
 *
 * The five band labels are NOT here: they live in `sitadelFeed.i18n.js`,
 * because the server bakes their French into the payload and the browser
 * relabels the band id.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Where a card admits how its position was obtained, and how well. */
  join: {
    thisCommune: { fr: 'cette commune', en: 'this municipality' },
    communeRate: {
      fr: (name, placed, permits, share) => `${name} : ${placed} des ${permits} autorisations posées`
        + ` (${share}) — jointure cadastrale, aucune coordonnée publiée`,
      en: (name, placed, permits, share) => `${name}: ${placed} of ${permits} permits placed`
        + ` (${share}) — cadastral join, no coordinate published`,
      note: 'Toulouse places 7.6% and Paris 91.3%; the two are not the same kind of claim.',
      sample: ['Nantes', '2,890', '3,241', '89.2%'],
    },
    yearRate: {
      fr: (year, placed, permits, share) => `Autorisations de ${year} ici : ${placed} des ${permits} posées`
        + ` (${share}) — une parcelle est divisée quand on y construit`,
      en: (year, placed, permits, share) => `Permits from ${year} here: ${placed} of ${permits} placed`
        + ` (${share}) — a parcel gets divided when somebody builds on it`,
      note: 'The failure is age-dependent: Nantes places 60% of 2013 and 97% of 2026.',
      sample: ['2013', '120', '200', '60.0%'],
    },
    editions: {
      fr: (millesime, cadastre) => `Sitadel millésime ${millesime} · cadastre Etalab ${cadastre}`,
      en: (millesime, cadastre) => `Sitadel vintage ${millesime} · Etalab cadastre ${cadastre}`,
      note: 'Neither edition is pinned, so both are named.',
      sample: ['2026-07', '2026-06-01'],
    },
    sharedPlot: {
      fr: (others, count) => `${others} autre${count > 1 ? 's' : ''} autorisation${count > 1 ? 's' : ''}`
        + ' sur cette parcelle depuis 2013',
      en: (others, count) => `${others} other ${plural(count, 'permit', 'permits')}`
        + ' on this parcel since 2013',
      sample: ['3', 3],
    },
    credit: {
      fr: (licence) => `SDES / CGDD — ${licence} · parcelles DGFiP / Etalab`,
      en: (licence) => `SDES / CGDD — ${licence} · DGFiP / Etalab parcels`,
      note: 'The licence name is kept as published (Licence Ouverte).',
      keep: ['Licence Ouverte (Etalab)'],
      sample: ['Licence Ouverte (Etalab)'],
    },
  },

  /** What a failed query says, with a pack already in hand and without one. */
  error: {
    refresh: {
      fr: 'rafraîchissement des autorisations d’urbanisme indisponible',
      en: 'planning permit refresh unavailable',
      note: 'A pack already in hand still describes the same municipality — DiDo '
        + 'publishes monthly — so the layer keeps drawing and says the refresh failed.',
    },
    unavailable: {
      fr: 'autorisations d’urbanisme (Sitadel) indisponibles',
      en: 'planning permits (Sitadel) unavailable',
    },
  },

  /** The DETECT callout, when a permit carries neither address nor applicant. */
  detectFallback: { fr: 'Autorisation d’urbanisme', en: 'Planning permit' },

  /**
   * The type noun under a DETECT callout — what KIND of permit the card is
   * about. These three read in English on the French globe until now; the
   * English is kept word for word, and the French is the glossary's
   * (*permis de démolir*, *permis de construire*).
   */
  detectType: {
    demolition: { fr: 'Permis de démolir', en: 'Demolition permit' },
    buildingSite: {
      fr: 'Chantier ouvert',
      en: 'Building site',
      note: 'The permit’s work has been declared started (`b: commence`), '
        + 'so what stands there is a site and no longer a plan.',
    },
    building: { fr: 'Permis de construire', en: 'Building permit' },
  },

  /**
   * The height key — the rows without a swatch.
   *
   * A height scale is not a colour, so these carry `color: null`. The count on
   * each row is what makes it a legend row rather than a caption: the scale row
   * counts the FILES that stand up, the flat row counts those that do not, and
   * the sum is every permit drawn.
   */
  height: {
    scale: {
      fr: (metres) => `Hauteur = logements autorisés · 1 logement = ${metres} m`,
      en: (metres) => `Height = dwellings authorized · 1 dwelling = ${metres} m`,
      sample: [3],
    },
    scaleBlurb: {
      fr: (base, ceiling, dwellings) => `Une colonne de ${base} m de côté par dossier, plantée sur sa `
        + 'parcelle — la parcelle elle-même reste à plat, sa teinte est son état. Échelle '
        + 'linéaire — deux fois plus haut, deux fois plus de logements — plafonnée à '
        + `${ceiling} m (${dwellings} logements, `
        + '99ᵉ centile mesuré à 190 sur 22 474 permis)',
      en: (base, ceiling, dwellings) => `One ${base} m square column per file, planted on its `
        + 'parcel — the parcel itself stays flat, its tint is its state. A linear scale '
        + '— twice as tall, twice as many dwellings — capped at '
        + `${ceiling} m (${dwellings} dwellings, `
        + '99th percentile measured at 190 over 22,474 permits)',
      sample: [12, 600, 200],
    },
    clipped: {
      fr: (columns, count) => ` · ${columns} colonne${count > 1 ? 's' : ''} écrêtée${count > 1 ? 's' : ''}, la fiche garde le vrai compte.`,
      en: (columns, count) => ` · ${columns} ${plural(count, 'column', 'columns')} capped, the card keeps the true count.`,
      note: 'Appended to the scale blurb. Leading separator on purpose.',
      sample: ['4', 4],
    },
    notClipped: {
      fr: ' · aucune colonne écrêtée ici.',
      en: ' · no column capped here.',
    },
    flat: {
      fr: 'Sans hauteur — parcelle à plat, bordée de sa propre couleur',
      en: 'No height — parcel left flat, outlined in its own color',
    },
    flatBlurb: {
      fr: (demolition, permits, count) => `${demolition} permis de démolir, dont le fichier a 33 colonnes et pas `
        + `une qui compte un logement, et ${permits} autorisation`
        + `${count > 1 ? 's' : ''} ne créant aucun logement ou n'en publiant pas le `
        + 'nombre — les deux arrivent ici confondues. Aucune hauteur nulle : un chiffre que le '
        + 'fichier ne donne pas ne se dessine pas.',
      en: (demolition, permits, count) => `${demolition} demolition permits, whose file has 33 columns and not `
        + `one that counts a dwelling, and ${permits} ${plural(count, 'permit', 'permits')} `
        + 'creating no dwelling or not publishing the number '
        + '— the two arrive here indistinguishable. No zero height: a figure the '
        + 'file does not give is a figure that is not drawn.',
      sample: ['61', '180', 180],
    },
    coldFloor: {
      fr: 'Sol pas encore résolu — sans colonne en attendant',
      en: 'Ground not resolved yet — no column meanwhile',
    },
    coldFloorBlurb: {
      fr: 'État transitoire, pas une classe : la grille d’altitude partagée n’a pas encore '
        + 'répondu sous ces dossiers. Une seule nouvelle tentative, trois secondes plus tard. '
        + 'La bordure de leur parcelle reste neutre, parce qu’ils vont se lever.',
      en: 'A transient state, not a class: the shared elevation grid has not answered '
        + 'under these files yet. One retry, three seconds later. '
        + 'Their parcel outline stays neutral, because they are about to stand up.',
    },
  },

  /** The line under the layer's toggle, beyond what the feed already writes. */
  row: {
    noGround: {
      fr: 'Le centre de l’écran ne touche pas le sol — vise le terrain',
      en: 'The center of the screen does not meet the ground — aim at the terrain',
    },
    noDemolitionFile: {
      fr: 'fichier des démolitions indisponible',
      en: 'demolition file unavailable',
    },
    simplifiedOutline: {
      fr: 'contour communal simplifié',
      en: 'municipal outline simplified',
    },
    prisms: {
      fr: (files, metres, base, ceiling) => `${files} dossiers en volume · 1 logement = `
        + `${metres} m sur une colonne de ${base} m, `
        + `plafond ${ceiling} m`,
      en: (files, metres, base, ceiling) => `${files} files in volume · 1 dwelling = `
        + `${metres} m on a ${base} m column, `
        + `cap ${ceiling} m`,
      note: 'The scale, on the one line visible without opening anything (D1).',
      sample: ['1,240', 3, 12, 600],
    },
    flat: {
      fr: (files) => `${files} sans hauteur, sans logement publié`,
      en: (files) => `${files} with no height, no dwelling published`,
      sample: ['241'],
    },
  },
});
