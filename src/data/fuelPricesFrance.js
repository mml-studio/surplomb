/**
 * Fuel prices (FR) — every French filling station that declares its prices,
 * coloured by its diesel price by default, or by how far that price has come
 * down since the week of 24 to 30 October 2026.
 *
 * WHY THIS LAYER EXISTS. On 1 November 2026 the State began selling part of
 * its strategic diesel stocks at their historical cost, and announced a drop
 * of 12 to 18 cents a litre at the pump. Both halves of the question "did it
 * arrive here?" are public — every station's price, every ten minutes, and its
 * full history — and nothing draws them on a map. This does, one dot per
 * station, coloured by band (`fuelPricesFeed.js` holds the bands and the
 * reasons for their bounds).
 *
 * WHAT IT IS NOT. Not every station in France: only those selling at least
 * 500 m³ a year are required to declare (arrêté du 12 décembre 2006, art. 3),
 * 9 826 on 2026-11-23. The floor barely bites: the `amenities-fr` pack draws
 * 9 895 filling stations (Insee BPE 2025, code B316) over the same 96
 * départements, so the declaring stations are the near-whole of the network,
 * not a sample of it. And not the effect of the measure alone: the drop includes what the wholesale
 * market did over the same weeks, which the card says in one line.
 *
 * TWO READINGS. The drop above is why the layer was built; the layer OPENS on
 * the PRICE, though, because that is what every visitor can act on: one chip
 * per fuel the feed carries (« Gazole » to « GPL »), coloured by national
 * quintile, so the dots answer « where is it cheapest? », and « Baisse » last
 * in the row for the drop. Every line of the key is its own switch, as on the
 * amenities layer: unticking « En rupture » hides the stations that are out
 * of the fuel being read.
 *
 * THE WIRING is the bundled-pack loader (`localGeojson.js`), fed by
 * `loadFeatures` from `/api/fuel-fr/stations` instead of a file: the stems,
 * labels, culling and key card are the ones every local pack already has.
 * The reading is a `regroupParams` param, so switching it repaints the loaded
 * stations in place instead of reloading them.
 */
import { createLocalGeoJsonLayer } from './localGeojson.js';
import {
  FUEL_FR_ALL_BAND_KEYS,
  FUEL_FR_DEFAULT_VIEW,
  FUEL_FR_DROP_VIEW,
  FUEL_FR_FUELS,
  FUEL_FR_LAYER_ID,
  FUEL_FR_PRICE_BAND_KEYS,
  FUEL_FR_SHORTAGE_BAND,
  FUEL_FR_UNKNOWN_BAND,
  FUEL_FR_VIEWS,
  fuelInShortage,
  fuelPriceCutsByFuel,
  fuelStationProps,
  fuelViewBand,
  fuelViewBandKeys,
  normalizeFuelView,
} from './fuelPricesFeed.js';
import { formatDateTime, formatNumber } from '../i18n/format.js';
import messages from './fuelPricesFrance.i18n.js';

/**
 * Colour per band. The three drop bands are one hue climbing in lightness —
 * the bigger the drop, the brighter the dot, every rung in the light half so
 * none sinks into night imagery. "No drop yet" leaves that hue for amber: it
 * is the band a reader comes to find, and it must not read as the faint end
 * of the ramp. "Not measurable" is the house graphite.
 */
export const FUEL_FR_BAND_COLORS = Object.freeze({
  forte: '#a6f2cf',
  annoncee: '#4fd1a0',
  partielle: '#2aa585',
  aucune: '#ffb347',
  /*
   * The price readings: cheap is the drop reading's green, dear is a red, and
   * every rung sits in the light half, as above, so none sinks into night
   * imagery. A diverging ramp rather than one hue, because the reader's
   * question has two ends — « where do I fill up? » and « where not? ».
   */
  p1: '#4fd1a0',
  p2: '#b4e36c',
  p3: '#ffe066',
  p4: '#ffa94d',
  p5: '#ff6b6b',
  /** Shortage: off the ramp on purpose — it is not a price. */
  rupture: '#c4a7ff',
  inconnue: '#7c838e',
});

/** The bands drawn small: neither says anything about a price. */
const MINOR_BANDS = new Set([FUEL_FR_UNKNOWN_BAND, FUEL_FR_SHORTAGE_BAND]);

