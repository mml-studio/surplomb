// The loading banner, in both languages — which is to say the same words.
//
// `LOADING LIVE DATA` and its three outcomes are the upstream console's voice
// and have always been what the French page shows. They are catalogued so the
// French wording is one file away, and identical for now on purpose; this file
// is what makes that a decision rather than a leftover.
import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateLayerLoading, presentLoadingFeedback } from './loadingFeedback.js';
import { withLocale } from './i18n/testing.js';

const LOADING_STATE = {
  phase: 'loading', visible: true, startedAt: 0, showAt: 0, hideAt: 0,
  activeIds: ['flights'], batchOutcome: null, terminal: null, operation: 'loading',
};

const summary = (layers) => aggregateLayerLoading(layers);

test('the banner names the work and the layers it is waiting for', () => {
  const layers = [{ id: 'flights', label: 'Live flights', enabled: true, lifecycleState: 'enabling', stats: {} }];
  const en = withLocale('en', () => presentLoadingFeedback(LOADING_STATE, summary(layers), 1000));
  assert.equal(en.label, 'LOADING LIVE DATA');
  // The DETAIL is the registry's name, which IS translated — the banner takes
  // whatever the row is called on this page.
  assert.equal(en.detail, 'Live flights');
  assert.equal(presentLoadingFeedback(LOADING_STATE, summary(layers), 1000).label, 'LOADING LIVE DATA');
});

test('each outcome flashes the same word in both languages', () => {
  for (const [terminal, expected] of [['complete', 'LOAD COMPLETE'], ['cancelled', 'LOAD CANCELLED'], ['error', 'LOAD FAILED']]) {
    const state = { ...LOADING_STATE, phase: 'terminal', terminal, operation: 'loading' };
    assert.equal(withLocale('en', () => presentLoadingFeedback(state, summary([]), 0)).label, expected);
    assert.equal(presentLoadingFeedback(state, summary([]), 0).label, expected);
  }
  const off = { ...LOADING_STATE, phase: 'terminal', terminal: 'complete', operation: 'disabling' };
  assert.equal(withLocale('en', () => presentLoadingFeedback(off, summary([]), 0)).label, 'LIVE DATA OFF');
});
