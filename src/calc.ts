// Borrow pit (grid) method.
// V = A/4 * (1*Σh1 + 2*Σh2 + 3*Σh3 + 4*Σh4), where Σhn sums the elevation changes at every
// grid corner shared by n active cells. Cut and fill are summed separately (h = existing - proposed).

export type Units = 'ft' | 'm';
export type CornerType = 'A' | 'B' | 'C' | 'D';

export const CORNER_TYPES: CornerType[] = ['A', 'B', 'C', 'D'];

export interface Grid {
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  units: Units;
  /** rows x cols, true when the cell is part of the site */
  active: boolean[][];
  /** (rows+1) x (cols+1) corner elevations */
  existing: number[][];
  proposed: number[][];
}

export interface CornerResult {
  r: number;
  c: number;
  /** number of active cells touching this corner (0 means the corner is unused) */
  n: number;
  type: CornerType | null;
  existing: number;
  proposed: number;
  /** existing - proposed; positive is cut, negative is fill */
  h: number;
  cut: number;
  fill: number;
}

export interface CellResult {
  r: number;
  c: number;
  active: boolean;
  cut: number;
  fill: number;
}

export interface SideResult {
  /** Σh1..Σh4 */
  sums: [number, number, number, number];
  /** 1*Σh1 + 2*Σh2 + 3*Σh3 + 4*Σh4 */
  weighted: number;
  volume: number;
}

export interface Result {
  area: number;
  corners: CornerResult[][];
  cells: CellResult[][];
  counts: [number, number, number, number];
  cut: SideResult;
  fill: SideResult;
  net: number;
  activeCells: number;
}

export const LIMITS = { maxCols: 300, maxRows: 300 };

export function makeMatrix<T>(rows: number, cols: number, fill: (r: number, c: number) => T): T[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fill(r, c)));
}

export function createGrid(cols: number, rows: number, cellW: number, cellH: number, units: Units): Grid {
  return {
    cellW,
    cellH,
    cols,
    rows,
    units,
    active: makeMatrix(rows, cols, () => true),
    existing: makeMatrix(rows + 1, cols + 1, () => 0),
    proposed: makeMatrix(rows + 1, cols + 1, () => 0),
  };
}

/** Resize a grid, keeping every value that still fits. New cells are active, new corners are 0. */
export function resizeGrid(g: Grid, cols: number, rows: number): Grid {
  const keep = <T>(m: T[][], r: number, c: number, d: T) => (r < m.length && c < m[r].length ? m[r][c] : d);
  return {
    ...g,
    cols,
    rows,
    active: makeMatrix(rows, cols, (r, c) => keep(g.active, r, c, true)),
    existing: makeMatrix(rows + 1, cols + 1, (r, c) => keep(g.existing, r, c, 0)),
    proposed: makeMatrix(rows + 1, cols + 1, (r, c) => keep(g.proposed, r, c, 0)),
  };
}

export function cornerCount(active: boolean[][], r: number, c: number): number {
  let n = 0;
  for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
    if (active[r + dr]?.[c + dc]) n++;
  }
  return n;
}

/**
 * Plain loops and one object per corner and cell: this runs on every edit, and a 300 x 300 grid
 * has about 90k corners.
 */
export function compute(g: Grid): Result {
  const { rows, cols, active, existing, proposed } = g;
  const area = g.cellW * g.cellH;
  const q = area / 4;
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const cutSums: [number, number, number, number] = [0, 0, 0, 0];
  const fillSums: [number, number, number, number] = [0, 0, 0, 0];

  const corners: CornerResult[][] = new Array(rows + 1);
  for (let r = 0; r <= rows; r++) {
    const up = active[r - 1];
    const down = active[r];
    const eRow = existing[r];
    const pRow = proposed[r];
    const row: CornerResult[] = new Array(cols + 1);
    for (let c = 0; c <= cols; c++) {
      const n = (up ? +!!up[c - 1] + +!!up[c] : 0) + (down ? +!!down[c - 1] + +!!down[c] : 0);
      const e = eRow[c];
      const p = pRow[c];
      const h = e - p;
      const cut = h > 0 ? h : 0;
      const fill = h < 0 ? -h : 0;
      if (n > 0) {
        counts[n - 1]++;
        cutSums[n - 1] += cut;
        fillSums[n - 1] += fill;
      }
      row[c] = { r, c, n, type: n > 0 ? CORNER_TYPES[n - 1] : null, existing: e, proposed: p, h, cut, fill };
    }
    corners[r] = row;
  }

  let activeCells = 0;
  const cells: CellResult[][] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const top = corners[r];
    const bottom = corners[r + 1];
    const row: CellResult[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      if (!active[r][c]) {
        row[c] = { r, c, active: false, cut: 0, fill: 0 };
        continue;
      }
      activeCells++;
      row[c] = {
        r,
        c,
        active: true,
        cut: q * (top[c].cut + top[c + 1].cut + bottom[c].cut + bottom[c + 1].cut),
        fill: q * (top[c].fill + top[c + 1].fill + bottom[c].fill + bottom[c + 1].fill),
      };
    }
    cells[r] = row;
  }

  const side = (sums: [number, number, number, number]): SideResult => {
    const weighted = sums[0] + 2 * sums[1] + 3 * sums[2] + 4 * sums[3];
    return { sums, weighted, volume: q * weighted };
  };
  const cut = side(cutSums);
  const fill = side(fillSums);
  return { area, corners, cells, counts, cut, fill, net: cut.volume - fill.volume, activeCells };
}

export interface Terms {
  /** first `limit` depths behind each Σ, in reading order */
  shown: [number[], number[], number[], number[]];
  /** how many non-zero depths each Σ has */
  total: [number, number, number, number];
}

/** The individual depths behind Σh1..Σh4, for display only (kept out of compute). */
export function sideTerms(result: Result, side: 'cut' | 'fill', limit: number): Terms {
  const shown: Terms['shown'] = [[], [], [], []];
  const total: Terms['total'] = [0, 0, 0, 0];
  for (const row of result.corners) {
    for (const k of row) {
      const v = k[side];
      if (k.n === 0 || v <= 0) continue;
      total[k.n - 1]++;
      if (shown[k.n - 1].length < limit) shown[k.n - 1].push(v);
    }
  }
  return { shown, total };
}

/** Cubic feet per cubic yard. */
export const FT3_PER_YD3 = 27;
