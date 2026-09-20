// The one word this module owns: what a volume the active theme could not
// join is called, in the legend and in the count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearBuildingTheme, getActiveBuildingTheme, registerBuildingTheme } from './buildingTheme.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const THEME = {
  id: 'test-theme',
  label: 'Test',
  points: [],
  reduce: () => null,
  colorFor: () => '#fff',
  legend: [],
};

test('a theme that names no "no data" label gets the page’s own', (t) => {
  t.after(() => clearBuildingTheme(THEME.id));
  const en = withLocale('en', () => registerBuildingTheme(THEME).unknownLabel);
  assert.equal(en, 'no data');
  assertNoFrench(en);
  const fr = withLocale('fr', () => registerBuildingTheme(THEME).unknownLabel);
  assert.equal(fr, 'sans donnée');
  assert.equal(getActiveBuildingTheme()?.id, THEME.id);
});

test('a theme with a label of its own keeps it, whatever the language', (t) => {
  t.after(() => clearBuildingTheme('own'));
  const theme = withLocale('en', () => registerBuildingTheme({
    ...THEME, id: 'own', unknownLabel: 'no rating',
  }));
  assert.equal(theme.unknownLabel, 'no rating');
});
