/**
 * Proper nouns that stay French inside English text.
 *
 * The machine-readable half of `docs/GLOSSARY.md` (section "Never
 * translate"): the French detector accepts these verbatim in an English
 * string, so "Risks (Géorisques)" is English and "Risques" is not. Place names
 * are not listed here; the detector learns them from the data it is handed.
 *
 * Keep the categories and their order identical to the Markdown list —
 * `glossary.test.mjs` compares the two.
 */
export const PROPER_NOUNS = Object.freeze({
  product: Object.freeze(['Surplomb', 'Belvédère', 'God’s Eye View']),
  publicBodies: Object.freeze([
    'INSEE', 'IGN', 'Etalab', 'ADEME', 'BRGM', 'Cerema', 'Météo-France', 'SHOM', 'ANFR',
    'ARCEP', 'DGAC', 'SSMSI', 'Géorisques', 'Géoportail', 'Géoportail de l’urbanisme',
    'Géoplateforme', 'Ville de Paris', 'Eau de Paris', 'MENJ', 'DREES',
  ]),
  networks: Object.freeze([
    'RTE', 'Enedis', 'GRDF', 'GRTgaz', 'Teréga', 'ODRÉ', 'éCO2mix', 'SNCF', 'TER', 'TGV', 'RER',
    'Transilien', 'Île-de-France Mobilités', 'IDFM', 'Vélib’', 'Bison Futé',
  ]),
  datasets: Object.freeze([
    'data.gouv.fr', 'BD TOPO', 'BD ORTHO', 'LiDAR HD', 'Filosofi', 'Sitadel', 'FINESS', 'SIRENE',
    'BODACC', 'DECP', 'CASIAS', 'CANDHIS', 'Licence Ouverte',
  ]),
  places: Object.freeze(['Île-de-France', 'Métropole de Lyon', 'Gironde']),
});

/** Every proper noun, flat, longest first so a multi-word name wins over its parts. */
export const PROPER_NOUN_LIST = Object.freeze(
  [...new Set(Object.values(PROPER_NOUNS).flat())].sort((a, b) => b.length - a.length || a.localeCompare(b)),
);
