import { useLayoutEffect, useRef, useState } from 'react';
import type { CornerResult, Grid, Result } from '../calc';
import { fmt, fmtElev } from '../matrix';

export type Mode = 'edit' | 'shape';
export interface CornerRef {
  r: number;
  c: number;
}

interface Props {
  grid: Grid;
  result: Result;
  mode: Mode;
  selected: CornerRef | null;
  onCornerClick: (k: CornerRef) => void;
  onCellClick: (r: number, c: number) => void;
  onCellHover: (cell: { r: number; c: number } | null) => void;
  /** HTML drawn over the SVG in the same coordinate space (corner editor) */
  overlay?: (L: Layout) => React.ReactNode;
}

export const MARGIN = { left: 40, top: 40, right: 86, bottom: 64 };
/** the corner editor must fit inside the stage */
export const MIN_STAGE_H = 300;
const CHAR_W = 8; // VT323 at 16px is a 8px-wide monospace
const LINE_H = 15;

export interface Layout {
  cw: number;
  ch: number;
  width: number;
  height: number;
  x: (c: number) => number;
  y: (r: number) => number;
  toScale: boolean;
}

/** Cell size on screen: keep the real aspect ratio when sensible, never smaller than the labels need. */
export function layoutFor(grid: Grid, availW: number): Layout {
  const real = grid.cellW / grid.cellH;
  const aspect = Math.min(2.5, Math.max(0.4, real));
  let w = Math.max(128, 100 * aspect);
  let h = w / aspect;
  const room = (availW - MARGIN.left - MARGIN.right) / (grid.cols * w);
  const k = Math.min(1.7, Math.max(1, room));
  w = Math.round((w * k) / 2) * 2;
  h = Math.round((h * k) / 2) * 2;
  return {
    cw: w,
    ch: h,
    width: MARGIN.left + grid.cols * w + MARGIN.right,
    height: Math.max(MIN_STAGE_H, MARGIN.top + grid.rows * h + MARGIN.bottom),
    x: (c) => MARGIN.left + c * w,
    y: (r) => MARGIN.top + r * h,
    toScale: Math.abs(aspect - real) < 1e-9,
  };
}

/** 5x3 pixel arrow, pointing down for cut and up for fill. */
function Arrow({ x, y, dir, cls }: { x: number; y: number; dir: 'down' | 'up'; cls: string }) {
  const d =
    dir === 'down'
      ? `M${x} ${y}h10v2h-10zM${x + 2} ${y + 2}h6v2h-6zM${x + 4} ${y + 4}h2v2h-2z`
      : `M${x + 4} ${y}h2v2h-2zM${x + 2} ${y + 2}h6v2h-6zM${x} ${y + 4}h10v2h-10z`;
  return <path d={d} className={cls} />;
}

