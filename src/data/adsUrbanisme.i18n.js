/**
 * Strings of `src/data/adsUrbanisme.js` — the cranes over a block, the plots
 * under them, and the ramp that paints whole roofs with a dossier's state.
 *
 * WHAT MUST NOT SOFTEN IN TRANSLATION: this layer draws a coordinate that was
 * mostly COMPUTED, and every caveat says which computation. A lot deduced
 * after a division, a parent plot drawn because the lot could not be told from
 * its siblings, a point geocoded to a street — three different claims, three
 * different sentences, in both languages.
 *
 * The permit's own vocabulary (family, state, purpose, placement) is NOT here:
 * it lives in `adsFeed.i18n.js`, because that module also runs on the server
 * and bakes its French into the payload. This file holds only what the browser
 * composes.
 */
import { monthName, plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The three window chips. The rungs are years, and the ACTIVE one carries
   * the truncation: widening the window is what causes it.
   */
  window: {
    years: {
      fr: (years) => `${years} ANS`,
      en: (years) => `${years} YEARS`,
      note: 'The chip itself. Capitals, as every chip on the rail is.',
      sample: [3],
    },
    title: {
      fr: (years) => `Autorisations des ${years} dernières années`,
      en: (years) => `Permits from the last ${years} years`,
      sample: [3],
    },
    truncated: {
      fr: (served, found) => ` — ${served} dossiers servis sur `
        + `${found} dans le rayon, les plus proches d’abord`,
      en: (served, found) => ` — ${served} files served out of `
        + `${found} in the radius, nearest first`,
      note: 'Appended to the chip title. Leading dash on purpose.',
      sample: [400, 912],
    },
    counted: {
      fr: (served) => ` — ${served} dossiers sur ce bloc`,
      en: (served) => ` — ${served} files on this block`,
      sample: [58],
    },
    pipeline: { fr: ' — le pipeline en cours', en: ' — the pipeline under way' },
    finished: { fr: ', chantiers achevés compris', en: ', completed sites included' },
  },

  /**
   * The date line: which date matters depends on where the dossier is. A file
   * under review is about when it was FILED — that is what the two-month
   * objection window runs from.
   */
  date: {
    completed: {
      fr: (date) => `achevé le ${date}`,
      en: (date) => `completed on ${date}`,
      sample: ['Aug 31, 2026'],
    },
    started: {
      fr: (date) => `chantier ouvert le ${date}`,
      en: (date) => `site opened on ${date}`,
      sample: ['Aug 31, 2026'],
    },
    filed: {
      fr: (date) => `déposé le ${date}`,
      en: (date) => `filed on ${date}`,
      sample: ['Aug 31, 2026'],
    },
    decided: {
      fr: (date) => `décidé le ${date}`,
      en: (date) => `decided on ${date}`,
      sample: ['Aug 31, 2026'],
    },
    /** `2026-08-31` → `31/08/2026` / `Aug 31, 2026`. */
    format: {
      fr: (year, month, day) => `${day}/${month}/${year}`,
      en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
      note: 'The register publishes ISO; French readers get the numeric form the '
        + 'rest of the packs use, English readers the glossary’s `Aug 31, 2026`.',
      sample: ['2026', '08', '31'],
    },
  },

  /**
   * How well this dot knows where it is. Said out loud on every dot that was
   * not published with a coordinate, because a permit geocoded to the middle
   * of a street looks exactly as certain as one on its own doorway.
   */
  precision: {
    deducedLot: {
      fr: (basis) => `lot déduit — ${basis}`,
      en: (basis) => `lot deduced — ${basis}`,
      note: '`basis` comes from cadastreLineage.i18n.js, already translated.',
      sample: ['only lot built on since'],
    },
    deducedLotPlain: {
      fr: 'lot déduit après division de la parcelle',
      en: 'lot deduced after the parcel was divided',
    },
    parentWithSiblings: {
      fr: (siblings) => `emprise avant division — ${siblings} lots depuis, non départagés`,
      en: (siblings) => `extent before the division — ${siblings} lots since, not told apart`,
      sample: [3],
    },
    parent: {
      fr: 'emprise avant division — le lot exact n’est pas déterminé',
      en: 'extent before the division — the exact lot is not determined',
    },
    street: {
      fr: 'position approchée — géocodée à la rue',
      en: 'approximate position — geocoded to the street',
    },
    locality: {
      fr: 'position approchée — géocodée au lieu-dit',
      en: 'approximate position — geocoded to the locality',
    },
  },

  /** The card a plot opens, which is about the LAND and not about one file. */
  emprise: {
    fallbackTitle: { fr: 'Emprise du dossier', en: 'The file’s extent' },
    oneParcel: {
      fr: (parcels) => `Parcelle ${parcels}`,
      en: (parcels) => `Parcel ${parcels}`,
      sample: ['063KE78'],
    },
    manyParcels: {
      fr: (parcels, more) => `Parcelles ${parcels}${more}`,
      en: (parcels, more) => `Parcels ${parcels}${more}`,
      note: '`more` is `+2` when the list was cut at three, or empty.',
      sample: ['063KE78, 063KE79, 063KE80', ' +2'],
    },
    files: {
      fr: (files) => `${files} dossiers sur cette emprise`,
      en: (files) => `${files} files on this extent`,
      sample: [9],
    },
    area: {
      fr: (area) => `${area} m² au sol`,
      en: (area) => `${area} m² of ground`,
      note: 'Measured off the outline drawn, not copied from the row.',
      sample: ['1,240'],
    },
    lastFiling: {
      fr: (date) => `dernier dépôt le ${date}`,
      en: (date) => `last filed on ${date}`,
      sample: ['Aug 31, 2026'],
    },
    tally: {
      fr: (count, label) => `${count} × ${label}`,
      en: (count, label) => `${count} × ${label}`,
      sample: [3, 'Building permit'],
    },
    publishedBy: {
      fr: (authority) => `emprise publiée par ${authority}`,
      en: (authority) => `extent published by ${authority}`,
      note: 'The authority is a proper noun taken off the source label.',
      keep: ['Bordeaux Métropole'],
      sample: ['Bordeaux Métropole'],
    },
    fromCadastre: {
      fr: 'emprise cadastrale — la parcelle nommée par le dossier',
      en: 'cadastral extent — the parcel the file names',
      note: 'A shape the layer DREW and a shape a counter PUBLISHED are two '
        + 'different claims about the same ground.',
    },
    publishedWithFile: {
      fr: 'emprise publiée avec le dossier',
      en: 'extent published with the file',
    },
  },

  /** What a marker's card says beyond the permit's own vocabulary. */
  card: {
    dwellings: {
      fr: (housing) => `${housing} logement${housing > 1 ? 's' : ''}`,
      en: (housing) => `${housing} ${plural(housing, 'dwelling', 'dwellings')}`,
      sample: [4],
    },
    surfaceCreated: {
      fr: (surface) => `${surface} m² créés`,
      en: (surface) => `${surface} m² created`,
      sample: ['1,240'],
    },
    parcel: {
      fr: (parcels) => `parcelle ${parcels}`,
      en: (parcels) => `parcel ${parcels}`,
      sample: ['064547AN0081'],
    },
    distance: {
      fr: (metres) => `${metres} m`,
      en: (metres) => `${metres} m`,
      sample: [180],
    },
  },

  /** The 3D-building theme: its name, its ramp, and what it refuses to paint. */
  theme: {
    label: { fr: 'Autorisations d’urbanisme', en: 'Planning permits' },
    unknown: {
      fr: (radius) => `hors du rayon de ${radius} m, ou sans dossier`,
      en: (radius) => `outside the ${radius} m radius, or with no file`,
      note: 'The scan is a 400 m disc; the volumes are a box up to 53.8 km². '
        + 'The two reasons a volume is unpainted are different sentences (A4).',
      sample: [400],
    },
    filed: { fr: 'Déposé ou en instruction', en: 'Filed or under review' },
    filedBlurb: {
      fr: 'Le dossier est encore au guichet et peut encore faire l’objet d’un recours. '
        + 'Publié seulement par Paris, Bordeaux et Nantes : ailleurs cette classe est vide '
        + 'parce que le registre national ne contient que des permis déjà accordés.',
      en: 'The file is still at the counter and can still be appealed. '
        + 'Published only by Paris, Bordeaux and Nantes: elsewhere this class is empty '
        + 'because the national register holds nothing but permits already granted.',
    },
    granted: { fr: 'Accordé, chantier non ouvert', en: 'Granted, site not opened' },
    grantedBlurb: {
      fr: 'Autorisé, et aucune ouverture de chantier n’est remontée. Le bâtiment peint '
        + 'est celui qui existe aujourd’hui, pas celui que le permis décrit.',
      en: 'Authorized, and no site opening has been reported. The building painted '
        + 'is the one standing today, not the one the permit describes.',
    },
    started: { fr: 'Chantier ouvert', en: 'Site opened' },
    startedBlurb: {
      fr: 'Les travaux ont commencé sur ce volume.',
      en: 'Work has started on this volume.',
    },
    completed: { fr: 'Travaux achevés', en: 'Work completed' },
    completedBlurb: {
      fr: 'Achèvement déclaré. Le volume BD TOPO peut être antérieur aux travaux : '
        + 'la peinture dit qu’un dossier s’est terminé ici, pas que le levé l’a vu.',
      en: 'Completion declared. The BD TOPO volume may predate the work: '
        + 'the paint says a file ended here, not that the survey saw it.',
    },
    refused: { fr: 'Refusé ou annulé', en: 'Refused or canceled' },
    refusedBlurb: {
      fr: 'Le dossier a existé, le projet non. Peint parce que « rien ne changera ici » '
        + 'est une information sur le bâtiment ; la classe garde sa propre teinte et n’est '
        + 'pas fondue dans les volumes sans dossier.',
      en: 'The file existed, the project did not. Painted because “nothing will change here” '
        + 'is information about the building; the class keeps its own tint and is not '
        + 'merged into the volumes with no file.',
    },
    unpublished: { fr: 'État non publié', en: 'State not published' },
    unpublishedBlurb: {
      fr: 'Ni Sitadel ni le portail n’a publié d’état pour ce dossier. Le marqueur est '
        + 'dessiné, le volume ne l’est pas : ce gris est à ΔE 11 du gris de « refusé ou '
        + 'annulé » et une toiture peinte ne pourrait pas les distinguer.',
      en: 'Neither Sitadel nor the portal published a state for this file. The marker is '
        + 'drawn, the volume is not: this gray sits at ΔE 11 from the gray of “refused or '
        + 'canceled”, and a painted roof could not tell them apart.',
    },
  },

  /** The one sentence the toggle row adds when the theme is on. */
  ledger: {
    newBuild: {
      fr: (files) => `${files} en construction neuve`,
      en: (files) => `${files} on new construction`,
      sample: ['12'],
    },
    land: {
      fr: (files) => `${files} permis d’aménager`,
      en: (files) => `${files} development permits`,
      sample: ['3'],
    },
    noState: {
      fr: (files) => `${files} sans état publié`,
      en: (files) => `${files} with no published state`,
      sample: ['7'],
    },
    unplaced: {
      fr: (files) => `${files} sans coordonnée`,
      en: (files) => `${files} with no coordinate`,
      sample: ['2'],
    },
    head: {
      fr: (offered, total) => `${offered} des ${total} dossiers peignent le bâti 3D`,
      en: (offered, total) => `${offered} of ${total} files paint the 3D buildings`,
      sample: ['36', '58'],
    },
    inferred: {
      fr: (inferred) => ` (dont ${inferred} sur nature non publiée)`,
      en: (inferred) => ` (${inferred} of them on an unpublished nature)`,
      sample: ['9'],
    },
    held: {
      fr: (reasons) => ` · retenus : ${reasons}`,
      en: (reasons) => ` · held back: ${reasons}`,
      sample: ['12 on new construction, 2 with no coordinate'],
    },
    line: {
      fr: (head, tail) => `${head}${tail} · compte des volumes peints sur la ligne Bâti 3D`,
      en: (head, tail) => `${head}${tail} · the count of volumes painted is on the 3D buildings row`,
      note: 'A number that lives on another row is worse than no number when '
        + 'nobody knows where it is.',
      sample: ['36 of 58 files paint the 3D buildings', ''],
    },
  },
});
