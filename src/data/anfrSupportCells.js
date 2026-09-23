/**
 * @module data/anfrSupportCells
 *
 * The city view's supports, kept by grid cell, so a camera stop asks the
 * register only about ground this session has not seen yet.
 *
 * ── WHAT IT REPLACES ────────────────────────────────────────────────────────
 * Under 0.32° of view span the `anfr-fr` layer asks `/api/anfr-fr/supports`
 * about the view box. It used to ask about the EXACT box, keyed to four
 * decimals, so a pan of 0.0001° — 11 m — was a new question: one request per
 * camera stop (up to 113 KB gzipped for the fullest box in France), the last
 * answer thrown away, and a zoom back out over ground just drawn asked again.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 * The ground is cut into cells of {@link ANFR_CELL_DEG} on one fixed grid. A
 * view needs the cells it touches. Those not held yet are asked for in as few
 * boxes as the proxy's ceiling allows, each snapped to the grid, so the same
 * ground is always the same URL and the browser's own cache can answer it next
 * visit (see `sendAnfrAnswer` in vite.config.js). Each answer is filed under
 * the cells it covers; the view is assembled from its cells, cut to the view
 * box and put back in the register's order (by support id), so the supports
 * drawn are exactly those, in the same order, that a request for the view box
 * returns.
 *
 * A pan asks about the ground it uncovered — one strip, or two for a diagonal
 * pan. A zoom in, or a return to ground already seen, asks nothing. A cell is
 * kept `maxAgeMs` (the layer's six-hour poll), then asked for again.
 *
 * DOM-free and Cesium-free; the fetch and the clock are injected.
 */

/**
 * Cell edge, in degrees: ~2.8 km north-south, ~1.8 km east-west over Paris.
 * Small, so the ground asked for beyond the view stays small: less than one
 * cell on each side. A view of the entry span (0.32°) touches 13 or 14 cells
 * a side, which one request of 14 × 14 covers.
 */
export const ANFR_CELL_DEG = 0.025;
/** Cells per side of a request whose box may be `maxBoxDeg` wide: 14 under the proxy's 0.35°. */
export function anfrCellsPerRequest(maxBoxDeg) {
  return Math.max(1, Math.floor((maxBoxDeg + 1e-9) / ANFR_CELL_DEG));
}
/**
 * Cells kept, least recently drawn out first. A view of the widest span
 * touches at most 15 × 15 = 225; 400 keeps that view and most of the one
 * before. The densest cell in France holds a few hundred supports.
 */
export const ANFR_CELLS_KEPT = 400;
/** More separate boxes than this for one camera stop, and one box around them all is asked instead. */
const MAX_PIECES = 4;

/** The row (latitude) or column (longitude) index of the cell holding `deg`. */
export function anfrCellIndex(deg) {
  return Math.floor(deg / ANFR_CELL_DEG);
}

/** The cells a box touches, as inclusive index ranges. */
export function anfrCellRange(box) {
  return {
    r0: anfrCellIndex(box.south),
    r1: anfrCellIndex(box.north),
    c0: anfrCellIndex(box.west),
    c1: anfrCellIndex(box.east),
  };
}

/**
 * The request box of a block of cells, as the four strings its URL carries.
 * Strings, and fixed to five decimals, so one block is always one URL.
 */
export function anfrCellBlockBox({ r0, r1, c0, c1 }) {
  const edge = (index) => (index * ANFR_CELL_DEG).toFixed(5);
  return { south: edge(r0), west: edge(c0), north: edge(r1 + 1), east: edge(c1 + 1) };
}

const cellKey = (row, col) => `${row}:${col}`;

/** Cut a block into blocks of at most `maxCells` a side. */
function chunk({ r0, r1, c0, c1 }, maxCells) {
  const blocks = [];
  for (let row = r0; row <= r1; row += maxCells) {
    for (let col = c0; col <= c1; col += maxCells) {
      blocks.push({ r0: row, r1: Math.min(r1, row + maxCells - 1), c0: col, c1: Math.min(c1, col + maxCells - 1) });
    }
  }
  return blocks;
}

