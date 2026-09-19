/**
 * The national scale — how a value measured at an address becomes a rank
 * and, only sometimes, a letter.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 * The site report can already say “4,210 residents, average standard of
 * living €22,400/yr, 1.04 km² reachable on foot in ten minutes”. A reader who
 * discovers these three numbers has no way of knowing whether that is a lot.
 * What Cityscan sells is not the measurement, it is the POSITION of the
 * measurement in the country — the score out of 100 and the letter A→E. This
 * module is the position.
 *
 * ── WHAT A LETTER COSTS, AND WHY IT WAS NOT FREE ────────────────────────────
 * Saying “A” presupposes knowing the national distribution of the indicator.
 * No published source exists for “the area reachable on foot in ten minutes
 * from where French people live”: that distribution only exists if someone
 * MEASURES it. `scripts/build-bareme-fr.mjs` measures it, on a national sample
 * of residents drawn at random in proportion to population, running on each
 * of them exactly the composition the report runs on the reader's address.
 * The scales below come from there and from nowhere else.
 *
 * ── THE TRAP THIS MODULE EXISTS TO REFUSE ───────────────────────────────────
 * `filosofiFeed.js` already carries `FILOSOFI_RAMPS`, national quantiles of
 * the same indicators. Reusing them here would have been free and WRONG: they
 * are the quantiles of a 200 m grid CELL, and the report computes a weighted
 * mean over the ~30 cells of a ten-minute ring. Averaging thirty cells
 * flattens both tails — the same argument `build-filosofi-ramp.mjs` makes
 * against INSEE's individual deciles, one level up. Scoring a ring value
 * against a cell scale gives a plausible and wrong letter, and nothing on
 * screen would say so. Hence `geometry` on every scale and on every call: a
 * geometry that does not match does not produce a letter, it produces a named
 * refusal. The measured gap between the two scales is reported in
 * `BAREME_SAMPLE.ecartCarreau`.
 *
 * ── WHY SO FEW INDICATORS CARRY A LETTER ────────────────────────────────────
 * A letter is a JUDGMENT: it requires knowing in which direction the
 * indicator is “good”. For the area reachable on foot, nobody disputes the
 * direction. For the share of social housing, the share of owner-occupiers,
 * the residents' age or the price per m², the direction depends entirely on
 * who is asking — a high price is good news for a seller and bad news for a
 * buyer. Cityscan decides anyway and does not say on whose behalf. Here, an
 * indicator with no defensible direction carries `direction: null`: it gets
 * its national rank, never a letter. Adding a letter later is a decision to
 * write into `direction`, not a machine to build.
 *
 * ── THE LETTER IS ITSELF A RANGE ────────────────────────────────────────────
 * A percentile read off a sample of a few hundred draws carries a sampling
 * error of about three points in the middle of the distribution. A value that
 * lands at 61% is therefore not “B” rather than “C”, it is “B or C”.
 * `scoreIndicator()` returns the range and a `ferme` (firm) flag; the card
 * prints a bare letter only when it is firm. It is the same move as the
 * population range in `implantationFeed.js`, applied to the rank rather than
 * to the count.
 *
 * Pure, dependency-free and free of side effects.
 *
 * @module data/baremeNational
 */

/**
 * The quantiles at which every scale is read.
 *
 * Eleven points rather than the five of `FILOSOFI_RAMPS`, because a color
 * scale has six bands to bound while a rank has a hundred positions to
 * interpolate: between p50 and p90 a five-point scale forces a straight line
 * across forty percentiles, and the rank handed to the reader would be the
 * line's, not the country's. Bounded at p05/p95 and not at p01/p99: on a few
 * hundred draws, the hundredth point of the tail rests on three observations
 * and measures nothing but the draw.
 */
export const BAREME_LADDER_Q = Object.freeze([
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95,
]);

/**
 * The measurement geometries, and why they are a join key.
 *
 * Two numbers with the same unit and the same name are only comparable if
 * they were measured over the same shape. “€22,400/yr” read on a 200 m grid
 * cell and “€22,400/yr” averaged over a ten-minute ring are two different
 * measurements; comparing them is the silent failure this module makes
 * impossible. The geometry therefore travels with the scale AND with the call.
 */
