#!/usr/bin/env node
// scripts/i18n-report.mjs — how much of the globe is still hard-coded.
//
//   npm run i18n:report                       totals per rule, against the baseline
//   npm run i18n:report -- src/data/dvf       per-file rows for these paths/prefixes
//   npm run i18n:report -- --top 15           the 15 heaviest files per rule
//   npm run i18n:report -- --details src/data/megafireClock.js
//                                             every finding (line + text) in those files
//   npm run i18n:report -- --json             machine-readable
//   npm run i18n:tighten                      lower the baseline to today's counts
//                                             (refuses when any count went UP)
//   npm run i18n:report -- --reset            orchestrator only: accept today's
//                                             counts, increases included
//
// A translation batch runs it before and after, on its own files, and puts
// both tables in its pull request. The rules are defined in
// scripts/lib/i18nScan.mjs; the conventions in docs/i18n/CONVENTIONS.md.

import { writeFileSync } from 'node:fs';
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
  tightenBaseline,
  total,
} from './lib/i18nScan.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const paths = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--top');

const number = (n) => n.toLocaleString('en-US');
const pad = (text, width, right = false) => (right ? String(text).padStart(width) : String(text).padEnd(width));

const { counts, findings } = scanRepository(REPO_ROOT);
const baseline = readBaseline(REPO_ROOT);

if (flag('--tighten') || flag('--reset')) {
  const next = flag('--reset') || !baseline ? counts : tightenBaseline(counts, baseline);
  writeFileSync(path.join(REPO_ROOT, BASELINE_FILE), renderBaseline(next));
  console.log(`${BASELINE_FILE} written.`);
  for (const rule of RULE_IDS) {
    const before = baseline ? total(baseline[rule]) : null;
    console.log(`  ${rule} ${pad(RULES[rule], 52)} ${before === null ? '' : `${number(before)} → `}${number(total(next[rule]))}`);
  }
  process.exit(0);
}

if (flag('--json')) {
  console.log(JSON.stringify({ counts, baseline, totals: Object.fromEntries(RULE_IDS.map((r) => [r, total(counts[r])])) }, null, 2));
  process.exit(0);
}

console.log(`i18n ratchets — baseline ${BASELINE_FILE}${baseline ? '' : ' (missing: run npm run i18n:tighten)'}\n`);
console.log(`${pad('rule', 56)}${pad('now', 8, true)}${pad('baseline', 10, true)}${pad('files', 7, true)}`);
for (const rule of RULE_IDS) {
  const now = total(counts[rule]);
  const was = baseline ? total(baseline[rule]) : now;
  console.log(`${pad(`${rule}  ${RULES[rule]}`, 56)}${pad(number(now), 8, true)}${pad(number(was), 10, true)}${pad(Object.keys(counts[rule]).length, 7, true)}`);
}

const matches = (file) => paths.some((p) => file === p || file.startsWith(p));
if (paths.length) {
  const files = new Set();
  for (const rule of RULE_IDS) {
    for (const file of Object.keys(counts[rule])) if (matches(file)) files.add(file);
    for (const file of Object.keys(baseline?.[rule] || {})) if (matches(file)) files.add(file);
  }
  console.log(`\n${pad('file', 60)}${RULE_IDS.map((r) => pad(r, 11, true)).join('')}`);
  for (const file of [...files].sort()) {
    const cells = RULE_IDS.map((rule) => {
      const now = counts[rule][file] ?? 0;
      const was = baseline?.[rule]?.[file] ?? 0;
      return pad(now === was ? `${now}` : `${was}→${now}`, 11, true);
    });
    console.log(`${pad(file, 60)}${cells.join('')}`);
  }
  if (flag('--details')) {
    for (const file of [...files].sort()) {
      for (const finding of findings[file] || []) {
        console.log(`  ${file}:${finding.line}  ${finding.rule}  ${finding.text}`);
      }
    }
  }
}

const top = Number(option('--top', 0));
if (top > 0) {
  for (const rule of RULE_IDS) {
    const rows = Object.entries(counts[rule]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
    if (!rows.length) continue;
    console.log(`\n${rule}  ${RULES[rule]}`);
    for (const [file, n] of rows) console.log(`  ${pad(number(n), 6, true)}  ${file}`);
  }
}

if (baseline) {
  const { increases, decreases } = compareToBaseline(counts, baseline);
  if (increases.length) {
    console.log('\nABOVE THE BASELINE (the ratchet test fails on these):');
    for (const d of increases) console.log(`  ${d.rule} ${d.file}: ${d.baseline} → ${d.now}`);
  }
  if (decreases.length) {
    console.log(`\n${decreases.length} count(s) below the baseline — \`npm run i18n:tighten\` records them.`);
  }
}
