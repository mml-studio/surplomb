/**
 * Strings of `src/data/sitadelFrance.js` — the permits drawn on their parcels,
 * and the provenance block every card ends with. The class names and the
 * card's own words are the « Urbanisme » row's, in `permitProjects.i18n.js`.
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
  },
});
