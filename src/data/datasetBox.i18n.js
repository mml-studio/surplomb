/**
 * Strings of src/data/datasetBox.js — what the box says when a registration
 * cannot go through.
 *
 * Only the first one reaches a reader: `registerManifest()` throws it, `plug()`
 * lets it out, and the plug panel prints the message under the field. The
 * others are console lines for whoever is looking at a browser that restored a
 * dataset badly — they name the id and the cause, because a restore failure is
 * silent by construction.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  alreadyPlugged: {
    fr: (id) => `Un jeu « ${id} » est déjà branché`,
    en: (id) => `A dataset “${id}” is already plugged in`,
    note: 'Thrown, then shown: two manifests cannot share a layer id.',
    sample: ['defibrillateurs-geodae'],
  },
  catalogRefused: {
    fr: (id, detail) => `[datasets] catalogue : ${id} non enregistré — ${detail}`,
    en: (id, detail) => `[datasets] catalog: ${id} not registered — ${detail}`,
    note: 'A shipped `datasets/*.json` the running build refused.',
    sample: ['defibrillateurs-geodae', 'A dataset “defibrillateurs-geodae” is already plugged in'],
  },
  restoreRefused: {
    fr: (id, detail) => `[datasets] ${id} non restauré — ${detail}`,
    en: (id, detail) => `[datasets] ${id} not restored — ${detail}`,
    note: 'A dataset this browser plugged in an earlier session and cannot register now.',
    sample: ['ds-pharmacies', 'unknown source: wms'],
  },
});
