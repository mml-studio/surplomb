/**
 * Fuel prices (FR) — every French filling station that declares its prices,
 * coloured by how far its diesel price has come down since the week of 24 to
 * 30 October 2026.
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
 * THE WIRING is the bundled-pack loader (`localGeojson.js`), fed by
 * `loadFeatures` from `/api/fuel-fr/stations` instead of a file: the stems,
 * labels, culling and key card are the ones every local pack already has.
 */
import { createLocalGeoJsonLayer } from './localGeojson.js';
import {
  FUEL_FR_BAND_KEYS,
  FUEL_FR_LAYER_ID,
  FUEL_FR_UNKNOWN_BAND,
  fuelStationProps,
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
  inconnue: '#7c838e',
});

const BAND_STYLES = Object.freeze(Object.fromEntries(FUEL_FR_BAND_KEYS.map((key) => [
  key,
  Object.freeze({
    color: FUEL_FR_BAND_COLORS[key],
    pixelSize: key === FUEL_FR_UNKNOWN_BAND ? 5 : 7,
    // A label is only worth reading at town scale: at 30 km over Bordeaux,
    // sixty of them covered the map (screenshot of 2026-11-23).
    cardMaxDistance: 20_000,
  }),
])));

const PRICE_FORMAT = Object.freeze({ minimumFractionDigits: 3, maximumFractionDigits: 3 });
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
 * The floating label and its details, close up. The label leads with the
 * CHANGE, because that is the question the colour answers; the price is one
 * click away, on the card.
 * @param {object} props
 * @returns {{title: string, details: string[]}}
 */
export function fuelCardCopy(props) {
  const m = messages().card;
  const lead = Number.isFinite(props.dropCents) ? changeText(props.dropCents) : priceText(props.gazole);
  return {
    title: [lead, props.brand || m.station].filter(Boolean).join(' · '),
    details: [priceText(props.gazole)].filter(Boolean),
  };
}

/**
 * The card in the map key, on click.
 * @param {object} props
 * @param {{id?: string}} [context]
 * @returns {object}
 */
export function fuelSelectionPanel(props, { id = '' } = {}) {
  if (!props || typeof props !== 'object') return null;
  const m = messages().card;
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
 * The key: one row per band in view, with its count.
 * @param {Map<string,{total:number, visible:number}>} tally
 * @returns {Array<object>}
 */
export function fuelBandLegend(tally) {
  const m = messages();
  const legend = [];
  for (const key of FUEL_FR_BAND_KEYS) {
    const bucket = tally instanceof Map ? tally.get(key) : tally?.[key];
    if (!bucket?.total) continue;
    const hidden = bucket.total - (bucket.visible ?? bucket.total);
    const blurb = m.bands[key].blurb;
    legend.push({
      label: m.bands[key].label,
      color: FUEL_FR_BAND_COLORS[key],
      blurb: hidden > 0 ? m.legend.hidden(blurb, hidden) : blurb,
      count: bucket.visible ?? bucket.total,
    });
  }
  return legend;
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
  return fuelFeatures(payload);
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
  groupOf: (props) => (FUEL_FR_BAND_KEYS.includes(props?.band) ? props.band : FUEL_FR_UNKNOWN_BAND),
  groupStyles: BAND_STYLES,
  rowControls: (_params, tally) => ({ chips: [], legend: fuelBandLegend(tally) }),
  keySelection: { panel: fuelSelectionPanel, accent: FUEL_FR_BAND_COLORS.aucune },
});

export default fuelPricesFrance;
