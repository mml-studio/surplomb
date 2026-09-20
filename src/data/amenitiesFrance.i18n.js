/**
 * Strings of src/data/amenitiesFrance.js — the Everyday amenities layer.
 *
 * THREE REGIMES, THREE SENTENCES. The layer draws a national choropleth, a
 * thinned national mesh, or the exact dots of one view, and each one owes the
 * reader a different admission: the choropleth that its share is computed on
 * five BPE families only, the mesh that what is on screen is a SAMPLE and not
 * an inventory, the exact regime how many rows the proxy's cap kept back.
 * None of those may soften in English — a map that does not say it is thinned
 * is claiming France holds 1,100 amenities.
 *
 * A CARD LINE IS A PUBLISHED VALUE OR A STATED ABSENCE. Three of them exist
 * only because the dot alone would mislead: the multiplicity (one address with
 * 146 GPs is one dot), the position precision (a dot on the right street is
 * not a dot at the right number), and the register (a pharmacy comes from
 * FINESS and the supermarket beside it from the BPE, geocoded by other
 * people). The English says the same three things.
 *
 * The family words are not here: they are in `amenitiesFamilies.i18n.js`, and
 * the blurb behind each swatch is in `amenitiesFeed.i18n.js`, both shared with
 * the Address X-ray.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** The card of one selected dot. */
  card: {
    fallbackTitle: { fr: 'Équipement', en: 'Amenity' },
    fallbackPlural: { fr: 'équipements', en: 'amenities' },
    meshDot: {
      fr: 'Point du maillage — zoomer pour la fiche complète',
      en: 'Mesh point — zoom in for the full card',
      note: 'A thinned dot carries a family and a precision and nothing else; saying so '
        + 'is what stops the empty half of the card reading as a gap in the register.',
    },
    atThisAddress: {
      fr: (count, headWord) => `${count} ${headWord} à cette adresse`,
      en: (count, headWord) => `${count} ${headWord} at this address`,
      note: '`plural` is the family head-word of `amenitiesFamilies.i18n.js`.',
      sample: ['146', 'general practitioners'],
    },
    andMore: {
      fr: (count) => `· et ${count} autres`,
      en: (count) => `· and ${count} more`,
      sample: ['142'],
    },
    unnamed: {
      fr: (count) => `· ${count} sans raison sociale publiée`,
      en: (count) => `· ${count} with no published business name`,
      sample: ['3'],
    },
    noName: {
      fr: 'Raison sociale non diffusée',
      en: 'Business name not published',
    },
    position: {
      fr: (band) => `Position : ${band}`,
      en: (band) => `Position: ${band}`,
      note: '`band` is one of the four precision bands of `amenitiesFeed.i18n.js`.',
      sample: ['Street number found on a certain street'],
    },
    positionWarned: {
      fr: (band) => `⚠ Position : ${band}`,
      en: (band) => `⚠ Position: ${band}`,
      note: 'The warning glyph is the layer’s own sign that the register did not vouch '
        + 'for this dot’s position.',
      sample: ['Probable street'],
    },
    distance: {
      fr: (distance) => `Distance à l’adresse : ${distance}`,
      en: (distance) => `Distance to the address: ${distance}`,
      sample: ['120 m'],
    },
    geocoding: {
      fr: (geocoder, score) => `Géocodage ${geocoder} — score ${score}/100`,
      en: (geocoder, score) => `Geocoding ${geocoder} — score ${score}/100`,
      sample: ['ATLASANTE', '96'],
    },
    reprojected: {
      fr: (crs) => `Coordonnées reprojetées depuis ${crs}`,
      en: (crs) => `Coordinates reprojected from ${crs}`,
      sample: ['EPSG:5490'],
    },
    uai: {
      fr: (uai) => `UAI ${uai} — aussi dans schools-fr / sup-fr`,
      en: (uai) => `UAI ${uai} — also in schools-fr / sup-fr`,
      note: 'UAI is the education ministry’s establishment key; the layer ids are not translated.',
      sample: ['0690123A'],
    },
    finess: {
      fr: (ids) => `FINESS ${ids}`,
      en: (ids) => `FINESS ${ids}`,
      sample: ['010000024'],
    },
    registerFiness: {
      fr: 'FINESS — ARS / Agence du Numérique en Santé',
      en: 'FINESS — ARS / Agence du Numérique en Santé',
      note: 'The two bodies behind the health facility register; both are proper nouns.',
      keep: ['Agence du Numérique en Santé'],
    },
    registerBpe: {
      fr: 'Base permanente des équipements 2025 — Insee',
      en: 'Permanent database of amenities (BPE) 2025 — Insee',
    },
  },

  /** The card of one selected department, under the national choropleth. */
  departement: {
    coverage: {
      fr: (share, covered, communes) => `${share} % des communes équipées — ${covered} sur ${communes}`,
      en: (share, covered, communes) => `${share}% of municipalities served — ${covered} of ${communes}`,
      sample: ['84.2', '267', '317'],
    },
    noCommune: {
      fr: 'Aucune commune rattachée à ce polygone',
      en: 'No municipality attached to this polygon',
    },
    drawn: {
      fr: (count) => `${count} équipements dessinés`,
      en: (count) => `${count} amenities drawn`,
      sample: ['12,481'],
    },
    familyCount: {
      fr: (count, headWord) => `${count} ${headWord}`,
      en: (count, headWord) => `${count} ${headWord}`,
      sample: ['1,204', 'bakeries'],
    },
    blindSpot: {
      fr: 'Part calculée sur les 5 familles de la BPE : FINESS ne publie pas de code commune.',
      en: 'Share computed on the 5 BPE families only: FINESS publishes no municipality code.',
      note: 'The ratio’s own blind spot, stated where the ratio is read.',
    },
  },

  /** The choropleth's own name, on the Cesium data source. */
  choroplethName: {
    fr: 'Équipements du quotidien — part des communes équipées',
    en: 'Everyday amenities — share of municipalities served',
  },

  /** When the department outlines cannot be had at all. */
  departementShapesUnavailable: {
    fr: 'département polygons unavailable',
    en: 'department polygons unavailable',
    note: 'Shown as the row’s error. The French said “département”; the English word is '
      + '“department”, and the glossary allows it.',
  },

  /** The one chip: put every family back. */
  chips: {
    all: { fr: 'Tout', en: 'All' },
    allTitle: {
      fr: (count) => `Redessiner les ${count} familles`,
      en: (count) => `Draw all ${count} families again`,
      sample: [13],
    },
  },

  /** The line under the layer's toggle — what this view actually contains. */
  status: {
    loadingMesh: { fr: 'lecture du maillage national...', en: 'reading the national mesh...' },
    loadingNational: { fr: 'lecture du registre national...', en: 'reading the national register...' },
    loadingLocal: { fr: 'lecture du registre...', en: 'reading the register...' },
    empty: { fr: 'aucun équipement dans cette vue', en: 'no amenity in this view' },
    sampled: {
      fr: (drawn, inView, n) => `${drawn} ${plural(n, 'tracé', 'tracés')} sur ${inView} dans la vue — échantillon par famille`,
      en: (drawn, inView, n) => `${drawn} drawn of ${inView} in view — sampled per family`,
      note: 'Naming both numbers is the whole contract of the mesh regime. `n` is the raw '
        + 'count, for the French agreement; `drawn` is the same number already written.',
      sample: ['1,100', '53,121', 1100],
    },
    inView: {
      fr: (count) => `${count} équipements dans la vue`,
      en: (count) => `${count} amenities in view`,
      sample: ['842'],
    },
    nationalShare: {
      fr: (share, communes) => `${share} % des ${communes} communes équipées`,
      en: (share, communes) => `${share}% of ${communes} municipalities served`,
      sample: ['61.4', '34,877'],
    },
    nationalSpread: {
      fr: (amenities, departements) => `${amenities} équipements sur ${departements} départements`,
      en: (amenities, departements) => `${amenities} amenities across ${departements} departments`,
      sample: ['494,283', '96'],
    },
    unpainted: {
      fr: (count) => `${count} hors métropole non peints`,
      en: (count) => `${count} outside mainland France, not painted`,
      note: 'The choropleth’s own blind spot, stated where the choropleth is read.',
      sample: ['9,211'],
    },
    count: {
      fr: (count) => `${count} équipements`,
      en: (count) => `${count} amenities`,
      sample: ['842'],
    },
    registerRows: {
      fr: (rows) => `${rows} lignes de registre`,
      en: (rows) => `${rows} register rows`,
      sample: ['1,204'],
    },
    notDrawn: {
      fr: (count) => `${count} reçus mais non tracés`,
      en: (count) => `${count} received but not drawn`,
      sample: ['312'],
    },
    overCap: {
      fr: (count) => `${count} au-delà du plafond de la réponse — dézoome pour le maillage`,
      en: (count) => `${count} beyond the answer’s cap — zoom out for the mesh`,
      note: 'The PROXY’s cap, a different number from the render cap, and the one that '
        + 'actually bites: the densest square France allows holds 53,121 dots and the '
        + 'proxy sends 12,000.',
      sample: ['41,121'],
    },
  },

  /** The key beside the choropleth ramp. */
  nationalLegend: {
    lowest: {
      fr: 'Le sixième le moins équipé. La part des communes du département où l’on trouve au moins un médecin, un commerce alimentaire, un bureau de poste, un bassin ou une gendarmerie.',
      en: 'The least-served sixth. The share of the department’s municipalities where you find at least a GP, a food store, a post office, a swimming pool or a gendarmerie.',
      keep: ['gendarmerie'],
    },
    other: {
      fr: 'Un sixième des 96 départements. Bins par quantile. Pharmacies et hôpitaux ne sont PAS dans ce ratio : FINESS ne publie pas de code commune.',
      en: 'One sixth of the 96 departments. Quantile classification. Pharmacies and hospitals are NOT in this ratio: FINESS publishes no municipality code.',
    },
  },

  /** The family rows, which are also the family switches. */
  legend: {
    off: {
      fr: 'Éteinte. Cliquez pour la rallumer — la vue est alors redemandée avec cette famille.',
      en: 'Switched off. Click to switch it back on — the view is then requested again with this family.',
    },
    sampled: {
      fr: (blurb, drawn, inView, n) => `${blurb} Échantillon : ${drawn} ${plural(n, 'tracé', 'tracés')} sur ${inView} dans la vue.`,
      en: (blurb, drawn, inView, n) => `${blurb} Sample: ${drawn} drawn of ${inView} in view.`,
      note: 'The mix on screen is NOT the mix in view — the thinning floors the rare '
        + 'families on purpose — so each family names its own sample.',
      sample: ['BPE B207 bakery and pastry shop, 50,122 rows.', '12', '204', 12],
    },
    doctorsElsewhere: {
      label: {
        fr: 'Médecins — dessinés par la couche Médecins',
        en: 'GPs — drawn by the Doctors layer',
      },
      blurb: {
        fr: 'Les 61 263 lignes D265 de la BPE ne sont pas dessinées tant que medecins-fr est allumé : '
          + 'il porte le registre conventionné, 64 232 adresses avec les noms, les spécialités et le '
          + 'secteur. Éteignez cette couche-là et la famille revient ici.',
        en: 'The BPE’s 61,263 D265 rows are not drawn while medecins-fr is on: that layer carries '
          + 'the health-insurance register, 64,232 addresses with the names, the specialties and '
          + 'the sector. Switch it off and the family comes back here.',
      },
    },
    hospitalsElsewhere: {
      label: {
        fr: 'Hôpitaux — dessinés par Santé & secours',
        en: 'Hospitals — drawn by Health & emergency services',
      },
      blurb: {
        fr: 'Les 2 211 établissements FINESS ont quitté cette couche le 15/09/2026 : ils sont sur « Santé & secours », '
          + 'avec les 64 232 adresses de praticiens, l’indicateur d’accès de la DREES et les défibrillateurs. '
          + 'Un hôpital n’est pas une course du quotidien.',
        en: 'The 2,211 FINESS establishments left this layer on Sep 15, 2026: they are on “Health & '
          + 'emergency services”, with the 64,232 practitioner addresses, the DREES accessibility '
          + 'indicator and the defibrillators. A hospital is not an everyday errand.',
      },
    },
    schoolsElsewhere: {
      label: { fr: 'Écoles — non dessinées ici', en: 'Schools — not drawn here' },
      blurb: {
        fr: 'Les 79 743 lignes « enseignement » de la BPE ne sont pas reprises : schools-fr dessine 68 158 établissements du registre du ministère (clé UAI, que la BPE n’a pas) et sup-fr 6 914 sites du supérieur.',
        en: 'The BPE’s 79,743 “education” rows are not taken up: schools-fr draws 68,158 establishments from the ministry’s register (keyed on UAI, which the BPE does not carry) and sup-fr 6,914 higher-education sites.',
      },
    },
  },
});