export const BAREME_GEOMETRIES = Object.freeze({
  /** 600 s walking ring, IGN isochrone — the shape the report draws. */
  RING_FOOT_600: 'ring-foot-600',
  /** 300 m disc — the radius the DVF layer sweeps. */
  DISC_300: 'disc-300',
  /** INSEE 200 m grid cell — the geometry of `FILOSOFI_RAMPS`, not ours. */
  CARREAU_200: 'carreau-200',
});

/**
 * The letter boundaries, as a score out of 100.
 *
 * Quintiles, and nothing cleverer: A is the best fifth of France, E the
 * worst. It is the convention Cityscan borrowed from the DPE, and it has the
 * merit of being checkable — a reader can ask “how many French people are in
 * A” and the answer is “one in five, by construction”. A non-uniform cut
 * (A = the top 10%) is defensible too, but it must then be displayed, or the
 * letter lies about its own rarity.
 */
export const BAREME_LETTER_FLOORS = Object.freeze([
  Object.freeze({ letter: 'A', floor: 80 }),
  Object.freeze({ letter: 'B', floor: 60 }),
  Object.freeze({ letter: 'C', floor: 40 }),
  Object.freeze({ letter: 'D', floor: 20 }),
  Object.freeze({ letter: 'E', floor: 0 }),
]);

/**
 * The refusal reasons, named.
 *
 * A named refusal is half the product: “no scale for this indicator” and
 * “scale measured on another shape” are two different sentences, and a
 * reader deserves the second rather than a dash.
 *
 * FALLING OFF THE SCALE IS NOT A REFUSAL and so has no reason here. A value
 * above the highest measured point is perfectly scorable — it is even the
 * easiest one to score — it is only known from one side, which `beyond` says
 * separately.
 */
export const BAREME_REASONS = Object.freeze({
  NO_REFERENCE: 'aucune échelle nationale pour cet indicateur',
  GEOMETRY: 'échelle mesurée sur une autre géométrie',
  NOT_A_NUMBER: 'aucune valeur à situer',
  NO_DIRECTION: 'pas de sens défendable — rang seulement, sans lettre',
});

/**
 * What the report knows how to place, and on whose behalf.
 *
 * The table of CHOICES, kept apart from the table of MEASUREMENTS
 * (`BAREME_FR`) just below. The measurement script rewrites only the second;
 * the direction of an indicator is an editorial decision and is reviewed in a
 * diff.
 *
 * `direction`:
 *   `'up'`   — the more there is, the better, from the named point of view;
 *   `'down'` — the less there is, the better;
 *   `null`   — no defensible direction: national rank, never a letter.
 */
