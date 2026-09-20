/**
 * Strings of `src/data/georisquesFeed.js` — the Géorisques projection.
 *
 * ONE CATALOG, TWO READERS, AND ONLY ONE OF THEM HAS A LOCALE.
 * `projectGeorisques()` runs on the server (`vite.config.js` imports it for
 * `/api/georisques`), and a server has no language by design. So the
 * projection keeps publishing the French words it always published — read
 * straight off this catalog's definition, never off a locale — while the
 * browser labels the KEY beside them: the radon CLASS (1 to 3) rather than
 * its sentence, and the `named: false` flag rather than the placeholder.
 * Same seam as `rnbPivot.js`.
 *
 * The three radon sentences are word for word the ones `adresseRadiographie`
 * already publishes (`RADON_LABELS` there): the Address X-ray and the
 * Géorisques card read the same class from the same scan, and two different
 * wordings of class 2 would read as two different measurements.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * Radon potential classes, in the IRSN vocabulary Géorisques republishes.
 * Keyed by the class number the API returns, so `labelFor` can read it.
 */
export const RADON_CLASSES = defineMessages({
  1: { fr: 'Potentiel radon faible', en: 'Low radon potential' },
  2: { fr: 'Potentiel radon faible à moyen', en: 'Low to medium radon potential' },
  3: { fr: 'Potentiel radon significatif', en: 'Significant radon potential' },
});

export default defineMessages({
  unnamedEstablishment: {
    fr: 'Établissement sans raison sociale',
    en: 'Establishment with no company name',
    note: 'The ICPE register answered without a `raisonSociale`. The site exists; '
      + 'only its name is missing, which is why the row is kept rather than dropped.',
  },
});
