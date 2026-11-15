#!/usr/bin/env node
/**
 * Pass the whole permit archive through today's applicant and description
 * filters (see `scripts/lib/permitArchiveRescrub.mjs`).
 *
 *   npm run permits:archive-rescrub                 # dry run: what would change
 *   npm run permits:archive-rescrub -- --write      # rewrite the files that change
 *   npm run permits:archive-rescrub -- --dir <path>
 *
 * On the server, after the deploy that changed a filter, and away from the
 * nightly sweeps (~23:40-01:15 UTC):
 * `docker exec gev node scripts/permit-archive-rescrub.mjs --write`.
 * Copy the archive first (`systemctl start gev-archive-nightly.service`).
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { rescrubPermitArchive } from './lib/permitArchiveRescrub.mjs';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: path.join('.gev-cache', 'archive') },
    write: { type: 'boolean', default: false },
  },
});

const report = await rescrubPermitArchive(values.dir, { write: values.write });
for (const [family, t] of Object.entries(report)) {
  console.log(`${family}: ${t.changed}/${t.files} files ${values.write ? 'rewritten' : 'would change'}, `
    + `${t.restored} rows restored, ${t.merged} merged, ${t.skipped} left as they are`);
}