export const BAREME_INDICATORS = Object.freeze([
  Object.freeze({
    id: 'acces',
    short: 'accès à pied',
    label: 'Surface atteignable à pied',
    unit: 'km² en 10 min',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: 'up',
    round: 0.01,
    // The only indicator on this list whose direction is not up for debate.
    // More ground reachable in a ten-minute walk means more of everything on
    // it, for any reader. It is also a measure of the street grid — a
    // cul-de-sac subdivision and a village center at the same density do not
    // give the same area.
    directionNote: 'Sens non contesté : plus de sol accessible à pied est plus '
      + 'd’accès, pour tout lecteur.',
  }),
  Object.freeze({
    id: 'niveau',
    short: 'niveau de vie',
    label: 'Niveau de vie du voisinage',
    unit: '€/an par personne',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: 'up',
    round: 100,
    // THE DISPUTABLE CHOICE OF THIS MODULE, written here rather than implied.
    // It is the convention of an address X-ray sold to someone buying a home
    // to live in, and it is the proxy the market itself uses. A social
    // housing operator, a discount store or a landlord would turn it upside
    // down — and they would be right. The card therefore names the point of
    // view next to the letter instead of presenting it as a property of the
    // place.
    directionNote: 'Point de vue du résident acheteur, et lui seul. Un bailleur '
      + 'social ou une enseigne discount liraient l’échelle à l’envers.',
  }),
  Object.freeze({
    id: 'pauvrete',
    short: 'pauvreté',
    label: 'Ménages sous le seuil de pauvreté',
    unit: '% des ménages',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: 'down',
    round: 0.1,
    directionNote: 'Même point de vue, et donc même réserve, que le niveau de vie.',
  }),
  Object.freeze({
    id: 'habitants',
    short: 'habitants',
    label: 'Habitants dans l’anneau',
    unit: 'habitants',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 10,
    directionNote: 'La densité est une préférence, pas une qualité : elle est '
      + 'la clientèle d’un commerce et le bruit d’un riverain.',
  }),
  Object.freeze({
    id: 'menages',
    short: 'ménages',
    label: 'Ménages dans l’anneau',
    unit: 'ménages',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 10,
    directionNote: 'Même raison que les habitants : un nombre de ménages est '
      + 'une clientèle ou une pression, selon qui lit.',
  }),
  Object.freeze({
    id: 'social',
    short: 'logement social',
    label: 'Logement social',
    unit: '% des ménages',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 0.1,
    // Refusing the letter here is a choice, not an oversight. A share of
    // social housing is the result of a public policy; scoring it amounts to
    // scoring the policy, and an E stuck on a social-housing neighborhood is
    // exactly the use this module does not want to make easy.
    directionNote: 'Résultat d’une politique publique, pas une qualité du lieu — '
      + 'rang seulement.',
  }),
  Object.freeze({
    id: 'jeunes',
    short: 'moins de 18 ans',
    label: 'Moins de 18 ans',
    unit: '% des habitants',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 0.1,
    directionNote: 'La part d’enfants décrit qui habite là, pas si le lieu est '
      + 'bon : elle est une école pleine et une cour bruyante à la fois.',
  }),
  Object.freeze({
    id: 'aines',
    short: '65 ans et plus',
    label: '65 ans et plus',
    unit: '% des habitants',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 0.1,
    directionNote: 'La part d’aînés décrit qui habite là. Elle est du calme pour '
      + 'les uns et un marché qui se retire pour les autres.',
  }),
  Object.freeze({
    id: 'solo',
    short: 'personnes seules',
    label: 'Personnes seules',
    unit: '% des ménages',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 0.1,
    directionNote: 'Vivre seul n’est ni bien ni mal ; c’est une structure de '
      + 'ménages, et elle se lit différemment selon ce qu’on vient y faire.',
  }),
  Object.freeze({
    id: 'proprietaires',
    short: 'propriétaires',
    label: 'Propriétaires',
    unit: '% des ménages',
    geometry: BAREME_GEOMETRIES.RING_FOOT_600,
    direction: null,
    round: 0.1,
    directionNote: 'La part de propriétaires est une stabilité pour un riverain '
      + 'et un marché fermé pour un agent. Rang seulement.',
  }),
  Object.freeze({
    id: 'prixM2',
    short: 'prix au m²',
    label: 'Prix médian au m²',
    unit: '€/m²',
    geometry: BAREME_GEOMETRIES.DISC_300,
    direction: null,
    round: 10,
    // The textbook case of a direction that depends on the reader, and the
    // reason `direction` exists: a high price is good news for whoever sells
    // and bad news for whoever buys. The rank answers both.
    directionNote: 'Bonne nouvelle pour un vendeur, mauvaise pour un acheteur — '
      + 'la même mesure, deux lectures.',
  }),
]);

/** @type {Object<string, object>} */
const INDICATOR_BY_ID = Object.freeze(Object.fromEntries(
  BAREME_INDICATORS.map((indicator) => [indicator.id, indicator]),
));

/** An indicator's declaration, or null. */
export function resolveIndicator(id) {
  return INDICATOR_BY_ID[String(id ?? '').trim()] || null;
}

/**
 * THE MEASURED SCALES. Rewritten by `npm run bareme:fr`; everything else in
 * this file is a choice, this block is a measurement.
 *
 * Eleven values per indicator: p05, p10, p20, p30, p40, p50, p60, p70, p80,
 * p90, p95 of the distribution AMONG FRENCH RESIDENTS — “30% of French people
 * have less than this”, not “30% of municipalities”. The draw carries the
 * weighting, not the computation.
 *
 * `measured` is the number of rings that could answer, and it does not always
 * equal `BAREME_SAMPLE.rings`: 151 rings out of 1,200 had no comparable sale
 * within their 300 m, so the price scale describes a France more urban than
 * France. The card says so when it uses it.
 */
