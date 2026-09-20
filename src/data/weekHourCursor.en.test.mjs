// The shared typical-week cursor in English. Its French stays pinned by
// weekHourCursor.test.mjs, untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEK_HOUR_DAYS,
  weekHourLabel,
  weekHourToOperatingSlot,
} from './weekHourCursor.js';
import { assertNoFrench, useTestLocale } from '../i18n/testing.js';

useTestLocale('en');

test('the cursor names the day in English and keeps the 24-hour clock', () => {
  assert.equal(weekHourLabel({ day: 0, hour: 0 }), 'Monday 00:00');
  assert.equal(weekHourLabel({ day: 1, hour: 8 }), 'Tuesday 08:00');
  assert.equal(weekHourLabel({ day: 6, hour: 23 }), 'Sunday 23:00');
  assert.equal(weekHourLabel(null), null);
  assertNoFrench(WEEK_HOUR_DAYS.map((_, day) => weekHourLabel({ day, hour: 12 })));
});

test('the IDFM column key stays French wherever the reader reads English', () => {
  // The profile file published by idfmFrequencyFeed names its seven columns
  // `lundi`…`dimanche`. Translating that key would read the wrong column.
  assert.equal(WEEK_HOUR_DAYS[1], 'mardi');
  assert.equal(weekHourToOperatingSlot({ day: 1, hour: 8 }).day, 'mardi');
  assert.equal(weekHourLabel({ day: 1, hour: 8 }), 'Tuesday 08:00');
});