/**
 * The blocks that cover a set of cells.
 *
 * The cells are first cut into rectangles of rows that share the same runs of
 * columns: the strip a pan uncovered is one, a diagonal pan's L is two, a zoom
 * out's ring four. Those are asked for when they spare at least half the
 * ground of the one box around them all; otherwise — a ring so thick that
 * little of the view was held, or cells scattered in more than
 * {@link MAX_PIECES} pieces — that one box is cheaper than the extra requests. Every block is then cut to
 * the proxy's ceiling.
 * @param {Array<[number, number]>} cells `[row, col]` pairs.
 * @param {number} maxCells Cells per side of one request.
 * @returns {Array<{r0:number, r1:number, c0:number, c1:number}>}
 */
export function planAnfrCellBlocks(cells, maxCells) {
  if (!cells.length) return [];
  const byRow = new Map();
  for (const [row, col] of cells) {
    if (!byRow.has(row)) byRow.set(row, new Set());
    byRow.get(row).add(col);
  }
  const pieces = [];
  let open = new Map();
  let previousRow = null;
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const runs = [];
    for (const col of [...byRow.get(row)].sort((a, b) => a - b)) {
      const run = runs[runs.length - 1];
      if (run && col === run[1] + 1) run[1] = col;
      else runs.push([col, col]);
    }
    const next = new Map();
    for (const [c0, c1] of runs) {
      const key = cellKey(c0, c1);
      const piece = previousRow === row - 1 ? open.get(key) : undefined;
      if (piece) {
        piece.r1 = row;
        next.set(key, piece);
      } else {
        const started = { r0: row, r1: row, c0, c1 };
        pieces.push(started);
        next.set(key, started);
      }
    }
    open = next;
    previousRow = row;
  }
  const around = {
    r0: Math.min(...pieces.map((piece) => piece.r0)),
    r1: Math.max(...pieces.map((piece) => piece.r1)),
    c0: Math.min(...pieces.map((piece) => piece.c0)),
    c1: Math.max(...pieces.map((piece) => piece.c1)),
  };
  const aroundCells = (around.r1 - around.r0 + 1) * (around.c1 - around.c0 + 1);
  const worthIt = pieces.length <= MAX_PIECES && byRowCount(byRow) * 2 <= aroundCells;
  return (worthIt ? pieces : [around]).flatMap((piece) => chunk(piece, maxCells));
}

function byRowCount(byRow) {
  let count = 0;
  for (const cols of byRow.values()) count += cols.size;
  return count;
}

const inBox = (support, box) => support.lat >= box.south && support.lat <= box.north
  && support.lon >= box.west && support.lon <= box.east;

/**
 * The page's cell store.
 *
 * @param {object} options
 * @param {(box: {south:string, west:string, north:string, east:string}) => Promise<object>} options.fetchBlock
 *   One `/supports` answer for a block's box.
 * @param {number} options.maxBoxDeg The widest box the proxy answers.
 * @param {number} [options.capacity] Cells kept.
 * @param {number} [options.maxAgeMs] How long a cell is trusted before it is asked for again.
 * @param {() => number} [options.now]
 */
