/**
 * The two ANFR tables a reader meets, in both languages.
 *
 * `anfrFeed.js` itself stays dependency-free and French: it runs inside the
 * `/api/anfr-fr` proxy, in Node, where there is no locale by design. What it
 * writes into a payload are the register's OWN values — `En service`,
 * `Projet approuvé` — and those are matched, stored and never rewritten. This
 * file is how the browser reads one back out.
 *
 * THE STATUS THAT GETS MISREAD. *Techniquement opérationnel* is a system the
 * operator has switched on and has not declared in service: it radiates. That
 * is the whole reason the table exists, so the English says it too.
 *
 * THE BAND LADDER IS ORDERED LOWEST CLAIM FIRST, and the words carry the
 * claim: `4G au plus` / `4G at best` is not `4G en service`. Counted over the
 * 72,700 supports, by the newest generation that actually radiates there:
 * 5G 50,148 · 4G 18,698 · 3G 127 · 2G 89 · approved project 3,638.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/** What one of ANFR's three `statut` values means, keyed on the value. */
export const ANFR_STATUS_LABELS = defineMessages({
  'En service': { fr: 'En service', en: 'In service' },
  'Techniquement opérationnel': {
    fr: 'Techniquement opérationnel — allumé, pas déclaré en service',
    en: 'Technically operational — switched on, not declared in service',
  },
  'Projet approuvé': {
    fr: 'Projet approuvé — autorisé, pas construit',
    en: 'Approved project — authorized, not built',
  },
});

/** The five rungs of the colour ladder, lowest claim first. */
export const ANFR_BAND_LABELS = defineMessages({
  projet: {
    fr: 'Projet approuvé — rien n’émet',
    en: 'Approved project — nothing transmits',
  },
  '2g': { fr: '2G seule', en: '2G only' },
  '3g': { fr: '3G au plus', en: '3G at best' },
  '4g': { fr: '4G au plus', en: '4G at best' },
  '5g': { fr: '5G en service', en: '5G in service' },
});

export default ANFR_BAND_LABELS;