export const BAREME_FR = Object.freeze({
  acces: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([0.32, 0.38, 0.46, 0.53, 0.59, 0.65, 0.69, 0.75, 0.82, 0.9, 0.95]) }),
  niveau: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([15_700, 17_200, 18_900, 19_800, 20_800, 21_600, 22_500, 23_600,
      25_200, 28_100, 31_100]) }),
  pauvrete: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([4.3, 5.5, 7.3, 9.2, 11, 12.7, 14.8, 17.2, 21.2, 26.8, 33.5]) }),
  habitants: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([50, 90, 250, 490, 800, 1290, 2050, 3200, 5150, 9340, 15_520]) }),
  menages: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([20, 40, 100, 200, 340, 570, 880, 1400, 2210, 4090, 6970]) }),
  social: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([0, 0, 0, 1.2, 5.1, 9.4, 14.2, 21.7, 31.8, 46.6, 60.9]) }),
  jeunes: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([14, 16.1, 18.1, 19.6, 21.1, 22.1, 23.5, 24.8, 26.4, 29.1, 31.2]) }),
  aines: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([8.7, 10.4, 13, 14.6, 16.1, 17.9, 19.4, 21.2, 23.4, 28.2, 32.5]) }),
  solo: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([15.8, 18.4, 22, 25.3, 28.6, 31.9, 34.8, 38.8, 42.9, 49.1, 52.7]) }),
  proprietaires: Object.freeze({ geometry: 'ring-foot-600', measured: 1200,
    ladder: Object.freeze([22.5, 30.1, 37.9, 44.7, 51.3, 60.4, 67.4, 74.1, 80.2, 86.5, 90.5]) }),
  prixM2: Object.freeze({ geometry: 'disc-300', measured: 1049,
    ladder: Object.freeze([970, 1280, 1660, 1940, 2230, 2530, 2930, 3400, 3960, 5280, 7350]) }),
});

/**
 * The campaign: what it cost, what it covers and what it is worth.
 *
 * `marginPt` is the half-width of the sampling error in the middle of the
 * distribution, `2·√(0.25/n)` in percentile points. It is published here
 * because the card prints it: a rank without its uncertainty invites reading
 * a 61st percentile as a fact rather than as an estimate.
 *
 * `refusals` is empty, and that is information: all 1,200 draws got a ring, a
 * complete grid and a non-zero population. The first campaign, by contrast,
 * refused sixteen times in a row on La Réunion — see the CRS comment in
 * `implantationFeed.js`.
 */
export const BAREME_SAMPLE = Object.freeze({
  measuredAt: '2026-09-08',
  rings: 1200,
  drawn: 1200,
  marginPt: 2.9,
  frameCells: 377_234,
  framePeople: 64_089_848,
  frameBuiltAt: '2026-09-08',
  seconds: 600,
  dvfRadiusM: 300,
  seed: 20260908,
  refusals: Object.freeze({}),
  /**
   * The same indicators measured PER 200 m GRID CELL, on the same sample.
   *
   * Published because it is the numerical proof that this module could not
   * borrow `FILOSOFI_RAMPS`. A ring's interdecile range is **74% of a cell's**
   * on average over the seven shared indicators — averaging thirty-odd cells
   * pulls both tails in. The consequence is not academic: scored on the cell
   * scale, a ring sitting at the national 10th percentile climbs to the 22nd,
   * and a ring at the 90th drops to the 84th. That is a whole letter band at
   * both ends, and nothing on screen would have said so.
   */
  ecartCarreau: Object.freeze({
    interdecileRatio: 0.74,
    p10ReadAt: 22,
    p50ReadAt: 53,
    p90ReadAt: 84,
    carreau: Object.freeze({
      niveau: Object.freeze([14_400, 16_000, 18_200, 19_600, 20_900, 21_900, 22_900, 24_300,
        26_200, 29_400, 32_900]),
      pauvrete: Object.freeze([0, 2.2, 5, 7.1, 9.3, 11.7, 14.3, 17.6, 22.4, 30.4, 37.6]),
      social: Object.freeze([0, 0, 0, 0, 0, 0, 0, 10.8, 31.8, 67.3, 91.5]),
      jeunes: Object.freeze([10, 13.2, 15.8, 18, 19.8, 21.6, 23.5, 25.6, 28.4, 32.3, 35.4]),
      aines: Object.freeze([4.6, 6.9, 10, 12.9, 15.3, 17.7, 20, 22.5, 26.2, 32.1, 40]),
      solo: Object.freeze([7.3, 12.3, 17.9, 22, 26.5, 30.7, 34.7, 39.3, 44.4, 51.7, 57.1]),
      proprietaires: Object.freeze([5.6, 16.9, 32.3, 44.6, 57.1, 66.7, 75.9, 82.8, 88, 93.3,
        96.8]),
    }),
  }),
});

