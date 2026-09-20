/**
 * Strings of `src/data/weekHourCursor.js` — the hour of the typical week.
 *
 * ONE LINE, AND IT HAS TO AGREE WITH THREE LAYERS.
 * The cursor is shared by `comptages-fr`, `velo-pulse-fr` and `idfm-network`,
 * so the words it prints must be the words those layers print. The day comes
 * from {@link module:i18n/format.weekdayName} rather than from a table here,
 * because {@link WEEK_HOUR_DAYS} is a DATA key (it has to stay equal to
 * `IDFM_FREQ_DAYS`, the column names of the published profile file) and a data
 * key is not a label. The hour follows `comptagesRhythm.i18n.js`: `08 h` in
 * French, `08:00` in English, the 24-hour clock the glossary fixes.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The cursor in words, for a tooltip or a row label.
   *
   * `day` arrives already named (`mardi` / `Tuesday`) and `hour` already
   * padded to two digits, because the two halves are written in a different
   * order in other languages and a message places words, it does not format.
   */
  cursor: {
    fr: (day, hour) => `${day} ${hour} h`,
    en: (day, hour) => `${day} ${hour}:00`,
    sample: ['Tuesday', '08'],
    note: 'Tooltip of the shared typical-week cursor: “mardi 08 h” / “Tuesday 08:00”.',
  },
});
