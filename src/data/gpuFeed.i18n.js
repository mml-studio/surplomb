/**
 * Strings of `src/data/gpuFeed.js` — the Géoportail de l'urbanisme projection.
 *
 * ONE CATALOG, TWO READERS, AND ONLY ONE OF THEM HAS A LOCALE. `projectGpu()`
 * runs on the server too (`vite.config.js` imports it for `/api/gpu`), and the
 * server has no language by design. So the projection keeps publishing the
 * French sentence in each easement's `label` — the words it always published,
 * read straight off this catalog's definition — and the browser relabels the
 * SUP CODE at draw time with {@link import('./gpuFeed.js').supTypeLabel}.
 *
 * The keys are the national SUP nomenclature's own codes (`ac1`, `pm1`, `t5`…),
 * lowercased as the register publishes them: they are DATA, and they are what a
 * card, a share link and a cache all carry in either language.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The national easement nomenclature, in the words a buyer would use.
 *
 * Only the families that actually change a purchase decision are spelled out.
 * A code this table does not know keeps its own code on screen — an easement
 * nobody has named is still an easement, and hiding it would be worse.
 */
export default defineMessages({
  ac1: {
    fr: 'Abords d\'un monument historique',
    en: 'Historic monument protection zone',
    note: 'The 500 m perimeter around a listed monument, where the architect of '
      + 'the Bâtiments de France has a say on every permit.',
  },
  ac2: { fr: 'Site inscrit ou classé', en: 'Registered or classified site' },
  ac4: {
    fr: 'Secteur sauvegardé / site patrimonial remarquable',
    en: 'Conservation area / remarkable heritage site',
  },
  as1: { fr: 'Protection d\'un captage d\'eau potable', en: 'Drinking-water catchment protection' },
  i1: { fr: 'Canalisation d\'hydrocarbures', en: 'Hydrocarbon pipeline' },
  i3: { fr: 'Canalisation de gaz', en: 'Gas pipeline' },
  i4: { fr: 'Ligne électrique', en: 'Power line' },
  int1: { fr: 'Voisinage d\'un cimetière', en: 'Cemetery vicinity' },
  pm1: {
    fr: 'Plan de prévention des risques (naturels ou technologiques)',
    en: 'Risk prevention plan (natural or technological)',
  },
  pm3: { fr: 'Risque technologique', en: 'Technological risk' },
  pt1: { fr: 'Protection d\'une station radioélectrique', en: 'Radio station protection' },
  pt2: { fr: 'Protection d\'un faisceau hertzien', en: 'Microwave beam protection' },
  pt3: { fr: 'Réseau de télécommunication', en: 'Telecommunications network' },
  t1: { fr: 'Voie ferrée — zone de protection', en: 'Railway — protection strip' },
  t4: { fr: 'Servitude aéronautique de balisage', en: 'Aeronautical marking easement' },
  t5: {
    fr: 'Servitude aéronautique de dégagement (aérodrome)',
    en: 'Aeronautical clearance easement (airfield)',
  },
  t7: {
    fr: 'Servitude aéronautique hors dégagement',
    en: 'Aeronautical easement other than clearance',
  },
  ep1: { fr: 'Alignement de voirie', en: 'Street alignment' },
});