/**
 * The letter for a score out of 100.
 * @param {number} note
 * @returns {string|null}
 */
export function letterFor(note) {
  if (!Number.isFinite(note)) return null;
  const clamped = Math.max(0, Math.min(100, note));
  for (const band of BAREME_LETTER_FLOORS) {
    if (clamped >= band.floor) return band.letter;
  }
  return BAREME_LETTER_FLOORS.at(-1).letter;
}

/**
 * Where a value falls on a scale, as a range of quantiles.
 *
 * THREE CASES, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 *   i.   the value falls strictly between two points of the scale: we
 *        interpolate, and the range is a single point;
 *   ii.  the value EQUALS one or more points of the scale. This is the case of
 *        floored indicators — the share of social housing is 0 across the
 *        whole bottom of the distribution — and it has no point answer: 0% is
 *        “somewhere in the first third”, not “at the 14th percentile”.
 *        Interpolating here invents a precision the data refuses, and it is
 *        the easiest way to lie with a scale;
 *   iii. the value falls off the bottom or the top: the range is open up to
 *        the bound, and `beyond` says on which side.
 *
 * @param {number} value
 * @param {number[]} ladder Values, ascending, one per entry of `BAREME_LADDER_Q`.
 * @param {number[]} [quantiles]
 * @returns {{low: number, high: number, beyond: ('below'|'above'|null)}|null}
 *   `low`/`high` as a 0..1 fraction.
 */
export function ladderBracket(value, ladder, quantiles = BAREME_LADDER_Q) {
  if (!Number.isFinite(value)) return null;
  if (!Array.isArray(ladder) || ladder.length !== quantiles.length) return null;
  const points = ladder.map((v, i) => ({ v: Number(v), q: quantiles[i] }))
    .filter((p) => Number.isFinite(p.v));
  if (!points.length) return null;

  if (value < points[0].v) return { low: 0, high: points[0].q, beyond: 'below' };
  const last = points.at(-1);
  if (value > last.v) return { low: last.q, high: 1, beyond: 'above' };

  let lowIndex = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].v < value) lowIndex = i; else break;
  }
  let highIndex = points.length;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].v > value) highIndex = i; else break;
  }
  // An exact tie with at least one point leaves a gap between `lowIndex` and
  // `highIndex`: that is the plateau, and it is returned as is.
  if (highIndex - lowIndex > 1) {
    return {
      low: lowIndex < 0 ? 0 : points[lowIndex].q,
      high: highIndex >= points.length ? 1 : points[highIndex].q,
      beyond: null,
    };
  }
  const a = points[lowIndex];
  const b = points[lowIndex + 1];
  const span = b.v - a.v;
  const q = span > 0 ? a.q + ((value - a.v) / span) * (b.q - a.q) : a.q;
  return { low: q, high: q, beyond: null };
}

/**
 * The sampling error of a percentile, in points.
 *
 * The standard deviation of a proportion, `sqrt(p(1-p)/n)`, because a value's
 * percentile IS a proportion: the share of the sample below it. Two standard
 * deviations on each side, so about 95%. On the campaign's 1,200 draws, that
 * makes ±2.9 points in the middle of the distribution and ±1.3 at the
 * extremes — enough to make a letter uncertain as soon as a value approaches
 * a quintile boundary, which the card must say rather than decide.
 *
 * @param {number} q Fraction 0..1.
 * @param {number} n Sample size.
 * @returns {number} Half-width, in percentile points.
 */
