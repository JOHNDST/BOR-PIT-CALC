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
  /** individual depths behind each Σ, in reading order */
  terms: [number[], number[], number[], number[]];
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

export const LIMITS = { maxCols: 40, maxRows: 40 };

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

export function cornerType(n: number): CornerType | null {
  return n >= 1 && n <= 4 ? CORNER_TYPES[n - 1] : null;
}

function emptySide(): SideResult {
  return { sums: [0, 0, 0, 0], terms: [[], [], [], []], weighted: 0, volume: 0 };
}

export function compute(g: Grid): Result {
  const area = g.cellW * g.cellH;
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const cut = emptySide();
  const fill = emptySide();

  const corners = makeMatrix(g.rows + 1, g.cols + 1, (r, c): CornerResult => {
    const n = cornerCount(g.active, r, c);
    const existing = g.existing[r][c];
    const proposed = g.proposed[r][c];
    const h = existing - proposed;
    const res: CornerResult = {
      r,
      c,
      n,
      type: cornerType(n),
      existing,
      proposed,
      h,
      cut: Math.max(h, 0),
      fill: Math.max(-h, 0),
    };
    if (n > 0) {
      counts[n - 1]++;
      if (res.cut > 0) {
        cut.sums[n - 1] += res.cut;
        cut.terms[n - 1].push(res.cut);
      }
      if (res.fill > 0) {
        fill.sums[n - 1] += res.fill;
        fill.terms[n - 1].push(res.fill);
      }
    }
    return res;
  });

  for (const side of [cut, fill]) {
    side.weighted = side.sums.reduce((acc, s, i) => acc + (i + 1) * s, 0);
    side.volume = (area / 4) * side.weighted;
  }

  let activeCells = 0;
  const cells = makeMatrix(g.rows, g.cols, (r, c): CellResult => {
    const active = g.active[r][c];
    if (!active) return { r, c, active, cut: 0, fill: 0 };
    activeCells++;
    const four = [corners[r][c], corners[r][c + 1], corners[r + 1][c], corners[r + 1][c + 1]];
    return {
      r,
      c,
      active,
      cut: (area / 4) * four.reduce((a, k) => a + k.cut, 0),
      fill: (area / 4) * four.reduce((a, k) => a + k.fill, 0),
    };
  });

  return { area, corners, cells, counts, cut, fill, net: cut.volume - fill.volume, activeCells };
}

/** Cubic feet per cubic yard. */
export const FT3_PER_YD3 = 27;
