/**
 * @module interDigits
 *
 * Three figures of Inter, as outlines — the companion of `interCapitals.js`
 * for a mark whose code is a number rather than a letter.
 *
 * WHY ONLY THREE. The one caller is the aircraft-noise layer, whose PGS zones
 * the register publishes as `1`, `2` and `3`, written on a badge beside the
 * PEB's `A`–`D`. A figure joins this table when a caller needs it; a table of
 * ten with seven unused would be weight in a chunk that never draws them.
 *
 * WHY OUTLINES. The reason `interCapitals.js` gives, unchanged: a glyph
 * rasterised from a data URI resolves no `@font-face`, so a `<text>` element
 * would fall back to whatever the platform has.
 *
 * Extracted with fontkit 2 from `ofl/inter/Inter[opsz,wght].ttf` (google/fonts)
 * at `wght 700, opsz 14` on 2026-09-21 — the instance `interCapitals.js`
 * records. The same extraction run reproduced that module's stored `A` byte
 * for byte, which is the check that the two tables are one typeface: same
 * 2048-unit em, same 1490-unit cap height, so a figure is placed with
 * `interOutlineMarkup` exactly as a capital is.
 *
 * @see licenses/inter/NOTICE
 */

/** @type {Readonly<Record<string, Readonly<{cx:number, d:string}>>>} */
export const INTER_DIGITS = Object.freeze({
  1: Object.freeze({ cx: 421, d: 'M749 1490L749 0L444 0L444 1221L434 1221L93 979L93 1259L422 1490Z' }),
  2: Object.freeze({ cx: 644, d: 'M124 0L124 220L652 715Q720 781 766.5 834.5Q813 888 837.5 939.5Q862 991 862 1051Q862 1118 832 1166Q802 1214 750 1240Q698 1266 631 1266Q562 1266 510 1238Q458 1210 430 1158Q402 1106 402 1033L110 1033Q110 1178 176.5 1285.5Q243 1393 361 1451.5Q479 1510 633 1510Q791 1510 909 1453.5Q1027 1397 1092.5 1298Q1158 1199 1158 1070Q1158 987 1125.5 906Q1093 825 1009.5 724.5Q926 624 773 484L548 262L548 251L1178 251L1178 0Z' }),
  3: Object.freeze({ cx: 663.5, d: 'M659 -20Q497 -20 371.5 35.5Q246 91 173.5 190Q101 289 99 418L406 418Q409 362 442.5 320.5Q476 279 533 256Q590 233 660 233Q734 233 790 258.5Q846 284 878 330Q910 376 910 437Q910 499 876.5 546Q843 593 781 619.5Q719 646 632 646L494 646L494 873L632 873Q705 873 760 898.5Q815 924 846.5 968.5Q878 1013 878 1073Q878 1131 851 1174Q824 1217 775.5 1241.5Q727 1266 662 1266Q597 1266 543 1242.5Q489 1219 456 1177Q423 1135 422 1077L128 1077Q130 1204 200.5 1302Q271 1400 392 1455Q513 1510 664 1510Q817 1510 932 1454Q1047 1398 1110.5 1303Q1174 1208 1174 1092Q1174 967 1096.5 883Q1019 799 895 775L895 764Q1003 750 1077.5 703Q1152 656 1190 583Q1228 510 1228 417Q1228 291 1155 192Q1082 93 953.5 36.5Q825 -20 659 -20Z' }),
});