export function percentileMarginPt(q, n) {
  if (!Number.isFinite(q) || !Number.isFinite(n) || n <= 0) return 0;
  const p = Math.max(0, Math.min(1, q));
  return 2 * Math.sqrt((p * (1 - p)) / n) * 100;
}

/**
 * Place a value in the country.
 *
 * ALWAYS returns an object, never null and never an exception: an indicator
 * that could not be placed is a card row that says why, not a missing row.
 * `reason` is the refusal; `beyond` is not one — a value above the highest
 * measured point is perfectly scorable, it is just known from one side only.
 *
 * @param {string} id
 * @param {number|null} value
 * @param {{geometry?: string, bareme?: object, sampleSize?: number}} [options]
 *   `geometry` is the shape the CALLER measured on. It is compared with the
 *   scale's, and a missing comparison is the bug this parameter exists to make
 *   impossible.
 * @returns {object}
 */
export function scoreIndicator(id, value, options = {}) {
  const {
    geometry = null,
    bareme = BAREME_FR,
    sampleSize = BAREME_SAMPLE.rings,
  } = options;
  const indicator = resolveIndicator(id);
  const base = {
    id: String(id ?? ''),
    label: indicator?.label ?? null,
    short: indicator?.short ?? null,
    unit: indicator?.unit ?? null,
    value: Number.isFinite(value) ? value : null,
    geometry: indicator?.geometry ?? null,
    direction: indicator?.direction ?? null,
    directionNote: indicator?.directionNote ?? null,
    percentile: null,
    percentileLow: null,
    percentileHigh: null,
    note: null,
    letter: null,
    letterLow: null,
    letterHigh: null,
    ferme: false,
    beyond: null,
    reason: null,
  };
  const scale = bareme?.[base.id] ?? null;
  if (!indicator || !scale || !Array.isArray(scale.ladder)) {
    return { ...base, reason: BAREME_REASONS.NO_REFERENCE };
  }
  if (!Number.isFinite(value)) return { ...base, reason: BAREME_REASONS.NOT_A_NUMBER };
  // THE COMPARISON THAT JUSTIFIES THE WHOLE MODULE. A caller that does not say
  // which shape it measured on gets no rank: silence is not agreement, it is
  // the absence of the only check that counts.
  if (geometry !== indicator.geometry) {
    return { ...base, reason: BAREME_REASONS.GEOMETRY };
  }

  const bracket = ladderBracket(value, scale.ladder);
  if (!bracket) return { ...base, reason: BAREME_REASONS.NO_REFERENCE };

  const margin = percentileMarginPt((bracket.low + bracket.high) / 2, sampleSize);
  const low = Math.max(0, bracket.low * 100 - margin);
  const high = Math.min(100, bracket.high * 100 + margin);
  const mid = (low + high) / 2;
  // The direction flips the score, never the percentile: the percentile stays
  // the position in the country — “30% of French people have less” means the
  // same thing for a poverty rate as for an income — and the score alone
  // carries the judgment.
  const orient = (p) => (indicator.direction === 'down' ? 100 - p : p);
  const noteLow = indicator.direction ? Math.min(orient(low), orient(high)) : null;
  const noteHigh = indicator.direction ? Math.max(orient(low), orient(high)) : null;
  const letterLow = indicator.direction ? letterFor(noteLow) : null;
  const letterHigh = indicator.direction ? letterFor(noteHigh) : null;

  return {
    ...base,
    percentile: Math.round(mid),
    percentileLow: Math.round(low),
    percentileHigh: Math.round(high),
    note: indicator.direction ? Math.round(orient(mid)) : null,
    // The bare letter only exists if both ends of the range fall in the same
    // band. Otherwise the card prints “B or C”, and that is the truth.
    letter: letterLow && letterLow === letterHigh ? letterLow : null,
    letterLow,
    letterHigh,
    ferme: Boolean(letterLow) && letterLow === letterHigh,
    beyond: bracket.beyond,
    reason: indicator.direction
      ? null
      : BAREME_REASONS.NO_DIRECTION,
  };
}
