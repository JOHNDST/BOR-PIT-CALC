import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { compute, cornerCount, createGrid, type Grid, LIMITS, resizeGrid } from './calc';
import { type Cell, fmt, fmtElev } from './matrix';
import { EXAMPLE, PRESETS } from './presets';
import { GridSetup } from './components/GridSetup';
import { IconButton } from './components/Icon';
import { IsoView } from './components/IsoView';
import { type EditRef, type Field, type Hover, type Mode, PlanView } from './components/PlanView';
import { Results } from './components/Results';
import { Sheet } from './components/Sheet';

const STORAGE_KEY = 'borrow-pit-calc/v1';

type View = 'plan' | 'iso';

function validGrid(g: unknown): g is Grid {
  const x = g as Grid;
  return (
    !!x &&
    x.cellW > 0 &&
    x.cellH > 0 &&
    Array.isArray(x.active) &&
    x.active.length === x.rows &&
    x.existing?.length === x.rows + 1 &&
    x.proposed?.length === x.rows + 1 &&
    x.existing.every((r) => r.length === x.cols + 1) &&
    x.proposed.every((r) => r.length === x.cols + 1)
  );
}

function load(): Grid {
  const fallback = createGrid(4, 3, 10, 10, 'ft');
  try {
    const preset = PRESETS.find((p) => p.id === new URLSearchParams(location.search).get('example'));
    if (preset) return structuredClone(preset.grid);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return validGrid(saved?.grid) ? saved.grid : fallback;
  } catch {
    return fallback;
  }
}

/** Copy of a matrix with one value changed; untouched rows are shared. */
function withValue(m: number[][], r: number, c: number, v: number): number[][] {
  const next = m.slice();
  next[r] = next[r].slice();
  next[r][c] = v;
  return next;
}

