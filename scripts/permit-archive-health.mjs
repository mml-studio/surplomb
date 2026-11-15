#!/usr/bin/env node
/**
 * Is the permit archive still being written? Prints the day's verdict.
 *
 *   npm run permits:archive-health                         # .gev-cache/archive, today in France
 *   npm run permits:archive-health -- --dir <path> --day 2026-11-16
 *   npm run permits:archive-health -- --json               # the whole report, for a machine
 *
 * Read-only: it opens every municipality's archive file and writes nothing.
 * On the server it runs inside the container,
 * `docker exec gev node scripts/permit-archive-health.mjs --json`, once a night
 * after the sweeps; the rules are in `scripts/lib/permitArchiveHealth.mjs`.
 * Exit code 0 whatever the verdict (the verdict is data, not a crash); 2 when
 * the archive directory holds no family at all.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { cartdsDay } from '../src/data/cartdsArchive.js';
import { assessPermitArchive, expectedPermitArchive, readPermitArchive } from './lib/permitArchiveHealth.mjs';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: path.join('.gev-cache', 'archive') },
    day: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});

const families = await readPermitArchive(values.dir);
if (!Object.keys(families).length) {
  console.error(`no archive family under ${values.dir}`);
  process.exit(2);
}
const report = assessPermitArchive(families, values.day ?? cartdsDay(), expectedPermitArchive());
console.log(values.json ? JSON.stringify({ at: new Date().toISOString(), ...report }) : report.text);
