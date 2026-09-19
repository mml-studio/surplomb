// The formatter contract: in French, byte for byte what the modules printed
// with `toLocaleString('fr-FR', …)`; in English, US English per
// docs/GLOSSARY.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countNoun,
  formatAge,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatEuros,
  formatEurosPerM2,
  formatInteger,
  formatList,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatTime,
  monthName,
  ordinal,
  plural,
  weekdayName,
} from './format.js';
import { useTestLocale } from './testing.js';

const NUMBERS = [0, -0, 1, 5.6, 12400, 1234567.891, -3200.5, 0.000123, 91.34, 1e21, NaN, Infinity];
const NUMBER_OPTIONS = [
  undefined,
  { maximumFractionDigits: 0 },
  { maximumFractionDigits: 1 },
  { maximumFractionDigits: 2 },
  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  { minimumFractionDigits: 1, maximumFractionDigits: 1 },
  { minimumFractionDigits: 4, maximumFractionDigits: 4 },
  { minimumFractionDigits: 2 },
  { style: 'percent', maximumFractionDigits: 1 },
  { notation: 'compact' },
];

test('French numbers are byte-identical to toLocaleString(\'fr-FR\')', () => {
  for (const value of NUMBERS) {
    for (const options of NUMBER_OPTIONS) {
      const expected = value.toLocaleString('fr-FR', options);
      assert.equal(formatNumber(value, options), expected, `${value} ${JSON.stringify(options)}`);
      assert.equal(formatNumber(value, { ...options, locale: 'fr' }), expected);
    }
    assert.equal(formatInteger(value), Math.round(value).toLocaleString('fr-FR'));
    assert.equal(formatDecimal(value, 1), value.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
    assert.equal(formatDecimal(value, 2, { minimumFractionDigits: 2 }),
      value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
});

test('French amounts and quantities are what the modules typed around toLocaleString', () => {
  for (const value of [0, 5.6, 3200, 245000, 91.3, -1500]) {
    const n = value.toLocaleString('fr-FR');
    assert.equal(formatEuros(value), `${n} €`);
    assert.equal(formatEurosPerM2(value), `${n} €/m²`);
    assert.equal(formatPercent(value), `${n} %`);
    assert.equal(formatQuantity(value, 'MW'), `${n} MW`);
    assert.equal(formatPercent(value, { maximumFractionDigits: 1 }),
      `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
  }
});

test('English follows the glossary table', (t) => {
  useTestLocale('en', t);
  assert.equal(formatDecimal(5.6), '5.6');
  assert.equal(formatQuantity(5.6, 's'), '5.6 s');
  assert.equal(countNoun(12400, 'sale', 'sales'), '12,400 sales');
  assert.equal(formatPercent(91.3), '91.3%');
  assert.equal(formatEurosPerM2(3200), '€3,200/m²');
  assert.equal(formatEuros(245000), '€245,000');
  assert.equal(formatEuros(-3200), '-€3,200', 'the sign leads the symbol');
  assert.equal(formatQuantity(120, 'km'), '120 km');
  assert.equal(formatDate(Date.UTC(2026, 8, 19, 12), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    'Sep 19, 2026');
  assert.equal(formatTime(Date.UTC(2026, 8, 19, 14, 5), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }),
    '14:05');
  assert.equal(ordinal(2), '2nd');
  assert.equal(ordinal(11), '11th');
  assert.equal(formatList(['a', 'b', 'c']), 'a, b, and c');
});

test('plainSpaces flattens every no-break space, in both languages', () => {
  for (const locale of ['fr', 'en']) {
    for (const value of [12400, 1234567.8, -3200]) {
      for (const fn of [formatNumber, formatInteger, formatEuros, formatEurosPerM2, formatPercent]) {
        const text = fn(value, { locale, plainSpaces: true });
        assert.doesNotMatch(text, /[\u00a0\u202f]/u, `${fn.name}(${value}) in ${locale}`);
      }
    }
    assert.doesNotMatch(formatDateTime(Date.UTC(2026, 8, 19, 14, 5), { locale, plainSpaces: true, timeZone: 'UTC' }),
      /[\u00a0\u202f]/u);
  }
  // …and changes nothing else: the dozen modules that flatten by hand agree.
  assert.equal(formatInteger(1234567, { plainSpaces: true }),
    Math.round(1234567).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' '));
});

const INSTANTS = [Date.UTC(2026, 6, 22, 11, 55), Date.UTC(2026, 0, 1, 0, 0, 7), Date.UTC(2026, 11, 31, 23, 59)];
const DATE_OPTIONS = [
  undefined,
  { timeZone: 'UTC' },
  { month: 'long', timeZone: 'UTC' },
  { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' },
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' },
  { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' },
  { dateStyle: 'medium', timeZone: 'UTC' },
  { timeStyle: 'short', timeZone: 'UTC' },
];

test('French dates are byte-identical to toLocaleDateString / TimeString / String', () => {
  for (const instant of INSTANTS) {
    const date = new Date(instant);
    for (const options of DATE_OPTIONS) {
      const label = `${date.toISOString()} ${JSON.stringify(options)}`;
      if (!options?.timeStyle) assert.equal(formatDate(instant, options), date.toLocaleDateString('fr-FR', options), label);
      if (!options?.dateStyle) assert.equal(formatTime(instant, options), date.toLocaleTimeString('fr-FR', options), label);
      assert.equal(formatDateTime(instant, options), date.toLocaleString('fr-FR', options), label);
      assert.equal(formatDateTime(date, options), date.toLocaleString('fr-FR', options), `${label} (Date)`);
    }
  }
  assert.equal(formatDate(NaN), 'Invalid Date', 'as toLocaleDateString, rather than throwing like Intl');
  assert.equal(formatDate('not a date'), new Date('not a date').toLocaleDateString('fr-FR'));
});

test('month and weekday names come from static tables that match ICU today', () => {
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2026, month, 15));
    for (const style of ['long', 'short']) {
      assert.equal(monthName(month, { style }), date.toLocaleDateString('fr-FR', { month: style, timeZone: 'UTC' }));
      assert.equal(monthName(month, { style, locale: 'en' }), date.toLocaleDateString('en-US', { month: style, timeZone: 'UTC' }));
    }
  }
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(Date.UTC(2026, 8, 13 + day)); // 13 Sep 2026 is a Sunday
    assert.equal(date.getUTCDay(), day);
    for (const style of ['long', 'short']) {
      assert.equal(weekdayName(day, { style }), date.toLocaleDateString('fr-FR', { weekday: style, timeZone: 'UTC' }));
      assert.equal(weekdayName(day, { style, locale: 'en' }), date.toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' }));
    }
  }
  assert.equal(monthName(12), '');
  assert.equal(weekdayName(-1), '');
});

test('plurals follow each language’s rules — French puts 0 in the singular', () => {
  assert.equal(plural(0, 'vente', 'ventes'), 'vente');
  assert.equal(plural(1, 'vente', 'ventes'), 'vente');
  assert.equal(plural(2, 'vente', 'ventes'), 'ventes');
  assert.equal(plural(1_000_000, 'vente', 'ventes'), 'ventes', 'CLDR “many” is still the plural');
  assert.equal(countNoun(12400, 'vente', 'ventes'), `${(12400).toLocaleString('fr-FR')} ventes`);
  assert.equal(plural(0, 'sale', 'sales', { locale: 'en' }), 'sales');
  assert.equal(plural(1, 'sale', 'sales', { locale: 'en' }), 'sale');
});

test('ordinals, ages and lists', () => {
  assert.deepEqual([1, 2, 11].map((n) => ordinal(n)), ['1ᵉʳ', '2ᵉ', '11ᵉ']);
  assert.equal(ordinal(1, { feminine: true }), '1ʳᵉ');
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map((n) => ordinal(n, { locale: 'en' })),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th'],
  );
  assert.equal(formatAge(5, 'min'), 'il y a 5 min');
  assert.equal(formatAge(3, 'd'), 'il y a 3 j');
  assert.equal(formatAge(40, 's'), 'il y a 40 s');
  assert.equal(formatAge(5, 'min', { locale: 'en' }), '5 min ago');
  assert.equal(formatAge(3, 'd', { locale: 'en' }), '3 d ago');
  assert.equal(formatList(['a', 'b', 'c']), new Intl.ListFormat('fr-FR').format(['a', 'b', 'c']));
  assert.equal(formatList(new Set(['x', 'y']), { type: 'disjunction' }), 'x ou y');
});
