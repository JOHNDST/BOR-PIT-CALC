import { useEffect, useState } from 'react';
import { type Grid, LIMITS, type Units } from '../calc';
import { fmt } from '../matrix';
import { IconButton } from './Icon';

interface Props {
  grid: Grid;
  onGenerate: (g: { cellW: number; cellH: number; cols: number; rows: number; units: Units }) => void;
  onReset: () => void;
}

export function GridSetup({ grid, onGenerate, onReset }: Props) {
  const fromGrid = () => ({
    cellW: fmt(grid.cellW, 3),
    cellH: fmt(grid.cellH, 3),
    cols: String(grid.cols),
    rows: String(grid.rows),
    units: grid.units,
  });
  const [f, setF] = useState(fromGrid);
  const [err, setErr] = useState<string | null>(null);

  // follow external changes (examples, matrix resize)
  useEffect(() => setF(fromGrid()), [grid.cellW, grid.cellH, grid.cols, grid.rows, grid.units]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cellW = Number(f.cellW);
    const cellH = Number(f.cellH);
    const cols = Number(f.cols);
    const rows = Number(f.rows);
    if (!(cellW > 0) || !(cellH > 0)) return setErr('Cell width and height must be positive numbers.');
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)
      return setErr('Column and row counts must be whole numbers of at least 1.');
    if (cols > LIMITS.maxCols || rows > LIMITS.maxRows) return setErr(`At most ${LIMITS.maxCols} x ${LIMITS.maxRows} cells.`);
    setErr(null);
    onGenerate({ cellW, cellH, cols, rows, units: f.units });
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="setup" onSubmit={submit}>
      <div className="two">
        <label className="field">
          <span>Cell width</span>
          <input inputMode="decimal" value={f.cellW} onChange={set('cellW')} />
        </label>
        <label className="field">
          <span>Cell height</span>
          <input inputMode="decimal" value={f.cellH} onChange={set('cellH')} />
        </label>
        <label className="field">
          <span>Columns</span>
          <input inputMode="numeric" value={f.cols} onChange={set('cols')} />
        </label>
        <label className="field">
          <span>Rows</span>
          <input inputMode="numeric" value={f.rows} onChange={set('rows')} />
        </label>
      </div>
      <div className="row-btns">
        <select value={f.units} onChange={set('units')} aria-label="Units" className="units">
          <option value="ft">ft / yd³</option>
          <option value="m">m / m³</option>
        </select>
        <IconButton icon="reset" label="Reset: all cells on, every elevation back to 0" onClick={onReset} />
        <button className="btn primary grow" type="submit" title="Keeps the elevations that still fit. New corners start at 0.">
          Generate
        </button>
      </div>
      {err && <div className="msg">{err}</div>}
    </form>
  );
}
