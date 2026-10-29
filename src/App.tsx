import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { compute, cornerCount, createGrid, type Grid, resizeGrid } from './calc';
import { type Cell, fmt } from './matrix';
import { PRESETS } from './presets';
import { CornerEditor } from './components/CornerEditor';
import { GridSetup } from './components/GridSetup';
import { IconButton } from './components/Icon';
import { IsoView } from './components/IsoView';
import { MatrixInput } from './components/MatrixInput';
import { type CornerRef, type Mode, PlanView } from './components/PlanView';
import { Results } from './components/Results';

const STORAGE_KEY = 'borrow-pit-calc/v1';

type View = 'plan' | 'iso';
type Field = 'existing' | 'proposed';

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

function applyValues(m: number[][], values: Cell[][]): number[][] {
  return m.map((row, r) => row.map((v, c) => values[r]?.[c] ?? v));
}

export default function App() {
  const [grid, setGrid] = useState<Grid>(load);
  const [mode, setMode] = useState<Mode>('edit');
  const [view, setView] = useState<View>('plan');
  const [tab, setTab] = useState<Field>('existing');
  const [selected, setSelected] = useState<CornerRef | null>(null);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [level, setLevel] = useState('0');

  const result = useMemo(() => compute(grid), [grid]);

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

  // drop the selection when its corner leaves the site
  const selCorner = selected ? result.corners[selected.r]?.[selected.c] : undefined;
  useEffect(() => {
    if (selected && !selCorner?.type) setSelected(null);
  }, [selected, selCorner]);

  // the matrix text and results can trail a fast series of edits on big grids; the plan stays live
  const lazyGrid = useDeferredValue(grid);
  const lazyResult = useDeferredValue(result);

  // depends on the site shape only, so editing elevations does not reformat both matrices
  const active = lazyGrid.active;
  const used = useCallback((r: number, c: number) => cornerCount(active, r, c) > 0, [active]);
  const usedList = useMemo(() => result.corners.flat().filter((k) => k.type), [result]);

  const step = (dir: 1 | -1) => {
    if (!selected || !usedList.length) return;
    const i = usedList.findIndex((k) => k.r === selected.r && k.c === selected.c);
    const n = usedList[(i + dir + usedList.length) % usedList.length];
    setSelected({ r: n.r, c: n.c });
  };

  const setCorner = (field: Field, v: number) => {
    if (!selected) return;
    setGrid((g) => {
      const m = g[field].slice();
      m[selected.r] = m[selected.r].slice();
      m[selected.r][selected.c] = v;
      return { ...g, [field]: m };
    });
  };

  const toggleCell = (r: number, c: number) =>
    setGrid((g) => {
      const next = g.active.slice();
      next[r] = next[r].slice();
      next[r][c] = !next[r][c];
      if (!next.some((row) => row.some(Boolean))) return g; // keep at least one cell
      return { ...g, active: next };
    });

  const resizeAndApply = (field: Field, values: Cell[][]) => {
    const rows = values.length - 1;
    const cols = Math.max(...values.map((r) => r.length)) - 1;
    setGrid((g) => {
      const next = resizeGrid(g, cols, rows);
      return { ...next, [field]: applyValues(next[field], values) };
    });
  };

  const levelValue = Number(level);
  const levelOk = level.trim() !== '' && Number.isFinite(levelValue);

  const hoverCell = hover && mode === 'edit' ? result.cells[hover.r]?.[hover.c] : null;
  const status = (() => {
    if (mode === 'shape') return 'Click cells to add or remove them from the site. Drag to pan, scroll or pinch to zoom.';
    if (!hoverCell?.active) return 'Click a corner to edit its elevations. Hover a cell to see its volume. Drag to pan, scroll or pinch to zoom.';
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
            <div className="row-btns examples">
              <span className="dim">Examples</span>
              {PRESETS.map((p) => (
                <button key={p.id} className="btn sm" title={p.note} onClick={() => setGrid(structuredClone(p.grid))}>
                  {p.label}
                </button>
              ))}
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
            <MatrixInput
              label="Existing"
              hidden={tab !== 'existing'}
              matrix={lazyGrid.existing}
              used={used}
              onApply={(v) => setGrid((g) => ({ ...g, existing: applyValues(g.existing, v) }))}
              onResizeApply={(v) => resizeAndApply('existing', v)}
            />
            <MatrixInput
              label="Proposed"
              hidden={tab !== 'proposed'}
              matrix={lazyGrid.proposed}
              used={used}
              onApply={(v) => setGrid((g) => ({ ...g, proposed: applyValues(g.proposed, v) }))}
              onResizeApply={(v) => resizeAndApply('proposed', v)}
            >
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
            </MatrixInput>
            <p className="hint">One row of corners per line. Paste from a spreadsheet; - skips a corner.</p>
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
                <IconButton icon="pencil" label="Edit elevations: click a corner" active={mode === 'edit'} onClick={() => setMode('edit')} />
                <IconButton
                  icon="shape"
                  label="Edit site shape: click cells to add or remove"
                  active={mode === 'shape'}
                  onClick={() => {
                    setMode('shape');
                    setSelected(null);
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
              selected={selected}
              onCornerClick={setSelected}
              onCellClick={toggleCell}
              onCellHover={setHover}
              overlay={(L, pz, size) =>
                selCorner?.type && mode === 'edit' ? (
                  <CornerEditor
                    key={`${selCorner.r}-${selCorner.c}`}
                    corner={selCorner}
                    layout={L}
                    view={pz}
                    viewport={size}
                    units={grid.units}
                    onChange={setCorner}
                    onStep={step}
                    onClose={() => setSelected(null)}
                  />
                ) : null
              }
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
            <span className="lg dim">cell volumes in {grid.units}³</span>
          </div>
        </section>

        <aside className="panel results">
          <h2>Results</h2>
          <Results grid={lazyGrid} result={lazyResult} />
        </aside>
      </main>
      <footer className="foot">h = existing - proposed. Positive h is cut, negative h is fill. Corners are typed by how many site cells share them.</footer>
    </div>
  );
}
