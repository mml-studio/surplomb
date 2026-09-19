// The i18n ratchets (rules in scripts/lib/i18nScan.mjs, conventions in
// docs/i18n/CONVENTIONS.md): no file may gain a hard-coded string.
//
// A count may go DOWN freely — that is the work — and the orchestrator
// records it with `npm run i18n:tighten` between two waves, so it cannot
// climb back. A count that goes UP fails here with the new strings listed.
// R5 (messages read while a module loads) is held at zero outright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASELINE_FILE,
  REPO_ROOT,
  RULES,
  RULE_IDS,
  compareToBaseline,
  readBaseline,
  renderBaseline,
  scanRepository,
  total,
} from '../../scripts/lib/i18nScan.mjs';

const { counts, findings } = scanRepository(REPO_ROOT);
const baseline = readBaseline(REPO_ROOT);

test('the baseline exists and is in canonical form', () => {
  assert.ok(baseline, `${BASELINE_FILE} is missing — run npm run i18n:tighten`);
  const onDisk = readFileSync(path.join(REPO_ROOT, BASELINE_FILE), 'utf8');
  assert.equal(onDisk, renderBaseline(baseline),
    `${BASELINE_FILE} was edited by hand or its totals are stale — regenerate it with npm run i18n:tighten`);
});

for (const rule of RULE_IDS) {
  test(`${rule} — ${RULES[rule]}: no file above its ceiling`, () => {
    const { increases } = compareToBaseline({ ...Object.fromEntries(RULE_IDS.map((r) => [r, {}])), [rule]: counts[rule] },
      { ...Object.fromEntries(RULE_IDS.map((r) => [r, {}])), [rule]: baseline[rule] });
    const report = increases.map(({ file, baseline: was, now }) => {
      const lines = (findings[file] || []).filter((f) => f.rule === rule)
        .map((f) => `      ${file}:${f.line}  ${f.text}`);
      return `  ${file}: ${was} → ${now}\n${lines.join('\n')}`;
    });
    assert.deepEqual(report, [], `${rule} went up. Move the new strings into the module's .i18n.js catalog `
      + '(docs/i18n/CONVENTIONS.md); a French DATA value may carry `// i18n-ignore-line`.');
  });
}

test('R5 is zero: no message is ever read while a module loads', () => {
  assert.equal(total(counts.R5), 0, JSON.stringify(counts.R5));
  assert.equal(total(baseline.R5), 0);
});
