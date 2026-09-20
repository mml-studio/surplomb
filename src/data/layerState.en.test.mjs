// A share link does not have a language.
//
// Everything else in this batch made the panel bilingual: the row names, the
// chips, the statuses, the territories. None of it may reach the URL. A link
// copied out of the French globe in August has to reopen the same layers, with
// the same options, on an English page — and the other way round — because the
// tokens are DATA (docs/i18n/CONVENTIONS.md § 4) and the only thing that ever
// changes is how they are drawn.
//
// The frozen list at the bottom is the stronger half of that promise: it is
// every token this registry has ever published, and a rename fails here before
// it reaches a reader whose link stops working.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYER_STATE_REGISTRY,
  createDefaultLayerState,
  decodeLayerStateParams,
  encodeLayerStateParams,
  normalizeLayerState,
} from './layerState.js';
import { withLocale } from '../i18n/testing.js';

/** A link with three layers on, one of them carrying options. */
function shareLink(locale) {
  return withLocale(locale, () => {
    const state = normalizeLayerState({
      ...createDefaultLayerState(),
      enabledLayerIds: ['traffic', 'dvf-sales', 'avis-valeur'],
      options: { 'avis-valeur': { type: 'Maison', surface: '100' } },
    });
    const params = new URLSearchParams({ v: '2' });
    encodeLayerStateParams(params, state);
    return params.toString();
  });
}

test('a link written in French and one written in English are the same link', () => {
  assert.equal(shareLink('en'), shareLink('fr'));
  // And it is the link it always was: tokens, not names.
  assert.match(shareLink('fr'), /(^|&)l=[a-z0-9.]+(&|$)/);
  assert.equal(shareLink('fr'), 'v=2&l=vv.dv.t&lo=vv.t.m_vv.s.l_f.e.1');
});

test('a link made in French restores identically on an English page', () => {
  const params = new URLSearchParams(shareLink('fr'));
  const inFrench = decodeLayerStateParams(params);
  const inEnglish = withLocale('en', () => decodeLayerStateParams(new URLSearchParams(shareLink('fr'))));
  assert.deepEqual(inEnglish, inFrench);
  assert.deepEqual([...inEnglish.enabledLayerIds].sort(), ['avis-valeur', 'dvf-sales', 'traffic']);
  // The valuation's subject travels as DVF's own `type_local` value, in both:
  // `Maison` is what the register publishes and what the cache is keyed on.
  // Only its DISPLAY is translated, where the card draws it.
  assert.equal(inEnglish.options['avis-valeur'].type, 'Maison');
  assert.equal(inFrench.options['avis-valeur'].type, 'Maison');
});

test('every share token is exactly what it was, in either language', () => {
  // One line per layer, `id token`. Add a line when a layer is added; NEVER
  // edit one — a changed token is a link that stops working.
  const published = [
    'ads-fr au', 'ais-live-vessels a', 'amenities-fr bq', 'anfr-fr an', 'avis-valeur vv',
    'bdtopo-buildings 5', 'bikeshare b', 'bruit-fr bz', 'cadastre-fr cd', 'cctv c',
    'comparables-fr cp', 'comptages-fr cr', 'delinquance-fr dl', 'dpe-fr dp', 'dvf-sales dv',
    'earthquakes e', 'edf-power-plants l', 'filosofi-fr fi', 'flights f', 'fr-hydro-plants 4',
    'fraicheur-fr fh', 'france-energy j', 'gas-fr 1', 'georisques gr',
    'gironde-megafire-2026 gi', 'hubeau-hydro h', 'idfm-network if', 'implantation-fr im',
    'irve-fr 9', 'isochrone-fr is', 'local-airports 6', 'local-dams q', 'local-datacenters d',
    'local-firms w', 'local-ports o', 'marine-buoys y', 'medecins-fr md',
    'meteo-stations-fr mt', 'meteofrance-vigilance n', 'military m', 'military-awareness g',
    'military-installations i', 'petite-enfance-fr pe', 'power-grid 2', 'radio r',
    'road-events-fr 8', 'road-status-fr 7', 'rocket-launches x', 'rte-generation 3',
    'satellites s', 'schools-fr 0', 'shared-mobility-fr k', 'sitadel-fr sd', 'sup-fr su',
    'telegeography-submarine-cables u', 'traffic t', 'transit-fr p', 'urbanisme-gpu ur',
    'velo-pulse-fr vp', 'vigicrues v',
  ];
  const actual = (locale) => withLocale(locale, () => LAYER_STATE_REGISTRY
    .map((entry) => `${entry.id} ${entry.token}`).sort());
  assert.deepEqual(actual('fr'), published.slice().sort());
  assert.deepEqual(actual('en'), published.slice().sort());
});
