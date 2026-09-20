/**
 * Strings of src/data/datasetsCatalog.js — the two console warnings a broken
 * `datasets/*.json` produces at boot.
 *
 * They never reach the panel: a manifest that does not validate is simply not
 * registered, and `datasetsCatalog.test.mjs` fails the build before anyone
 * sees one. They are addressed to the contributor who wrote the file, which is
 * why they name the file and the faults rather than apologizing.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  ignored: {
    fr: (file, faults) => `[datasets] ${file} ignoré : ${faults}`,
    en: (file, faults) => `[datasets] ${file} skipped: ${faults}`,
    note: '`faults` is the joined list `datasetManifestFaults()` returned.',
    sample: ['../../datasets/defibrillateurs-geodae.json', '`id` manquant'],
  },
  duplicateId: {
    fr: (file, id) => `[datasets] ${file} ignoré : id « ${id} » déjà pris`,
    en: (file, id) => `[datasets] ${file} skipped: id “${id}” already taken`,
    sample: ['../../datasets/copie.json', 'defibrillateurs-geodae'],
  },
});