export default function App() {
  const [grid, setGrid] = useState<Grid>(load);
  const [mode, setMode] = useState<Mode>('edit');
  const [view, setView] = useState<View>('plan');
  const [tab, setTab] = useState<Field>('existing');
  const [editing, setEditing] = useState<EditRef | null>(null);
  const [hover, setHover] = useState<Hover>({ corner: null, cell: null });
  const [level, setLevel] = useState('0');

  const result = useMemo(() => compute(grid), [grid]);
  // the results panel can trail a fast series of edits on big grids; the plan stays live
  const lazyGrid = useDeferredValue(grid);
  const lazyResult = useDeferredValue(result);

  // saving a big grid takes a moment, so wait until edits pause
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ grid }));
      } catch {
        /* storage unavailable or full: nothing to keep */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [grid]);

  // stop editing a corner that left the site
  useEffect(() => {
    if (editing && !result.corners[editing.r]?.[editing.c]?.type) setEditing(null);
  }, [editing, result]);

  const active = grid.active;
  const used = useCallback((r: number, c: number) => cornerCount(active, r, c) > 0, [active]);
  const usedList = useMemo(() => result.corners.flat().filter((k) => k.type), [result]);

  const step = (dir: 1 | -1) => {
    if (!editing || !usedList.length) return;
    const i = usedList.findIndex((k) => k.r === editing.r && k.c === editing.c);
    const n = usedList[(i + dir + usedList.length) % usedList.length];
    setEditing({ r: n.r, c: n.c, field: editing.field });
  };

  const setValue = (field: Field, r: number, c: number, v: number) => setGrid((g) => ({ ...g, [field]: withValue(g[field], r, c, v) }));

  /** A block pasted from a spreadsheet; the grid grows (up to the limit) when the block does not fit. */
  const pasteBlock = (field: Field, r0: number, c0: number, values: Cell[][]) =>
    setGrid((g) => {
      const needRows = Math.min(LIMITS.maxRows, Math.max(g.rows, r0 + values.length - 1));
      const needCols = Math.min(LIMITS.maxCols, Math.max(g.cols, c0 + Math.max(...values.map((row) => row.length)) - 1));
      const next = needRows > g.rows || needCols > g.cols ? resizeGrid(g, needCols, needRows) : g;
      const m = next[field].map((row, r) =>
        r < r0 || r >= r0 + values.length ? row : row.map((v, c) => (c < c0 ? v : (values[r - r0][c - c0] ?? v))),
      );
      return { ...next, [field]: m };
    });

  const toggleCell = (r: number, c: number) =>
    setGrid((g) => {
      const next = g.active.slice();
      next[r] = next[r].slice();
      next[r][c] = !next[r][c];
      if (!next.some((row) => row.some(Boolean))) return g; // keep at least one cell
      return { ...g, active: next };
    });

  const levelValue = Number(level);
  const levelOk = level.trim() !== '' && Number.isFinite(levelValue);

  const status = (() => {
    if (mode === 'shape') return 'Click cells to add or remove them from the site. Drag to pan, scroll or pinch to zoom.';
    const k = hover.corner ? result.corners[hover.corner.r]?.[hover.corner.c] : null;
    if (k?.type) {
      const kind = k.cut > 0 ? 'cut' : k.fill > 0 ? 'fill' : 'no change';
      return `CORNER ${k.r + 1},${k.c + 1}  type ${k.type} (${k.n} cell${k.n > 1 ? 's' : ''}, ×${k.n})  existing ${fmtElev(k.existing)}  proposed ${fmtElev(k.proposed)}  h = ${k.h > 0 ? '+' : ''}${fmtElev(k.h)} ${grid.units} ${kind}`;
    }
    const cell = hover.cell ? result.cells[hover.cell.r]?.[hover.cell.c] : null;
    if (cell?.active) {
      const ks = [
        result.corners[cell.r][cell.c],
        result.corners[cell.r][cell.c + 1],
        result.corners[cell.r + 1][cell.c],
        result.corners[cell.r + 1][cell.c + 1],
      ];
      const part = (name: string, vals: number[], v: number) =>
        `${name} = ${fmt(result.area)}/4 × (${vals.map((x) => fmt(x)).join(' + ')}) = ${fmt(v, 1)} ${grid.units}³`;
      return `CELL ${cell.r + 1},${cell.c + 1}  ${part('cut', ks.map((x) => x.cut), cell.cut)}   ${part('fill', ks.map((x) => x.fill), cell.fill)}`;
    }
    return 'Click a number or a point to edit it; it saves as you type. Enter = next point, Tab = proposed / existing. Drag to pan, scroll to zoom.';
  })();

  return (
    <div className="app">
      <header className="top">
        <h1>Borrow Pit Calc</h1>
        <p className="sub">Grid method cut + fill. V = A/4 × (1Σh1 + 2Σh2 + 3Σh3 + 4Σh4)</p>
      </header>

      <main className="layout">
        <aside className="col-left">
          <section className="panel p-grid">
            <h2>1 Grid</h2>
            <GridSetup
              grid={grid}
              onGenerate={(f) => setGrid((g) => ({ ...resizeGrid(g, f.cols, f.rows), cellW: f.cellW, cellH: f.cellH, units: f.units }))}
              onReset={() => setGrid((g) => createGrid(g.cols, g.rows, g.cellW, g.cellH, g.units))}
            />
            <div className="row-btns">
              <span className="dim">Example</span>
              <button className="btn sm" title={EXAMPLE.note} onClick={() => setGrid(structuredClone(EXAMPLE.grid))}>
                {EXAMPLE.label}
              </button>
            </div>
          </section>

          <section className="panel p-elev">
            <h2>2 Elevations</h2>
            <div className="tabs" role="tablist" aria-label="Elevation matrix">
              {(['existing', 'proposed'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={tab === f} className={`btn sm ${tab === f ? 'on' : ''}`} onClick={() => setTab(f)}>
                  {f}
                </button>
              ))}
              <span className="dim grow-right">
                {grid.rows + 1} × {grid.cols + 1}
              </span>
            </div>
            <Sheet
              key={tab}
              label={tab}
              matrix={grid[tab]}
              used={used}
              onCell={(r, c, v) => setValue(tab, r, c, v)}
              onPaste={(r, c, values) => pasteBlock(tab, r, c, values)}
            />
            {tab === 'proposed' && (
              <div className="row-btns">
                <input className="level-input" aria-label="Level elevation" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
                <IconButton
                  icon="level"
                  label="Level all proposed corners to this elevation"
                  disabled={!levelOk}
                  onClick={() => setGrid((g) => ({ ...g, proposed: g.proposed.map((row) => row.map(() => levelValue)) }))}
                />
                <IconButton
                  icon="copy"
                  label="Copy existing elevations into proposed"
                  onClick={() => setGrid((g) => ({ ...g, proposed: g.existing.map((row) => row.slice()) }))}
                />
              </div>
            )}
            <p className="hint">Click a cell and paste from Excel (Ctrl+V). Drag or Ctrl+A to select, Ctrl+C to copy.</p>
          </section>
        </aside>

        <section className="panel viz">
          <div className="viz-bar">
            <div className="seg" aria-label="View">
              <IconButton icon="plan" label="Top view (plan)" active={view === 'plan'} onClick={() => setView('plan')} />
              <IconButton icon="iso" label="3D view (isometric)" active={view === 'iso'} onClick={() => setView('iso')} />
            </div>
            {view === 'plan' && (
              <div className="seg" aria-label="Edit mode">
                <IconButton icon="pencil" label="Edit elevations: click a number or a point" active={mode === 'edit'} onClick={() => setMode('edit')} />
                <IconButton
                  icon="shape"
                  label="Edit site shape: click cells to add or remove"
                  active={mode === 'shape'}
                  onClick={() => {
                    setMode('shape');
                    setEditing(null);
                  }}
                />
              </div>
            )}
          </div>

          {view === 'plan' ? (
            <PlanView
              grid={grid}
              result={result}
              mode={mode}
              editing={editing}
              onEdit={setEditing}
              onValue={(e, v) => setValue(e.field, e.r, e.c, v)}
              onStep={step}
              onCellClick={toggleCell}
              onHover={setHover}
            />
          ) : (
            <IsoView grid={grid} result={result} />
          )}

          <div className="status">
            {view === 'plan'
              ? status
              : 'Hatch = existing ground. Black = proposed grade, grey = existing grid, orange / blue = cut / fill depth. Dashed = hidden. Drag to pan, scroll or pinch to zoom.'}
          </div>

          <div className="legend">
            {(['A', 'B', 'C', 'D'] as const).map((t, i) => (
              <span key={t} className="lg">
                <span className={`badge-html type-${t}`}>{t}</span> {i + 1} cell{i ? 's' : ''}
              </span>
            ))}
            <span className="lg">
              <span className="sw sw-cut" /> cut
            </span>
            <span className="lg">
              <span className="sw sw-fill" /> fill
            </span>
            <span className="lg dim">P above, (E) below each point · cell volumes in {grid.units}³</span>
          </div>
        </section>

        <aside className="panel results">
          <h2>Results</h2>
          <Results grid={lazyGrid} result={lazyResult} />
        </aside>
      </main>
    </div>
  );
}