export function createAnfrSupportCells({
  fetchBlock, maxBoxDeg, capacity = ANFR_CELLS_KEPT, maxAgeMs = Infinity, now = () => Date.now(),
}) {
  const maxCells = anfrCellsPerRequest(maxBoxDeg);
  /** Cell key → `{ supports, at, truncated }`, least recently drawn first. */
  const cells = new Map();
  /** Cell key → the request that will fill it. Only cells not held are claimed. */
  const pending = new Map();
  /** Cell key → how many loads are reading it: never evicted while one is. */
  const pinned = new Map();
  /** Provenance of the newest answer: edition, national totals, clock. */
  let meta = null;
  /** Bumped by `clear`: an answer asked for before is not filed. */
  let epoch = 0;

  const fresh = (key) => {
    const cell = cells.get(key);
    return Boolean(cell) && Number.isFinite(cell.at) && now() - cell.at <= maxAgeMs;
  };

  function file(block, payload, asked) {
    if (asked !== epoch) return;
    const { supports = [], count, inBox: _inBox, truncated, box, ...rest } = payload || {};
    meta = rest;
    // An answer the proxy cut short is drawn once and never trusted again.
    const at = truncated ? -Infinity : now();
    const filed = new Map();
    for (let row = block.r0; row <= block.r1; row++) {
      for (let col = block.c0; col <= block.c1; col++) filed.set(cellKey(row, col), []);
    }
    for (const support of supports) {
      if (!Number.isFinite(support?.lat) || !Number.isFinite(support?.lon)) continue;
      // A support on the edge between two blocks comes back in both answers;
      // filed by its own position, it lands in one cell only.
      filed.get(cellKey(anfrCellIndex(support.lat), anfrCellIndex(support.lon)))?.push(support);
    }
    for (const [key, list] of filed) cells.set(key, { supports: list, at, truncated: Boolean(truncated) });
  }

  function evict() {
    for (const key of cells.keys()) {
      if (cells.size <= capacity) return;
      if (!pinned.has(key)) cells.delete(key);
    }
  }

  return {
    get size() { return cells.size; },

    /**
     * The supports inside `box`, from the cells, asking the proxy for the
     * cells not held or older than `maxAgeMs`.
     * @returns {Promise<object>} A `/supports`-shaped answer, plus `requested`:
     *   how many requests this view cost.
     */
    async load(box) {
      const range = anfrCellRange(box);
      const keys = [];
      const missing = [];
      for (let row = range.r0; row <= range.r1; row++) {
        for (let col = range.c0; col <= range.c1; col++) {
          const key = cellKey(row, col);
          keys.push(key);
          if (!fresh(key) && !pending.has(key)) missing.push([row, col]);
        }
      }
      for (const key of keys) pinned.set(key, (pinned.get(key) || 0) + 1);
      try {
        const blocks = planAnfrCellBlocks(missing, maxCells);
        const missingKeys = new Set(missing.map(([row, col]) => cellKey(row, col)));
        const asked = epoch;
        for (const block of blocks) {
          const request = Promise.resolve()
            .then(() => fetchBlock(anfrCellBlockBox(block)))
            .then((payload) => file(block, payload, asked));
          const claimed = [];
          for (let row = block.r0; row <= block.r1; row++) {
            for (let col = block.c0; col <= block.c1; col++) {
              const key = cellKey(row, col);
              if (missingKeys.has(key)) claimed.push(key);
            }
          }
          for (const key of claimed) pending.set(key, request);
          const release = () => {
            for (const key of claimed) if (pending.get(key) === request) pending.delete(key);
          };
          request.then(release, release);
        }
        // A cell another view is already asking about is waited for, not
        // asked twice; a cell already held waits for nothing.
        const waits = new Set();
        for (const key of keys) if (!fresh(key) && pending.has(key)) waits.add(pending.get(key));
        await Promise.all(waits);

        const supports = [];
        let truncated = false;
        for (const key of keys) {
          const cell = cells.get(key);
          // A cell a failed request left empty fails the view: the caller keeps
          // what it has drawn rather than draw a hole as an empty town.
          if (!cell) throw new Error('supports cell unavailable');
          if (cell.truncated) truncated = true;
          cells.delete(key);
          cells.set(key, cell);
          for (const support of cell.supports) if (inBox(support, box)) supports.push(support);
        }
        supports.sort((a, b) => a.id - b.id);
        return {
          ...meta,
          supports,
          count: supports.length,
          inBox: supports.length,
          truncated,
          box,
          requested: blocks.length,
        };
      } finally {
        for (const key of keys) {
          const readers = pinned.get(key) - 1;
          if (readers > 0) pinned.set(key, readers);
          else pinned.delete(key);
        }
        evict();
      }
    },

    /** Every cell is asked for again at its next view. For the tests. */
    expire() {
      for (const cell of cells.values()) cell.at = -Infinity;
    },

    clear() {
      epoch += 1;
      cells.clear();
      pending.clear();
      meta = null;
    },
  };
}
