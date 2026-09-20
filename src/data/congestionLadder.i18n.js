/**
 * The four words of `src/data/congestionLadder.js` — see docs/i18n/CONVENTIONS.md.
 *
 * They are one vocabulary read by two layers (`traffic`, `road-status-fr`) on
 * one fused row, so they are translated ONCE here: a reader who sees two
 * blocks under one colour must read one word for one rung in either language.
 *
 * The English names movement, not method, exactly as the French does:
 * `Free-flowing` is not "fast", `Jammed` is not "dense", and `Impassable` is a
 * road that cannot be driven at all — DATEX's `impossible`, the rung only the
 * declared-state layer ever reaches.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  free: { fr: 'Fluide', en: 'Free-flowing' },
  slow: { fr: 'Ralenti', en: 'Slow' },
  jam: { fr: 'Bloqué', en: 'Jammed' },
  impassable: { fr: 'Impraticable', en: 'Impassable' },
});
