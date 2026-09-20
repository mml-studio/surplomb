import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * English plurals are chosen by rule, not by hand.
 *
 * A French leaf may write `${n} vente${n > 1 ? 's' : ''}`: French CLDR puts 0
 * and 1 in the singular, so `> 1` is the rule. English is different — `0
 * sales`, `1 sale` — and the same trick printed `0 ring` and `1 substations`
 * on the English globe. An English leaf therefore calls `plural()` or
 * `countNoun()` (src/i18n/format.js), and never carries `(s)` either, which
 * reads as a form nobody speaks.
 */
function catalogs(root = 'src') {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('.i18n.js')) found.push(absolute);
    }
  };
  visit(root);
  return found.sort();
}

/** The lines of a catalog that belong to an `en:` leaf, with their number. */
function englishLines(source) {
  const lines = source.split('\n');
  const out = [];
  let inEnglish = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('fr:')) inEnglish = false;
    else if (trimmed.startsWith('en:')) inEnglish = true;
    else if (trimmed.startsWith('note:') || trimmed.startsWith('sample:')) inEnglish = false;
    if (inEnglish) out.push({ line: index + 1, text: line });
  }
  return out;
}

test('no English leaf builds a plural by hand', () => {
  const offenders = [];
  for (const file of catalogs()) {
    for (const { line, text } of englishLines(readFileSync(file, 'utf8'))) {
      if (/\? '.?s' : ''/.test(text)) offenders.push(`${file}:${line} — ${text.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], `use plural() from src/i18n/format.js:\n${offenders.join('\n')}`);
});

test('no English leaf writes "(s)"', () => {
  const offenders = [];
  for (const file of catalogs()) {
    for (const { line, text } of englishLines(readFileSync(file, 'utf8'))) {
      if (/\w\(s\)/.test(text)) offenders.push(`${file}:${line} — ${text.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], `use plural() from src/i18n/format.js:\n${offenders.join('\n')}`);
});
