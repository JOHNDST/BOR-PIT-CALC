import { type Grid, makeMatrix } from './calc';

export interface Preset {
  id: string;
  label: string;
  note: string;
  grid: Grid;
}

// In-class exercise: 12' x 8' cells, L-shaped site, level to 100.0' everywhere.
// Expected cut: 1,819.2 ft³ = 67.38 yd³.
const exercise: Grid = {
  cellW: 12,
  cellH: 8,
  cols: 3,
  rows: 2,
  units: 'ft',
  active: [
    [true, true, true],
    [true, true, false],
  ],
  existing: [
    [103.5, 105.6, 102.1, 101.9],
    [103.9, 104.0, 102.8, 103.7],
    [105.2, 106.3, 101.3, 0],
  ],
  proposed: makeMatrix(3, 4, (r, c) => (r === 2 && c === 3 ? 0 : 100)),
};

// Basement example: 16' x 16' cells, excavate to 26.9'. Expected cut: 9,510.4 ft³ = 352.2 yd³.
const basement: Grid = {
  cellW: 16,
  cellH: 16,
  cols: 4,
  rows: 2,
  units: 'ft',
  active: [
    [true, true, true, false],
    [false, false, true, true],
  ],
  existing: [
    [32.5, 35.8, 36.6, 41.0, 0],
    [26.9, 29.1, 31.3, 37.8, 42.7],
    [0, 0, 28.1, 33.5, 38.1],
  ],
  proposed: [
    [26.9, 26.9, 26.9, 26.9, 0],
    [26.9, 26.9, 26.9, 26.9, 26.9],
    [0, 0, 26.9, 26.9, 26.9],
  ],
};

// Sloping ground leveled to 100.0 ft, so the site has both cut (west) and fill (east).
const slope: Grid = {
  cellW: 20,
  cellH: 20,
  cols: 4,
  rows: 3,
  units: 'ft',
  active: makeMatrix(3, 4, () => true),
  existing: [
    [104.2, 103.1, 101.8, 99.6, 97.9],
    [103.8, 102.6, 100.9, 99.1, 97.2],
    [103.1, 101.9, 100.2, 98.4, 96.8],
    [102.7, 101.2, 99.5, 97.9, 96.1],
  ],
  proposed: makeMatrix(4, 5, () => 100),
};

export const PRESETS: Preset[] = [
  { id: 'exercise', label: 'Exercise', note: 'L-shaped site leveled to 100.0 ft', grid: exercise },
  { id: 'basement', label: 'Basement', note: 'Basement dug to 26.9 ft', grid: basement },
  { id: 'slope', label: 'Cut + fill', note: 'Sloping ground leveled to 100.0 ft', grid: slope },
];
