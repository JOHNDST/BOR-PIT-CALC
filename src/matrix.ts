// Parse and format elevation matrices (one row of grid corners per line).

export type Cell = number | null;

export interface ParseResult {
  values: Cell[][];
  error: string | null;
}

const BLANK = new Set(['', '-', 'x', 'X', '.', '*']);

function splitLine(line: string): string[] {
  // spreadsheet copies are tab separated and may carry thousands separators ("1,234.5")
  if (line.includes('\t')) return line.split('\t').map((t) => t.replace(/,(?=\d{3}(?!\d))/g, ''));
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

/** Tab separated rows, the format spreadsheets paste. */
export function toTSV(m: number[][], r0 = 0, c0 = 0, r1 = m.length - 1, c1 = (m[0]?.length ?? 1) - 1): string {
  const lines: string[] = [];
  for (let r = r0; r <= r1; r++) lines.push(m[r].slice(c0, c1 + 1).map((v) => fmt(v, 3)).join('\t'));
  return lines.join('\n');
}
