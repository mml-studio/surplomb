/**
 * Strings of `src/data/supFrance.js` — the higher-education sites, and the
 * departmental prisms they roll up into.
 *
 * THE PRISM'S TWO CHANNELS ARE NAMED HERE. `choroplethPrism.js` frames a
 * caller's variables without translating them — it writes `Hauteur — ${what
 * the layer measures}` — so the height's name, its unit, the rate's name and
 * the six class labels have to arrive already in the reader's language, which
 * is what `supPrismScale()` is for.
 *
 * The band, cycle and placement vocabulary is NOT here: it lives in
 * `supFeed.i18n.js`, next to the module that also runs on the server.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** What the prism's height and colour are called, in the shared key. */
  prism: {
    heightLabel: { fr: 'étudiants', en: 'students' },
    heightUnit: { fr: 'étudiants', en: 'students' },
    ratioLabel: {
      fr: 'part des étudiants à bac+4 et au-delà',
      en: 'share of students at year 4 and beyond',
    },
    ratioClassLabels: {
      fr: ['≤ 5 %', '5 – 10 %', '10 – 20 %', '20 – 30 %', '30 – 40 %', '> 40 %'],
      en: ['≤ 5%', '5 – 10%', '10 – 20%', '20 – 30%', '30 – 40%', '> 40%'],
    },
    /**
     * The shared height blurb ends with a promise this layer cannot keep —
     * that the COLOUR answers "compared with what?" — and `correctAerialClaim`
     * cuts it there. These are the two spellings to cut at.
     */
    claimCut: { fr: '— c’est la couleur', en: '— it is the color' },
    claimCutPlain: { fr: '— c\'est la couleur', en: '— it is the color' },
    correction: {
      fr: 'Sur cette couche la couleur ne corrige PAS ce biais : '
        + 'elle porte la part du bac+4 et non une densité. Le rapport surfacique est écrit '
        + 'en chiffres sur la fiche de chaque département (étudiants pour 1 000 km²).',
      en: 'On this layer the color does NOT correct that bias: '
        + 'it carries the share at year 4 and beyond, not a density. The per-area figure is '
        + 'written out on each department’s card (students per 1,000 km²).',
    },
  },

  /** The two bands whose name alone would not tell a reader what is in them. */
  kindBlurbs: {
    lycee: {
      fr: 'Aussi comptés dans « Écoles et lycées ».',
      en: 'Also counted under “Schools and high schools”.',
      note: 'It names the CHIP the reader pressed, not the taxonomy label, '
        + 'because the same address is drawn twice when both halves are on.',
    },
    autre: {
      fr: 'Surtout des CFA et organismes de formation.',
      en: 'Mostly apprenticeship centers (CFA) and training bodies.',
    },
  },

  /** One site's card. Every line is a published value or a stated absence. */
  site: {
    fallbackTitle: { fr: 'Établissement du supérieur', en: 'Higher-education institution' },
    public: { fr: 'public', en: 'public' },
    private: { fr: 'privé', en: 'private' },
    students: {
      fr: (students, rentree) => `${students} étudiants sur ce site${rentree}`,
      en: (students, rentree) => `${students} students on this site${rentree}`,
      note: '`rentree` is the academic-year suffix, or empty.',
      sample: ['12,000', ' — 2024 intake'],
    },
    rentree: {
      fr: (year) => ` — rentrée ${year}`,
      en: (year) => ` — ${year} intake`,
      sample: ['2024'],
    },
    cycle: {
      fr: (cycle, students) => `${cycle} ${students}`,
      en: (cycle, students) => `${cycle} ${students}`,
      sample: ['Master’s', '4,120'],
    },
    siteOf: {
      fr: (index, count, students) => `Site ${index} sur ${count} — ${students} étudiants au total`,
      en: (index, count, students) => `Site ${index} of ${count} — ${students} students in total`,
      note: 'Naming both numbers is what stops eleven Sorbonne dots reading as '
        + 'eleven universities — or as one university of 15,192 students.',
      sample: [3, 11, '15,192'],
    },
    unsited: {
      fr: (students) => `${students} étudiants sans site localisé dans ce registre`,
      en: (students) => `${students} students with no located site in this register`,
      sample: ['1,240'],
    },
    borrowed: {
      fr: (label) => `⚠ ${label}`,
      en: (label) => `⚠ ${label}`,
      sample: ['Position taken from the Parcoursup map'],
    },
    offer: {
      fr: (shown, rest) => `Parcoursup : ${shown}${rest}`,
      en: (shown, rest) => `Parcoursup: ${shown}${rest}`,
      keep: ['Licence Droit', 'Licence Économie'],
      note: 'Parcoursup programme names are published in French and relayed as they came.',
      sample: ['Licence Droit · Licence Économie', ' · +4 more'],
    },
    offerRest: {
      fr: (rest) => ` · +${rest} autres`,
      en: (rest) => ` · +${rest} more`,
      sample: [4],
    },
    uai: {
      fr: (uai) => `UAI ${uai}`,
      en: (uai) => `UAI ${uai}`,
      note: 'The national establishment number keeps its acronym.',
      sample: ['0751717J'],
    },
  },

  /** One department's card, at national altitude. */
  departement: {
    students: {
      fr: (students) => `${students} étudiants`,
      en: (students) => `${students} students`,
      sample: ['104,000'],
    },
    noStudents: {
      fr: 'Effectif étudiant non publié pour ce département',
      en: 'Enrolment not published for this department',
    },
    establishments: {
      fr: (etabs, sites) => `${etabs} établissements sur ${sites} sites`,
      en: (etabs, sites) => `${etabs} institutions on ${sites} sites`,
      sample: ['58', '96'],
    },
    advancedShare: {
      fr: (share) => `${share} % des étudiants à bac+4 et au-delà — la couleur du prisme`,
      en: (share) => `${share}% of students at year 4 and beyond — the prism’s color`,
      sample: ['42.7'],
    },
    noShare: {
      fr: 'Part à bac+4 non calculable ici : aucun cycle renseigné',
      en: 'Share at year 4 and beyond cannot be computed here: no cycle reported',
    },
    publicSites: {
      fr: (sites) => `${sites} sites publics`,
      en: (sites) => `${sites} public sites`,
      sample: ['120'],
    },
    privateSites: {
      fr: (sites) => `${sites} privés`,
      en: (sites) => `${sites} private`,
      sample: ['64'],
    },
    density: {
      fr: (students) => `${students} étudiants pour 1 000 km² — la hauteur ne le corrige pas`,
      en: (students) => `${students} students per 1,000 km² — the height does not correct for it`,
      note: 'The prism’s own blind spot, on the prism’s own card.',
      sample: ['18,400'],
    },
    ambient: {
      fr: (name, students) => `${name} · ${students}`,
      en: (name, students) => `${name} · ${students}`,
      keep: ['Gironde'],
      sample: ['Gironde', '104,000'],
    },
    ambientUnpublished: {
      fr: (name) => `${name} · non publié`,
      en: (name) => `${name} · not published`,
      keep: ['Lozère'],
      sample: ['Lozère'],
    },
  },

  /** The two legend rows this layer adds to the shared prism key. */
  legend: {
    covered: { fr: 'départements couverts', en: 'departments covered' },
    coveredBlurb: {
      fr: 'Un prisme par PARTIE dessinée : la Corse en lève deux, à la même hauteur, '
        + 'parce que la hauteur est celle du département et non celle de la partie. '
        + 'Deux prismes voisins ne s’additionnent jamais.',
      en: 'One prism per PART drawn: Corsica raises two, at the same height, '
        + 'because the height is the department’s and not the part’s. '
        + 'Two neighboring prisms never add up.',
    },
    offshore: { fr: 'hors métropole — aucun prisme', en: 'outside mainland France — no prism' },
    offshoreBlurb: {
      fr: (unassigned, total) => `${unassigned} étudiants sur `
        + `${total} sont sur des sites que les 96 polygones métropolitains `
        + 'ne peuvent pas contenir (La Réunion, Antilles, Guyane, Mayotte, Polynésie). '
        + 'Ils sont comptés et jamais déplacés : le prisme le plus proche est à 7 000 km.',
      en: (unassigned, total) => `${unassigned} students out of `
        + `${total} are on sites that the 96 mainland polygons `
        + 'cannot hold (La Réunion, Antilles, Guyane, Mayotte, Polynésie). '
        + 'They are counted and never moved: the nearest prism is 7,000 km away.',
      keep: ['La Réunion', 'Antilles', 'Guyane', 'Mayotte', 'Polynésie'],
      sample: ['84,000', '2,970,000'],
    },
  },

  /** The one line under the layer's toggle. */
  row: {
    loading: { fr: 'lecture du registre national...', en: 'reading the national register...' },
    national: {
      fr: (students, departements) => `${students} étudiants sur ${departements} départements`,
      en: (students, departements) => `${students} students across ${departements} departments`,
      sample: ['2,886,000', '96'],
    },
    offshore: {
      fr: (sites) => `${sites} sites hors métropole non cartographiés`,
      en: (sites) => `${sites} sites outside mainland France, not mapped`,
      sample: ['64'],
    },
    empty: {
      fr: 'aucun établissement du supérieur dans cette vue',
      en: 'no higher-education institution in this view',
    },
    sites: {
      fr: (sites) => `${sites} sites`,
      en: (sites) => `${sites} sites`,
      sample: ['240'],
    },
    students: {
      fr: (students) => `${students} étudiants`,
      en: (students) => `${students} students`,
      sample: ['104,000'],
    },
    undrawn: {
      fr: (sites) => `${sites} non tracés`,
      en: (sites) => `${sites} not drawn`,
      sample: ['3'],
    },
    detect: {
      fr: (students) => `${students} étudiants`,
      en: (students) => `${students} ${plural(students, 'student', 'students')}`,
      note: 'The DETECT callout takes the raw count, ungrouped, as it always did.',
      sample: [1200],
    },
  },

  /** What a failed departmental shape load says. */
  error: {
    shapes: {
      fr: 'département polygons unavailable',
      en: 'department polygons unavailable',
      note: 'The status string the row shows; it was already English.',
    },
  },

  /** The Cesium data source’s own name, which only a debugger reads. */
  sourceName: {
    fr: 'Enseignement supérieur — prismes départementaux',
    en: 'Higher education — departmental prisms',
  },
});
