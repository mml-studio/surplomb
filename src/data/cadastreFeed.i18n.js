/**
 * Strings of `src/data/cadastreFeed.js` — the cadastral parcels (PCI vecteur)
 * and what a line on a fiscal plan is allowed to claim.
 *
 * TWO AREAS, TWO WORDS, AND THEY ARE NOT THE SAME MEASUREMENT. The
 * *contenance* is the area the DGFiP has REGISTERED for a parcel; the *tracé*
 * is what the published polygon encloses. 7.2% of parcels disagree by more
 * than 5%, so the card prints both and never averages them — in English,
 * *registered area* and *drawn*.
 *
 * `vite.config.js` imports this module's PROJECTION for `/api/cadastre`, never
 * the card lines below: they are composed in a browser, which has a locale.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The four scale bands, coarsest tolerance last. The ramp runs cool to warm
   * with WIDENING TOLERANCE, not with quality: a 1:5000 sheet over the Landes
   * is a sheet of a forest, not a worse sheet.
   */
  bands: {
    fine: {
      label: { fr: 'Plan fin', en: 'Fine plan' },
      blurb: {
        fr: 'Levé au 1:250 ou 1:500 — centres urbains denses. Trait ±0,13 à 0,25 m.',
        en: 'Surveyed at 1:250 or 1:500 — dense city centers. Line ±0.13 to 0.25 m.',
      },
    },
    urban: {
      label: { fr: 'Plan urbain', en: 'Urban plan' },
      blurb: {
        fr: 'Levé au 1:1000 — villes et bourgs. Trait ±0,5 m.',
        en: 'Surveyed at 1:1000 — towns and villages. Line ±0.5 m.',
      },
    },
    rural: {
      label: { fr: 'Plan rural', en: 'Rural plan' },
      blurb: {
        fr: 'Levé au 1:2000 ou 1:2500 — campagne cultivée. Trait ±1 à 1,25 m.',
        en: 'Surveyed at 1:2000 or 1:2500 — farmed countryside. Line ±1 to 1.25 m.',
      },
    },
    extensive: {
      label: { fr: 'Plan étendu', en: 'Extensive plan' },
      blurb: {
        fr: 'Levé au 1:4000 ou 1:5000 — forêt, montagne, grandes propriétés. Trait ±2 à 2,5 m.',
        en: 'Surveyed at 1:4000 or 1:5000 — forest, mountain, large estates. Line ±2 to 2.5 m.',
      },
    },
    unknown: {
      label: { fr: 'Échelle inconnue', en: 'Scale unknown' },
      blurb: {
        fr: 'Feuille non jointe, ou échelle hors des quatre bandes. La tolérance reste calculée dès que l\'échelle est publiée.',
        en: 'Sheet not joined, or a scale outside the four bands. The tolerance is still computed as soon as the scale is published.',
      },
    },
  },

  /** The decimal separator of a number this module formats by hand. */
  decimalPoint: {
    fr: ',',
    en: '.',
    note: 'A `toFixed()` result is re-pointed rather than re-formatted, so the '
      + 'French keeps the bytes it printed before ICU rounding could differ.',
  },
  signedPercent: {
    fr: (signed) => `${signed} %`,
    en: (signed) => `${signed}%`,
    note: 'The sign is already on the number (`+223`, `−0,32`).',
    sample: ['+223'],
  },
  tolerance: {
    fr: (metres) => `±${metres} m`,
    en: (metres) => `±${metres} m`,
    sample: ['0.25'],
  },

  /** The parcel's own name, and the ground it sits on. */
  parcel: {
    titled: {
      fr: (section, number) => `Parcelle ${section} ${number}`,
      en: (section, number) => `Parcel ${section} ${number}`,
      sample: ['AP', '0045'],
    },
    numbered: {
      fr: (number) => `Parcelle ${number}`,
      en: (number) => `Parcel ${number}`,
      sample: ['0045'],
    },
    untitled: { fr: 'Parcelle', en: 'Parcel' },
    unknownCommune: { fr: 'Commune inconnue', en: 'Unknown municipality' },
    communeCode: {
      fr: (commune, code) => `${commune} · INSEE ${code}`,
      en: (commune, code) => `${commune} · INSEE ${code}`,
      sample: ['Paris 1st', '75101'],
    },
  },

  /** Which plan drew this boundary, at what scale, and when. */
  sheet: {
    named: {
      fr: (section, feuille) => `Feuille ${section} ${feuille}`,
      en: (section, feuille) => `Sheet ${section} ${feuille}`,
      sample: ['AP', '01'],
    },
    untitled: { fr: 'Feuille', en: 'Sheet' },
    noScale: {
      fr: (sheet) => `${sheet} · échelle non publiée`,
      en: (sheet) => `${sheet} · scale not published`,
      sample: ['Sheet AP 01'],
    },
    scaled: {
      fr: (sheet, scale) => `${sheet} au ${scale}`,
      en: (sheet, scale) => `${sheet} at ${scale}`,
      sample: ['Sheet AP 01', '1:500'],
    },
    edition: {
      fr: (sheet, scale, edition) => `${sheet} au ${scale} · édition ${edition}`,
      en: (sheet, scale, edition) => `${sheet} at ${scale} · edition ${edition}`,
      sample: ['Sheet AP 01', '1:500', '2026-06-01'],
    },
  },

  /** How much slack the line carries, and where that figure comes from. */
  toleranceLine: {
    unknown: {
      fr: 'Tolérance non calculable — échelle du plan inconnue',
      en: 'Tolerance cannot be computed — the plan’s scale is unknown',
    },
    known: {
      fr: (tolerance, pen) => `Trait de plan ${tolerance} (${pen} mm à l'échelle)`,
      en: (tolerance, pen) => `Plan line ${tolerance} (${pen} mm at plan scale)`,
      note: 'The assumption is ON the line: a reader who sees ±0.25 m with no '
        + 'provenance takes it for a surveyed figure.',
      sample: ['±0.25 m', '0.5'],
    },
  },

  /** The two areas, always both, never one derived from the other. */
  area: {
    noContenance: { fr: 'Contenance non publiée', en: 'Registered area not published' },
    zeroContenance: {
      fr: 'Contenance déclarée 0 m² — valeur publiée telle quelle',
      en: 'Registered area declared 0 m² — published exactly as it came',
    },
    contenance: {
      fr: (surface) => `Contenance déclarée ${surface}`,
      en: (surface) => `Registered area ${surface}`,
      note: 'The *contenance* is what the DGFiP has on file, not a survey.',
      sample: ['153 m²'],
    },
    drawnDisagreeing: {
      fr: (surface, gap) => `Tracé ${surface} — ${gap} contre la contenance`,
      en: (surface, gap) => `Drawn ${surface} — ${gap} against the registered area`,
      sample: ['494 m²', '+223%'],
    },
    drawnAgreeing: {
      fr: (surface, gap) => `Tracé ${surface} (${gap})`,
      en: (surface, gap) => `Drawn ${surface} (${gap})`,
      sample: ['26.59 ha', '−0.32%'],
    },
    drawn: {
      fr: (surface) => `Tracé ${surface}`,
      en: (surface) => `Drawn ${surface}`,
      sample: ['185 m²'],
    },
  },

  /** What the row says while a box is loading, refused or empty. */
  status: {
    tooHigh: {
      fr: (altitude) => `Zoome sous ${altitude} m pour charger le parcellaire`,
      en: (altitude) => `Zoom in below ${altitude} m to load the parcels`,
      sample: ['3,000'],
    },
    offCoverage: {
      fr: 'Hors couverture PCI vecteur (France et DROM)',
      en: 'Outside PCI vecteur coverage (mainland France and the overseas departments)',
    },
    tooDense: {
      fr: 'Vue trop dense pour une réponse complète — zoome',
      en: 'View too dense for a complete answer — zoom in',
    },
    tooDenseCounted: {
      fr: (count, limit) => `${count} parcelles ici — au-delà des ${limit} qu'Api Carto renvoie. Zoome.`,
      en: (count, limit) => `${count} parcels here — past the ${limit} Api Carto returns. Zoom in.`,
      sample: ['15,977', '5,000'],
    },
    empty: {
      fr: 'Aucune parcelle ici — domaine public, ou hors de France',
      en: 'No parcel here — public land, or outside France',
    },
    loading: { fr: 'Parcelles Api Carto…', en: 'Api Carto parcels…' },
  },
});
