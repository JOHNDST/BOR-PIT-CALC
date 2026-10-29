import { useCallback, useEffect, useMemo, useState } from 'react';
import { compute, createGrid, type Grid, resizeGrid } from './calc';
import { type Cell, fmt } from './matrix';
import { PRESETS } from './presets';
import { CornerEditor } from './components/CornerEditor';
import { GridSetup } from './components/GridSetup';
import { IsoView } from './components/IsoView';
import { MatrixInput } from './components/MatrixInput';
import { type CornerRef, type Mode, PlanView } from './components/PlanView';
import { Results } from './components/Results';

const STORAGE_KEY = 'borrow-pit-calc/v1';
export const THEMES = [
  { id: 'maroon', label: 'Maroon' },
  { id: 'gameboy', label: 'Game Boy' },
  { id: 'twotone', label: 'Two-tone' },
  { id: 'blueprint', label: 'Blueprint' },
] as const;

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

function load(): { grid: Grid; theme: string } {
  const fallback = { grid: createGrid(4, 3, 10, 10, 'ft'), theme: 'maroon' };
  try {
    const params = new URLSearchParams(location.search);
    const preset = PRESETS.find((p) => p.id === params.get('example'));
    const theme = params.get('theme');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      grid: preset ? structuredClone(preset.grid) : validGrid(saved?.grid) ? saved.grid : fallback.grid,
      theme: theme ?? saved?.theme ?? fallback.theme,
    };
  } catch {
    return fallback;
  }
}

function applyValues(m: number[][], values: Cell[][]): number[][] {
  return m.map((row, r) => row.map((v, c) => values[r]?.[c] ?? v));
}

