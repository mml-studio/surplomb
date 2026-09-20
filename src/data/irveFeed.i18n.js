/**
 * Strings of src/data/irveFeed.js — the five power bands a charge point is
 * classed into, the band for a power outside any real envelope, and the five
 * connector types the register publishes a column for.
 *
 * WHAT STAYS FRENCH, because it is the register's own vocabulary and this
 * module runs on the SERVER: the values of `condition_acces`,
 * `implantation_station` and `accessibilite_pmr`. They are the schema's legal
 * values, matched on their ASCII skeleton and carried on the record; the
 * browser labels them when it draws a card (`irveFrance.i18n.js`).
 *
 * THE POWER CLASSES, and why these English words. The trade's own ladder is
 * slow / fast / rapid / ultra-rapid, which has four rungs for France's five
 * and puts `accélérée` and `rapide` on one word. The classes here are named
 * by their ceiling instead, exactly as the French names them, so the key and
 * the card can be read against the kW they carry.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  bands: {
    lente: { fr: 'Lente (≤ 7,4 kW)', en: 'Slow (≤ 7.4 kW)' },
    normale: { fr: 'Normale (≤ 22 kW)', en: 'Standard (≤ 22 kW)' },
    accelere: { fr: 'Accélérée (≤ 50 kW)', en: 'Accelerated (≤ 50 kW)' },
    rapide: { fr: 'Rapide (≤ 150 kW)', en: 'Fast (≤ 150 kW)' },
    hpc: { fr: 'Haute puissance (> 150 kW)', en: 'High power (> 150 kW)' },
    inconnue: {
      fr: 'Puissance inconnue',
      en: 'Power unknown',
      note: 'A published value outside any real envelope — never "unusable", which describes our parser rather than the station.',
    },
  },

  /**
   * The connector columns. Four of the five are international names and do
   * not move; `Prise E/F` is the French domestic socket and `Autre` is the
   * register's catch-all column.
   */
  connectors: {
    type2: { fr: 'Type 2', en: 'Type 2' },
    ccs: { fr: 'Combo CCS', en: 'Combo CCS' },
    chademo: { fr: 'CHAdeMO', en: 'CHAdeMO' },
    ef: { fr: 'Prise E/F', en: 'Type E/F socket' },
    autre: { fr: 'Autre', en: 'Other' },
  },
});
