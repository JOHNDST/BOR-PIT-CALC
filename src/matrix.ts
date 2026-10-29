// Parse and format elevation matrices (one row of grid corners per line).

export type Cell = number | null;

export interface ParseResult {
  values: Cell[][];
  error: string | null;
}

const BLANK = new Set(['', '-', 'x', 'X', '.', '*']);

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (/[,;]/.test(line)) return line.split(/[,;]/);
  return line.trim().split(/\s+/);
}

/**
 * Accepts values separated by tabs (spreadsheet paste), commas, semicolons or spaces.
 * Blank, "-" or "x" leave a corner unchanged. Parentheses, quotes and a trailing ' are ignored,
 * so "(103.5')" reads as 103.5.
 */
export function parseMatrix(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const values: Cell[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const row: Cell[] = [];
    const tokens = splitLine(lines[i]);
    for (let j = 0; j < tokens.length; j++) {
      const t = tokens[j].replace(/[()'"’]/g, '').replace(/ft$|m$/i, '').trim();
      if (BLANK.has(t)) {
        row.push(null);
        continue;
      }
      const v = Number(t);
      if (!Number.isFinite(v)) {
        return { values: [], error: `Row ${i + 1}, value ${j + 1}: "${tokens[j].trim()}" is not a number` };
      }
      row.push(v);
    }
    values.push(row);
  }
  if (values.length === 0) return { values, error: 'Matrix is empty' };
  return { values, error: null };
}

export function matrixShape(values: Cell[][]): { rows: number; cols: number; ragged: boolean } {
  const cols = Math.max(0, ...values.map((r) => r.length));
  return { rows: values.length, cols, ragged: values.some((r) => r.length !== cols) };
}

export function fmt(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Elevation style: up to `digits` decimals but never fewer than one (100 -> "100.0"). */
export function fmtElev(v: number, digits = 2): string {
  const s = fmt(v, digits);
  return s.includes('.') ? s : `${s}.0`;
}

/** Column-aligned text for the matrix editors. Unused corners print as "-". */
export function formatMatrix(m: number[][], used: (r: number, c: number) => boolean): string {
  const cells = m.map((row, r) => row.map((v, c) => (used(r, c) ? fmtElev(v) : '-')));
  const width = Math.max(1, ...cells.flat().map((s) => s.length));
  return cells.map((row) => row.map((s) => s.padStart(width)).join(' ')).join('\n');
}
