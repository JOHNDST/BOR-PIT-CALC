import { describe, expect, it } from 'vitest';
import { compute, createGrid, cornerCount, FT3_PER_YD3, resizeGrid, sideTerms } from './calc';
import { PRESETS } from './presets';
import { formatMatrix, parseMatrix } from './matrix';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.grid;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

describe('borrow pit method', () => {
  it('matches the in-class exercise (1,819.2 ft³ = 67.38 yd³ of cut)', () => {
    const r = compute(preset('exercise'));
    expect(r.counts).toEqual([5, 4, 1, 1]);
    expect(r.cut.sums.map((s) => round(s, 1))).toEqual([15.6, 17.9, 2.8, 4.0]);
    expect(round(r.cut.volume, 1)).toBe(1819.2);
    expect(round(r.cut.volume / FT3_PER_YD3)).toBe(67.38);
    expect(r.fill.volume).toBe(0);
    expect(r.corners[1][1].type).toBe('D');
    expect(r.corners[1][2].type).toBe('C');
    expect(r.corners[2][3].type).toBeNull();
  });

  it('matches the basement example (9,510.4 ft³ = 352.2 yd³ of cut)', () => {
    const r = compute(preset('basement'));
    expect(r.counts).toEqual([6, 4, 2, 0]);
    expect(r.cut.sums.map((s) => round(s, 1))).toEqual([47.9, 27.4, 15.3, 0]);
    expect(round(r.cut.volume, 1)).toBe(9510.4);
    expect(round(r.cut.volume / FT3_PER_YD3, 1)).toBe(352.2);
  });

  it('splits cut and fill and the cell volumes add up to the totals', () => {
    const g = createGrid(2, 2, 10, 5, 'm');
    g.existing = [
      [1, 2, 3],
      [0, 0, 0],
      [-1, -2, 1],
    ];
    const r = compute(g);
    // A = 50; cut: A(1) A(3) A(1) B(2) => 1+3+1 + 2*2 = 9; fill: A(1) B(2) => 1 + 2*2 = 5
    expect(r.cut.volume).toBe((50 / 4) * 9);
    expect(r.fill.volume).toBe((50 / 4) * 5);
    const cellCut = r.cells.flat().reduce((a, c) => a + c.cut, 0);
    const cellFill = r.cells.flat().reduce((a, c) => a + c.fill, 0);
    expect(cellCut).toBeCloseTo(r.cut.volume);
    expect(cellFill).toBeCloseTo(r.fill.volume);
  });

  it('counts diagonal neighbours and ignores corners outside the site', () => {
    const active = [
      [true, false],
      [false, true],
    ];
    expect(cornerCount(active, 1, 1)).toBe(2);
    expect(cornerCount(active, 0, 2)).toBe(0);
  });

  it('lists the depths behind each Σ, capped for display', () => {
    const r = compute(preset('basement'));
    const t = sideTerms(r, 'cut', 3);
    expect(t.total).toEqual([5, 4, 2, 0]); // the 0.0 corner adds nothing to Σh1
    expect(t.shown[0].map((v) => round(v, 1))).toEqual([5.6, 14.1, 15.8]); // reading order, first 3 of 5
    expect(t.shown[2].map((v) => round(v, 1))).toEqual([4.4, 10.9]);
  });

  it('handles the largest grid quickly', () => {
    const g = createGrid(300, 300, 5, 5, 'ft');
    g.existing = g.existing.map((row, r) => row.map((_, c) => 100 + Math.sin(r / 25) * 4 + Math.cos(c / 31) * 3));
    g.proposed = g.proposed.map((row) => row.map(() => 100));
    const t = performance.now();
    const r = compute(g);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(r.counts).toEqual([4, 1196, 0, 89401]);
    const cellCut = r.cells.flat().reduce((a, c) => a + c.cut, 0);
    expect(cellCut / r.cut.volume).toBeCloseTo(1, 9);
  });

  it('keeps values when resizing', () => {
    const g = resizeGrid(preset('exercise'), 4, 3);
    expect(g.existing[0][0]).toBe(103.5);
    expect(g.existing[3][4]).toBe(0);
    expect(g.active[1][2]).toBe(false);
    expect(g.active[2][3]).toBe(true);
  });
});

describe('matrix text', () => {
  it('reads spaces, tabs, commas, blanks and parentheses', () => {
    const p = parseMatrix("(103.5) 105.6'  102.1\n1,2,-\n4\t\t6");
    expect(p.error).toBeNull();
    expect(p.values).toEqual([
      [103.5, 105.6, 102.1],
      [1, 2, null],
      [4, null, 6],
    ]);
  });

  it('reports the bad token', () => {
    expect(parseMatrix('1 2\n3 abc').error).toMatch(/Row 2, value 2/);
  });

  it('formats aligned columns with unused corners as -', () => {
    expect(formatMatrix([[1, 22.5], [3, 4]], (r, c) => !(r === 1 && c === 1))).toBe(' 1.0 22.5\n 3.0    -');
  });
});
