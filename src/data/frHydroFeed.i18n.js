/**
 * Strings of src/data/frHydroFeed.js — the register's five hydro
 * technologies, each with the one clause that says what the machine does,
 * and the bucket a row with no usable technology falls into.
 *
 * The KEYS of `technologies` are the register's own values ("Fil de l'eau",
 * `Eclusée` without its accent, and the rest): data, looked up, never read.
 * The English words are the glossary's — *run-of-river*, *pondage*,
 * *reservoir*, *pumped storage* — and each keeps its explaining clause,
 * because "pondage" tells an English reader as little as "éclusée" tells a
 * French one.
 *
 * This module also runs in `scripts/build-fr-hydro-registry.mjs`, which
 * resolves no locale; nothing here is read there.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  technologies: {
    "Fil de l'eau": {
      label: { fr: "Fil de l'eau", en: 'Run-of-river' },
      blurb: {
        fr: 'elle turbine le débit qui se présente, sans rien mettre en réserve',
        en: 'it turbines whatever flow arrives, holding nothing back',
      },
    },
    Eclusée: {
      label: { fr: 'Éclusée', en: 'Pondage' },
      blurb: {
        fr: 'sa retenue tient quelques heures à quelques jours de production',
        en: 'its pond holds a few hours to a few days of generation',
      },
    },
    Lac: {
      label: { fr: 'Lac', en: 'Reservoir' },
      blurb: {
        fr: 'l’eau est stockée des mois et turbinée quand la demande grimpe',
        en: 'water is held for months and released when demand climbs',
      },
    },
    'Pompage turbinage': {
      label: { fr: 'Pompage-turbinage', en: 'Pumped storage' },
      blurb: {
        fr: 'elle remonte l’eau dans un lac haut aux heures creuses, et la turbine à la pointe',
        en: 'it pumps water back up to a high reservoir off-peak and turbines it at peak',
      },
    },
    'Hydrolien fluvial': {
      label: { fr: 'Hydrolien fluvial', en: 'In-stream turbine' },
      blurb: {
        fr: 'une turbine immergée dans le courant, sans barrage ni conduite',
        en: 'a turbine submerged in the current, with no dam and no penstock',
      },
    },
  },

  /** The bucket for a row whose technology this layer refuses to colour. */
  unpublished: { fr: 'Non publiée', en: 'Not published' },
});