export default function App() {
  const initial = useMemo(load, []);
  const [grid, setGrid] = useState<Grid>(initial.grid);
  const [theme, setTheme] = useState(initial.theme);
  const [mode, setMode] = useState<Mode>('edit');
  const [view, setView] = useState<View>('plan');
  const [selected, setSelected] = useState<CornerRef | null>(null);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [level, setLevel] = useState('0');

  const result = useMemo(() => compute(grid), [grid]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ grid, theme }));
    } catch {
      /* storage unavailable: nothing to keep */
    }
  }, [grid, theme]);

  // drop the selection when its corner leaves the site
  const selCorner = selected ? result.corners[selected.r]?.[selected.c] : undefined;
  useEffect(() => {
    if (selected && !selCorner?.type) setSelected(null);
  }, [selected, selCorner]);

  const used = useCallback((r: number, c: number) => !!result.corners[r]?.[c]?.type, [result]);
  const usedList = useMemo(() => result.corners.flat().filter((k) => k.type), [result]);

  const step = (dir: 1 | -1) => {
    if (!selected || !usedList.length) return;
    const i = usedList.findIndex((k) => k.r === selected.r && k.c === selected.c);
    const n = usedList[(i + dir + usedList.length) % usedList.length];
    setSelected({ r: n.r, c: n.c });
  };

  const setCorner = (field: 'existing' | 'proposed', v: number) => {
    if (!selected) return;
    setGrid((g) => {
      const m = g[field].map((row) => row.slice());
      m[selected.r][selected.c] = v;
      return { ...g, [field]: m };
    });
  };

  const toggleCell = (r: number, c: number) =>
    setGrid((g) => {
      const active = g.active.map((row) => row.slice());
      active[r][c] = !active[r][c];
      if (!active.flat().some(Boolean)) return g; // keep at least one cell
      return { ...g, active };
    });

  const resizeAndApply = (field: 'existing' | 'proposed', values: Cell[][]) => {
    const rows = values.length - 1;
    const cols = Math.max(...values.map((r) => r.length)) - 1;
    setGrid((g) => {
      const next = resizeGrid(g, cols, rows);
      return { ...next, [field]: applyValues(next[field], values) };
    });
  };

  const hoverCell = hover && mode === 'edit' ? result.cells[hover.r]?.[hover.c] : null;
  const status = (() => {
    if (mode === 'shape') return 'SHAPE MODE: click cells to add or remove them from the site.';
    if (!hoverCell?.active) return 'Click a corner to edit its elevations. Hover a cell to see its volume.';
    const ks = [
      result.corners[hoverCell.r][hoverCell.c],
      result.corners[hoverCell.r][hoverCell.c + 1],
      result.corners[hoverCell.r + 1][hoverCell.c],
      result.corners[hoverCell.r + 1][hoverCell.c + 1],
    ];
    const part = (name: string, vals: number[], v: number) =>
      `${name} = ${fmt(result.area)}/4 × (${vals.map((x) => fmt(x)).join(' + ')}) = ${fmt(v, 1)} ${grid.units}³`;
    return `CELL ${hoverCell.r + 1},${hoverCell.c + 1}  ${part('cut', ks.map((k) => k.cut), hoverCell.cut)}   ${part('fill', ks.map((k) => k.fill), hoverCell.fill)}`;
  })();

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Borrow Pit Calc</h1>
          <p className="sub">
            Grid method cut + fill. V = A/4 × (1Σh1 + 2Σh2 + 3Σh3 + 4Σh4)
          </p>
        </div>
        <label className="field row theme-pick">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="layout">
        <aside className="col-left">
          <section className="panel p-grid">
            <h2>1 Grid</h2>
            <GridSetup grid={grid} onGenerate={(f) => setGrid((g) => ({ ...resizeGrid(g, f.cols, f.rows), cellW: f.cellW, cellH: f.cellH, units: f.units }))} />
            <div className="row-btns">
              {PRESETS.map((p) => (
                <button key={p.id} className="btn sm" title={p.note} onClick={() => setGrid(structuredClone(p.grid))}>
                  {p.label}
                </button>
              ))}
              <button className="btn sm" onClick={() => setGrid((g) => createGrid(g.cols, g.rows, g.cellW, g.cellH, g.units))}>
                Clear
              </button>
            </div>
          </section>

          <section className="panel p-existing">
            <h2>2 Existing</h2>
            <MatrixInput
              title="Existing elevations"
              matrix={grid.existing}
              used={used}
              onApply={(v) => setGrid((g) => ({ ...g, existing: applyValues(g.existing, v) }))}
              onResizeApply={(v) => resizeAndApply('existing', v)}
            />
          </section>

          <section className="panel p-proposed">
            <h2>3 Proposed</h2>
            <MatrixInput
              title="Proposed elevations"
              matrix={grid.proposed}
              used={used}
              onApply={(v) => setGrid((g) => ({ ...g, proposed: applyValues(g.proposed, v) }))}
              onResizeApply={(v) => resizeAndApply('proposed', v)}
            >
              <div className="row-btns level">
                <input aria-label="Level elevation" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
                <button
                  className="btn sm"
                  disabled={!Number.isFinite(Number(level)) || level.trim() === ''}
                  onClick={() => setGrid((g) => ({ ...g, proposed: g.proposed.map((row) => row.map(() => Number(level))) }))}
                >
                  Level all
                </button>
                <button className="btn sm" onClick={() => setGrid((g) => ({ ...g, proposed: g.existing.map((row) => row.slice()) }))}>
                  = Existing
                </button>
              </div>
            </MatrixInput>
          </section>
        </aside>

        <section className="panel viz">
          <div className="viz-bar">
            <div className="seg" role="tablist" aria-label="View">
              <button className={`btn sm ${view === 'plan' ? 'on' : ''}`} onClick={() => setView('plan')}>
                Plan
              </button>
              <button className={`btn sm ${view === 'iso' ? 'on' : ''}`} onClick={() => setView('iso')}>
                Iso 3D
              </button>
            </div>
            {view === 'plan' && (
              <div className="seg" aria-label="Edit mode">
                <button className={`btn sm ${mode === 'edit' ? 'on' : ''}`} onClick={() => setMode('edit')}>
                  Edit elev.
                </button>
                <button
                  className={`btn sm ${mode === 'shape' ? 'on' : ''}`}
                  onClick={() => {
                    setMode('shape');
                    setSelected(null);
                  }}
                >
                  Edit shape
                </button>
              </div>
            )}
          </div>

          {view === 'plan' ? (
            <PlanView
              grid={grid}
              result={result}
              mode={mode}
              selected={selected}
              onCornerClick={setSelected}
              onCellClick={toggleCell}
              onCellHover={setHover}
              overlay={(L) =>
                selCorner?.type && mode === 'edit' ? (
                  <CornerEditor
                    key={`${selCorner.r}-${selCorner.c}`}
                    corner={selCorner}
                    layout={L}
                    units={grid.units}
                    onChange={setCorner}
                    onStep={step}
                    onClose={() => setSelected(null)}
                  />
                ) : null
              }
            />
          ) : (
            <IsoView grid={grid} result={result} theme={theme} />
          )}

          <div className="status">{view === 'plan' ? status : 'Solid = proposed grade, dashed = existing ground, posts and walls = cut / fill depth.'}</div>

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
            <span className="lg dim">cell volumes in {grid.units}³</span>
          </div>
        </section>

        <aside className="panel results">
          <h2>Results</h2>
          <Results grid={grid} result={result} />
        </aside>
      </main>
      <footer className="foot">h = existing - proposed. Positive h is cut, negative h is fill. Corners are typed by how many site cells share them.</footer>
    </div>
  );
}