function Chip({ x, y, lines }: { x: number; y: number; lines: { text: string; cls: string; arrow?: 'down' | 'up' }[] }) {
  const w = Math.max(...lines.map((l) => l.text.length * CHAR_W + (l.arrow ? 14 : 0))) + 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={lines.length * LINE_H + 4} className="chip" />
      {lines.map((l, i) => {
        const ty = y + 2 + i * LINE_H;
        return (
          <g key={i}>
            {l.arrow && <Arrow x={x + 3} y={ty + 5} dir={l.arrow} cls={l.arrow === 'down' ? 'ink-cut' : 'ink-fill'} />}
            <text x={x + 3 + (l.arrow ? 14 : 0)} y={ty + 12} className={l.cls}>
              {l.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function cornerLines(k: CornerResult) {
  const lines: { text: string; cls: string; arrow?: 'down' | 'up' }[] = [
    { text: `(${fmtElev(k.existing)})`, cls: 't-soft' },
    { text: fmtElev(k.proposed), cls: 't-ink' },
  ];
  if (k.cut > 0) lines.push({ text: fmtElev(k.cut), cls: 't-cut', arrow: 'down' });
  else if (k.fill > 0) lines.push({ text: fmtElev(k.fill), cls: 't-fill', arrow: 'up' });
  else lines.push({ text: '0.0', cls: 't-soft' });
  return lines;
}

export function PlanView({ grid, result, mode, selected, onCornerClick, onCellClick, onCellHover, overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [availW, setAvailW] = useState(800);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth));
    ro.observe(el);
    setAvailW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const L = layoutFor(grid, availW);
  const { rows, cols, active } = grid;
  const on = (r: number, c: number) => !!active[r]?.[c];

  // Site boundary is solid, interior grid lines are dashed (as in the textbook figures).
  const edges: { x1: number; y1: number; x2: number; y2: number; boundary: boolean }[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = on(r - 1, c);
      const b = on(r, c);
      if (a || b) edges.push({ x1: L.x(c), y1: L.y(r), x2: L.x(c + 1), y2: L.y(r), boundary: a !== b });
    }
  }
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows; r++) {
      const a = on(r, c - 1);
      const b = on(r, c);
      if (a || b) edges.push({ x1: L.x(c), y1: L.y(r), x2: L.x(c), y2: L.y(r + 1), boundary: a !== b });
    }
  }

  const unit = grid.units;

  return (
    <div className="plan-wrap" ref={wrap}>
      <div className="plan-scroll">
        <div className="plan-stage" style={{ width: L.width, height: L.height }}>
          <svg
            width={L.width}
            height={L.height}
            viewBox={`0 0 ${L.width} ${L.height}`}
            className={`plan mode-${mode}`}
            onMouseLeave={() => onCellHover(null)}
          >
            <defs>
              <pattern id="pat-cut" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0h2v2H0zM2 2h2v2H2zM4 4h2v2H4zM6 6h2v2H6z" className="pat-cut" />
              </pattern>
              <pattern id="pat-fill" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0h2v2H0zM4 4h2v2H4z" className="pat-fill" />
              </pattern>
              <pattern id="pat-off" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0h2v2H0z" className="ink-faint" />
              </pattern>
            </defs>

            {/* corner indices, matching the matrix rows and columns */}
            {Array.from({ length: cols + 1 }, (_, c) => (
              <text key={`cx${c}`} x={L.x(c)} y={18} className="t-axis" textAnchor="middle">
                {c + 1}
              </text>
            ))}
            {Array.from({ length: rows + 1 }, (_, r) => (
              <text key={`ry${r}`} x={16} y={L.y(r) + 5} className="t-axis" textAnchor="middle">
                {r + 1}
              </text>
            ))}
            <text x={(L.x(0) + L.x(1)) / 2} y={33} className="t-dim" textAnchor="middle">
              {fmt(grid.cellW)} {unit}
            </text>
            <text
              x={MARGIN.left - 26}
              y={(L.y(0) + L.y(1)) / 2}
              className="t-dim"
              textAnchor="middle"
              transform={`rotate(-90 ${MARGIN.left - 26} ${(L.y(0) + L.y(1)) / 2})`}
            >
              {fmt(grid.cellH)} {unit}
            </text>

            {/* cells */}
            {result.cells.map((row) =>
              row.map((cell) => {
                const x = L.x(cell.c);
                const y = L.y(cell.r);
                const pat = !cell.active
                  ? 'url(#pat-off)'
                  : cell.cut > cell.fill
                    ? 'url(#pat-cut)'
                    : cell.fill > cell.cut
                      ? 'url(#pat-fill)'
                      : 'none';
                return (
                  <rect
                    key={`c${cell.r}-${cell.c}`}
                    x={x}
                    y={y}
                    width={L.cw}
                    height={L.ch}
                    fill={pat}
                    className={`cell ${cell.active ? 'on' : 'off'}`}
                    onMouseEnter={() => onCellHover({ r: cell.r, c: cell.c })}
                    onClick={() => mode === 'shape' && onCellClick(cell.r, cell.c)}
                  />
                );
              }),
            )}

            {/* faint outline of switched-off cells so the full grid stays visible */}
            {result.cells.flat().map((cell) =>
              cell.active ? null : (
                <rect
                  key={`o${cell.r}-${cell.c}`}
                  x={L.x(cell.c) + 1}
                  y={L.y(cell.r) + 1}
                  width={L.cw - 2}
                  height={L.ch - 2}
                  className="cell-off-outline"
                />
              ),
            )}

            {edges.map((e, i) => (
              <line key={i} {...e} className={e.boundary ? 'edge boundary' : 'edge'} />
            ))}

            {/* per-cell volume, bottom right of each cell */}
            {result.cells.flat().map((cell) => {
              if (!cell.active) return null;
              const lines: { text: string; cls: string; arrow?: 'down' | 'up' }[] = [];
              if (cell.cut > 0) lines.push({ text: cell.cut.toFixed(1), cls: 't-cut', arrow: 'down' });
              if (cell.fill > 0) lines.push({ text: cell.fill.toFixed(1), cls: 't-fill', arrow: 'up' });
              if (!lines.length) return null;
              const w = Math.max(...lines.map((l) => l.text.length * CHAR_W + 14)) + 6;
              return (
                <Chip
                  key={`v${cell.r}-${cell.c}`}
                  x={L.x(cell.c + 1) - w - 18}
                  y={L.y(cell.r + 1) - lines.length * LINE_H - 14}
                  lines={lines}
                />
              );
            })}

            {/* corners */}
            {result.corners.flat().map((k) => {
              if (!k.type) return null;
              const cx = L.x(k.c);
              const cy = L.y(k.r);
              const isSel = selected?.r === k.r && selected?.c === k.c;
              return (
                <g
                  key={`k${k.r}-${k.c}`}
                  className={`corner type-${k.type} ${isSel ? 'sel' : ''}`}
                  onClick={() => mode === 'edit' && onCornerClick({ r: k.r, c: k.c })}
                >
                  {mode === 'edit' && <Chip x={cx + 14} y={cy + 6} lines={cornerLines(k)} />}
                  {isSel && <rect x={cx - 16} y={cy - 16} width={32} height={32} className="sel-ring" />}
                  <rect x={cx - 11} y={cy - 11} width={22} height={22} className="badge" />
                  <text x={cx} y={cy + 5} textAnchor="middle" className="badge-t">
                    {k.type}
                  </text>
                  {mode === 'edit' && <rect x={cx - 16} y={cy - 16} width={32} height={32} className="hit" />}
                </g>
              );
            })}
          </svg>
          {overlay?.(L)}
        </div>
      </div>
    </div>
  );
}