const BAND_STYLES = Object.freeze(Object.fromEntries(FUEL_FR_ALL_BAND_KEYS.map((key) => [
  key,
  Object.freeze({
    color: FUEL_FR_BAND_COLORS[key],
    pixelSize: MINOR_BANDS.has(key) ? 5 : 7,
    // A label is only worth reading at town scale: at 30 km over Bordeaux,
    // sixty of them covered the map (screenshot of 2026-11-23).
    cardMaxDistance: 20_000,
  }),
])));

const PRICE_FORMAT = Object.freeze({ minimumFractionDigits: 3, maximumFractionDigits: 3 });
const CUT_FORMAT = Object.freeze({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The national quintiles of every fuel, from the last load. Module state
 * because the loader asks `groupOf` for a band one feature at a time, and the
 * cuts are a property of the whole set.
 * @type {Record<string, Array<number>>}
 */
let _priceCuts = {};

/** Params of the row: the reading, and the bands unticked in the key. */
export const FUEL_FR_DEFAULT_PARAMS = Object.freeze({ vue: FUEL_FR_DEFAULT_VIEW, masquees: '' });

/**
 * The bands unticked in the key. `masquees` ASSIGNS the whole set — the key
 * line sends the set it would leave — so pressing the same line twice is two
 * different params, and a link that names one band hides that band only.
 * @param {object} params
 * @returns {Set<string>}
 */
export function fuelHiddenBands(params) {
  return new Set(String(params?.masquees ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => FUEL_FR_ALL_BAND_KEYS.includes(key)));
}

/**
 * The `masquees` value pressing one key line sends.
 * @param {Set<string>} hidden
 * @param {string} key
 * @returns {string}
 */
function toggledHidden(hidden, key) {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return FUEL_FR_ALL_BAND_KEYS.filter((band) => next.has(band)).join(',');
}

/** The fuel a reading is about: diesel for the drop. */
function viewFuel(view) {
  return view === FUEL_FR_DROP_VIEW ? 'gazole' : view;
}

function fuelName(key) {
  return messages().fuels[key] || key;
}
const DROP_FORMAT = Object.freeze({ maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const WHEN_FORMAT = Object.freeze({
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
});

function priceText(value) {
  return Number.isFinite(value) ? messages().card.price(formatNumber(value, PRICE_FORMAT)) : '';
}

/** A drop of 23.4 c is printed as the CHANGE it is: −23,4 c. */
function changeText(dropCents) {
  return Number.isFinite(dropCents) ? messages().card.drop(formatNumber(-dropCents, DROP_FORMAT)) : '';
}

function stationTitle(props) {
  const m = messages().card;
  return [props.brand || m.station, props.city].filter(Boolean).join(' · ');
}

/**
 * The floating label and its details, close up. The label leads with what
 * the colour answers: the CHANGE under the drop reading, the PRICE of the
 * fuel read under a price reading.
 * @param {object} props
 * @param {{params?: object}} [context]
 * @returns {{title: string, details: string[]}}
 */
export function fuelCardCopy(props, { params } = {}) {
  const m = messages().card;
  const view = normalizeFuelView(params?.vue);
  if (view !== FUEL_FR_DROP_VIEW) {
    const price = props[view];
    return {
      title: [Number.isFinite(price) ? priceText(price) : '', props.brand || m.station].filter(Boolean).join(' · '),
      details: [],
    };
  }
  const lead = Number.isFinite(props.dropCents) ? changeText(props.dropCents) : priceText(props.gazole);
  return {
    title: [lead, props.brand || m.station].filter(Boolean).join(' · '),
    details: [priceText(props.gazole)].filter(Boolean),
  };
}

/**
 * Under a price reading the cheapest station wins its screen cell — its
 * label first, and above the globe-LOD height its dot too — so the prices a
 * reader sees without zooming are the lowest ones around. Under the drop
 * reading nothing changes.
 * @param {object} props
 * @param {object} params
 * @returns {number}
 */
export function fuelLabelPriority(props, params) {
  const view = normalizeFuelView(params?.vue);
  if (view === FUEL_FR_DROP_VIEW) return 0;
  const price = props?.[view];
  return Number.isFinite(price) ? Math.round((10 - price) * 1000) : 0;
}

/** Fuels the station is out of, named, or ''. */
function shortageText(props) {
  const names = FUEL_FR_FUELS
    .filter((fuel) => fuelInShortage(props.shortage, fuel.key))
    .map((fuel) => fuelName(fuel.key));
  return names.length ? messages().card.shortage(names.join(', ')) : '';
}

/**
 * The card in the map key, on click.
 * @param {object} props
 * @param {{id?: string}} [context]
 * @returns {object}
 */
export function fuelSelectionPanel(props, { id = '', params } = {}) {
  if (!props || typeof props !== 'object') return null;
  const m = messages().card;
  const view = normalizeFuelView(params?.vue);
  if (view !== FUEL_FR_DROP_VIEW) return fuelPricePanel(props, view, id);
  const lines = [];
  if (Number.isFinite(props.gazole)) {
    lines.push(m.gazoleNow(priceText(props.gazole), formatDateTime(props.gazoleAt, WHEN_FORMAT)));
  } else {
    lines.push(m.noGazole);
  }
  if (Number.isFinite(props.gazoleBefore)) lines.push(m.gazoleBefore(priceText(props.gazoleBefore)));
  else lines.push(m.noBefore);
  if (Number.isFinite(props.e10)) lines.push(m.e10(priceText(props.e10), changeText(props.e10DropCents)));
  if (Number.isFinite(props.dropCents)) lines.push(m.market);

  return {
    key: `fuel:${id || props.id}`,
    title: stationTitle(props),
    meta: [
      props.address,
      props.brand ? '' : m.independent,
      props.motorway ? m.motorway : '',
      shortageText(props),
    ].filter(Boolean),
    metric: Number.isFinite(props.dropCents)
      ? {
        value: changeText(props.dropCents),
        color: FUEL_FR_BAND_COLORS[props.band],
        caption: [m.dropCaption],
      }
      : null,
    lines,
    footnote: m.source,
    link: null,
  };
}

/**
 * The card of a station under a price reading: every fuel it sells, the one
 * read first, with the time it was declared.
 * @param {object} props
 * @param {string} view A fuel key.
 * @param {string} id
 * @returns {object}
 */
function fuelPricePanel(props, view, id) {
  const m = messages().card;
  const lines = [];
  const ordered = [view, ...FUEL_FR_FUELS.map((fuel) => fuel.key).filter((key) => key !== view)];
  for (const key of ordered) {
    if (!Number.isFinite(props[key])) continue;
    const name = fuelName(key);
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(m.fuelNow(label, priceText(props[key]), formatDateTime(props[`${key}At`], WHEN_FORMAT)));
  }
  if (!Number.isFinite(props[view])) lines.unshift(m.noFuel(fuelName(view)));
  const band = fuelViewBand(props, view, _priceCuts);
  return {
    key: `fuel:${id || props.id}`,
    title: stationTitle(props),
    meta: [
      props.address,
      props.brand ? '' : m.independent,
      props.motorway ? m.motorway : '',
      shortageText(props),
    ].filter(Boolean),
    metric: Number.isFinite(props[view])
      ? {
        value: priceText(props[view]),
        color: FUEL_FR_BAND_COLORS[band],
        caption: [m.priceCaption(fuelName(view))],
      }
      : null,
    lines,
    footnote: m.source,
    link: null,
  };
}

/**
 * The label and blurb of one band under one reading.
 * @param {string} key
 * @param {string} view
 * @param {Array<number>} cuts The fuel's quintile cuts.
 * @returns {{label: string, blurb: string}}
 */
function bandCopy(key, view, cuts) {
  const m = messages();
  const index = FUEL_FR_PRICE_BAND_KEYS.indexOf(key);
  if (index < 0) {
    if (key === FUEL_FR_UNKNOWN_BAND && view !== FUEL_FR_DROP_VIEW) {
      return { label: m.priceBands.noPrice.label, blurb: m.priceBands.noPrice.blurb };
    }
    return { label: m.bands[key].label, blurb: m.bands[key].blurb };
  }
  const cut = (value) => formatNumber(value, CUT_FORMAT);
  let label;
  if (cuts.length === 0) label = m.priceBands.noPrice.label;
  else if (index === 0) label = m.priceBands.first(cut(cuts[0]));
  else if (index >= cuts.length) label = m.priceBands.last(cut(cuts[cuts.length - 1]));
  else label = m.priceBands.middle(cut(cuts[index - 1]), cut(cuts[index]));
  let blurb = '';
  if (index === 0) blurb = m.priceBands.cheapest;
  else if (index >= cuts.length) blurb = m.priceBands.dearest;
  return { label, blurb };
}

/**
 * The key: one line per band of the reading, with its count. Each line is
 * its own switch (`toggle`, see `manager.js`): a line the reader unticked
 * stays, dimmed, so the same line brings it back.
 * @param {Map<string,{total:number, visible:number}>} tally
 * @param {object} [params]
 * @returns {Array<object>}
 */
export function fuelBandLegend(tally, params = FUEL_FR_DEFAULT_PARAMS) {
  const m = messages();
  const view = normalizeFuelView(params?.vue);
  const hidden = fuelHiddenBands(params);
  const cuts = _priceCuts[viewFuel(view)] || [];
  const legend = [{
    heading: true,
    label: view === FUEL_FR_DROP_VIEW ? m.views.dropHeading : m.views.heading(fuelName(view)),
  }];
  for (const key of fuelViewBandKeys(view)) {
    const bucket = tally instanceof Map ? tally.get(key) : tally?.[key];
    if (!bucket?.total) continue;
    const off = hidden.has(key);
    const copy = bandCopy(key, view, cuts);
    legend.push({
      label: copy.label,
      color: FUEL_FR_BAND_COLORS[key],
      blurb: off ? m.legend.off : copy.blurb,
      count: off ? 0 : (bucket.visible ?? bucket.total),
      off,
      toggle: { param: 'masquees', value: toggledHidden(hidden, key) },
    });
  }
  return legend;
}

/**
 * The row's chips: one per reading, then « Tout afficher » while a line of
 * the key is unticked.
 * @param {object} params
 * @returns {Array<object>}
 */
export function fuelViewChips(params = FUEL_FR_DEFAULT_PARAMS) {
  const m = messages();
  const view = normalizeFuelView(params?.vue);
  const chips = FUEL_FR_VIEWS.map((key) => ({
    id: `fuel-view-${key}`,
    label: key === FUEL_FR_DROP_VIEW ? m.views.baisse.label : m.chips[key],
    active: key === view,
    state: key === view ? 'active' : 'idle',
    title: key === FUEL_FR_DROP_VIEW ? m.views.baisse.title : m.views.price(fuelName(key)),
    params: { vue: key },
  }));
  const hidden = fuelHiddenBands(params);
  if (hidden.size > 0) {
    chips.push({
      id: 'fuel-show-all',
      label: m.views.showAll,
      active: false,
      state: 'idle',
      title: m.views.showAllTitle(hidden.size),
      params: { masquees: '' },
    });
  }
  return chips;
}

/**
 * The route's payload → GeoJSON Features.
 * @param {object} payload
 * @returns {Array<object>}
 */
export function fuelFeatures(payload) {
  const features = [];
  for (const row of Array.isArray(payload?.stations) ? payload.stations : []) {
    const props = fuelStationProps(row, payload);
    features.push({
      type: 'Feature',
      id: props.id,
      geometry: { type: 'Point', coordinates: [row[2], row[1]] },
      properties: props,
    });
  }
  return features;
}

async function loadFuelFeatures() {
  const response = await fetch('/api/fuel-fr/stations');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.stale) console.warn(`[Data:Fuel] ${messages().stale}`);
  const features = fuelFeatures(payload);
  _priceCuts = fuelPriceCutsByFuel(features.map((feature) => feature.properties));
  return features;
}

/**
 * Seed the quintile cuts without a load — the tests' way in.
 * @param {Record<string, Array<number>>} cuts
 */
export function setFuelPriceCutsForTest(cuts) {
  _priceCuts = cuts && typeof cuts === 'object' ? cuts : {};
}

const fuelPricesFrance = createLocalGeoJsonLayer({
  id: FUEL_FR_LAYER_ID,
  // i18n-ignore-start — registry fields, not copy: see src/data/layerTaxonomy.i18n.js.
  name: 'Prix des carburants',
  icon: '⛽',
  source: 'prix-carburants.gouv.fr · OpenStreetMap',
  // i18n-ignore-end
  color: FUEL_FR_BAND_COLORS.annoncee,
  labels: true,
  labelMax: 25,
  labelGridPx: 190,
  overlayVariant: 'label',
  stemMaxHeightM: 60,
  loadFeatures: loadFuelFeatures,
  cardCopy: fuelCardCopy,
  groupOf: (props, params) => fuelViewBand(props, params?.vue, _priceCuts),
  groupStyles: BAND_STYLES,
  groupVisible: (key, params) => !fuelHiddenBands(params).has(key),
  defaultParams: FUEL_FR_DEFAULT_PARAMS,
  regroupParams: ['vue'],
  labelPriority: fuelLabelPriority,
  rowControls: (params, tally) => ({ chips: fuelViewChips(params), legend: fuelBandLegend(tally, params) }),
  keySelection: { panel: fuelSelectionPanel, accent: FUEL_FR_BAND_COLORS.aucune },
});

export default fuelPricesFrance;
