import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CornerResult, Grid, Result } from '../calc';
import { parseColor } from '../iso';
import { fmt, fmtElev } from '../matrix';
import { type PanZoom, usePanZoom } from '../usePanZoom';
import { ZoomTools } from './ZoomTools';

export type Mode = 'edit' | 'shape';
export type Field = 'existing' | 'proposed';
export interface CornerRef {
  r: number;
  c: number;
}
export interface EditRef extends CornerRef {
  field: Field;
}
export interface Hover {
  corner: CornerRef | null;
  cell: CornerRef | null;
}

interface Props {
  grid: Grid;
  result: Result;
  mode: Mode;
  /** the corner value being edited in place, if any */
  editing: EditRef | null;
  onEdit: (e: EditRef | null) => void;
  onValue: (e: EditRef, v: number) => void;
  /** move the edit to the next (1) or previous (-1) corner */
  onStep: (dir: 1 | -1) => void;
  onCellClick: (r: number, c: number) => void;
  onHover: (h: Hover) => void;
}

export const MARGIN = { left: 40, top: 44, right: 86, bottom: 52 };
const CHAR_W = 8; // Pixel Operator Mono at 16px advances 8px per character
const LINE_H = 15;
const MAX_ZOOM = 4;
/** below this cell size, or above this many cells on screen, the plan is drawn as a canvas overview */
const DETAIL_MIN_PX = 12;
const DETAIL_MAX_CELLS = 6000;
/** the rendered range is padded and snapped to blocks so panning rarely rebuilds the svg */
const BLOCK = 8;

export interface Layout {
  cw: number;
  ch: number;
  width: number;
  height: number;
  x: (c: number) => number;
  y: (r: number) => number;
  toScale: boolean;
}

/** Cell size on screen at a zoom level, keeping the real aspect ratio unless it is extreme. */
export function layoutFor(grid: Grid, zoom: number): Layout {
  const real = grid.cellW / grid.cellH;
  const aspect = Math.min(2.5, Math.max(0.4, real));
  const w0 = Math.max(128, 100 * aspect);
  const cw = w0 * zoom;
  const ch = (w0 / aspect) * zoom;
  return {
    cw,
    ch,
    width: MARGIN.left + Math.round(grid.cols * cw) + MARGIN.right,
    height: MARGIN.top + Math.round(grid.rows * ch) + MARGIN.bottom,
    x: (c) => MARGIN.left + Math.round(c * cw),
    y: (r) => MARGIN.top + Math.round(r * ch),
    toScale: Math.abs(aspect - real) < 1e-9,
  };
}

/** Zoom and offset that show the whole grid ("zoom to all"). */
function fitView(grid: Grid, vw: number, vh: number): PanZoom {
  const one = layoutFor(grid, 1);
  const z = Math.min(
    1.5,
    Math.max(1, vw - MARGIN.left - MARGIN.right) / (grid.cols * one.cw),
    Math.max(1, vh - MARGIN.top - MARGIN.bottom) / (grid.rows * one.ch),
  );
  const L = layoutFor(grid, z);
  return { zoom: z, x: Math.round((vw - L.width) / 2), y: Math.round((vh - L.height) / 2) };
}

interface Range {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/** Cells on screen, padded and snapped to BLOCK so the range only changes every few cells of panning. */
function visibleRange(grid: Grid, L: Layout, view: PanZoom, vw: number, vh: number): Range {
  const lo = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v / BLOCK) * BLOCK - BLOCK));
  const hi = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.ceil((v + 1) / BLOCK) * BLOCK + BLOCK - 1));
  return {
    c0: lo(Math.floor((-view.x - MARGIN.left) / L.cw), grid.cols),
    c1: hi(Math.ceil((vw - view.x - MARGIN.left) / L.cw), grid.cols),
    r0: lo(Math.floor((-view.y - MARGIN.top) / L.ch), grid.rows),
    r1: hi(Math.ceil((vh - view.y - MARGIN.top) / L.ch), grid.rows),
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

type Line = { text: string; cls: string; arrow?: 'down' | 'up' };

const chipWidth = (lines: Line[]) => Math.max(...lines.map((l) => l.text.length * CHAR_W + (l.arrow ? 14 : 0))) + 6;

function Chip({ x, y, lines }: { x: number; y: number; lines: Line[] }) {
  return (
    <g>
      <rect x={x} y={y} width={chipWidth(lines)} height={lines.length * LINE_H + 4} className="chip" />
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

const rectPath = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** Corner labels: proposed above right of the point, existing below right (in brackets, as in the textbook). */
const LABEL = { dx: 12, proposedTop: -22, existingTop: 4, h: 18 };
const labelText = (k: CornerResult, field: Field) => (field === 'proposed' ? fmtElev(k.proposed) : `(${fmtElev(k.existing)})`);
const labelBox = (L: Layout, k: CornerResult, field: Field) => ({
  x: L.x(k.c) + LABEL.dx,
  y: L.y(k.r) + (field === 'proposed' ? LABEL.proposedTop : LABEL.existingTop),
  w: labelText(k, field).length * CHAR_W + 6,
  h: LABEL.h,
});
const showLabels = (L: Layout) => L.cw >= 84 && L.ch >= 64;

interface DetailProps {
  grid: Grid;
  result: Result;
  zoom: number;
  mode: Mode;
  range: Range;
}

/**
 * Detailed svg for the cells in `range`. Cells, grid lines and badges are merged into a few paths
 * per style, so the element count stays small even when many cells are on screen.
 */
const PlanDetail = memo(function PlanDetail({ grid, result, zoom, mode, range }: DetailProps) {
  const L = layoutFor(grid, zoom);
  const { c0, c1, r0, r1 } = range;
  const on = (r: number, c: number) => !!grid.active[r]?.[c];
  const showCornerText = mode === 'edit' && showLabels(L);
  const showCellText = L.cw >= 84 && L.ch >= 64;
  // lettered badges when there is room, otherwise small markers so the grid does not turn into a checkerboard
  const showLetter = Math.min(L.cw, L.ch) * 0.45 >= 16;
  const badge = showLetter ? Math.min(22, Math.round(Math.min(L.cw, L.ch) * 0.45)) : Math.max(4, Math.min(8, Math.round(Math.min(L.cw, L.ch) * 0.25)));
  const unit = grid.units;

  const cellPaths = { cut: '', fill: '', off: '' };
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = result.cells[r][c];
      const kind = !cell.active ? 'off' : cell.cut > cell.fill ? 'cut' : cell.fill > cell.cut ? 'fill' : null;
      if (kind) cellPaths[kind] += rectPath(L.x(c), L.y(r), L.x(c + 1) - L.x(c), L.y(r + 1) - L.y(r));
    }
  }

  // site boundary is solid, interior grid lines are dashed (as in the textbook figures)
  let inner = '';
  let outer = '';
  for (let r = r0; r <= r1 + 1; r++) {
    for (let c = c0; c <= c1; c++) {
      const a = on(r - 1, c);
      const b = on(r, c);
      if (a || b) {
        const seg = `M${L.x(c)} ${L.y(r)}H${L.x(c + 1)}`;
        if (a !== b) outer += seg;
        else inner += seg;
      }
    }
  }
  for (let c = c0; c <= c1 + 1; c++) {
    for (let r = r0; r <= r1; r++) {
      const a = on(r, c - 1);
      const b = on(r, c);
      if (a || b) {
        const seg = `M${L.x(c)} ${L.y(r)}V${L.y(r + 1)}`;
        if (a !== b) outer += seg;
        else inner += seg;
      }
    }
  }

  const badges = { A: '', B: '', C: '', D: '' };
  const letters: CornerResult[] = [];
  const cornerChips: React.ReactNode[] = [];
  for (let r = r0; r <= r1 + 1; r++) {
    for (let c = c0; c <= c1 + 1; c++) {
      const k = result.corners[r][c];
      if (!k.type) continue;
      badges[k.type] += rectPath(L.x(c) - badge / 2, L.y(r) - badge / 2, badge, badge);
      if (showLetter) letters.push(k);
      if (showCornerText) {
        for (const field of ['proposed', 'existing'] as const) {
          const b = labelBox(L, k, field);
          cornerChips.push(
            <g key={`${field[0]}${r}-${c}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} className="chip" />
              <text x={b.x + 3} y={b.y + 13} className={field === 'proposed' ? 't-ink' : 't-soft'}>
                {labelText(k, field)}
              </text>
            </g>,
          );
        }
      }
    }
  }

  const cellChips: React.ReactNode[] = [];
  if (showCellText) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = result.cells[r][c];
        if (!cell.active) continue;
        const lines: Line[] = [];
        if (cell.cut > 0) lines.push({ text: cell.cut.toFixed(1), cls: 't-cut', arrow: 'down' });
        if (cell.fill > 0) lines.push({ text: cell.fill.toFixed(1), cls: 't-fill', arrow: 'up' });
        if (!lines.length) continue;
        const cx = (L.x(c) + L.x(c + 1)) / 2;
        const cy = (L.y(r) + L.y(r + 1)) / 2;
        cellChips.push(
          <Chip key={`v${r}-${c}`} x={Math.round(cx - chipWidth(lines) / 2)} y={Math.round(cy - (lines.length * LINE_H + 4) / 2)} lines={lines} />,
        );
      }
    }
  }

  // the svg only covers the rendered range (plus margins), so huge grids never make a huge layer
  const bx = L.x(c0) - MARGIN.left;
  const by = L.y(r0) - MARGIN.top;
  const bw = L.x(c1 + 1) + MARGIN.right - bx;
  const bh = L.y(r1 + 1) + MARGIN.bottom - by;
  const axisStep = (px: number, need: number) => Math.max(1, Math.ceil(need / px));

  return (
    <svg className="plan" width={bw} height={bh} viewBox={`${bx} ${by} ${bw} ${bh}`} style={{ left: bx, top: by }}>
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
      {r0 === 0 &&
        Array.from({ length: c1 - c0 + 2 }, (_, i) => c0 + i)
          .filter((c) => c % axisStep(L.cw, 28) === 0)
          .map((c) => (
            <text key={`cx${c}`} x={L.x(c)} y={18} className="t-axis" textAnchor="middle">
              {c + 1}
            </text>
          ))}
      {c0 === 0 &&
        Array.from({ length: r1 - r0 + 2 }, (_, i) => r0 + i)
          .filter((r) => r % axisStep(L.ch, 20) === 0)
          .map((r) => (
            <text key={`ry${r}`} x={16} y={L.y(r) + 5} className="t-axis" textAnchor="middle">
              {r + 1}
            </text>
          ))}
      {r1 === grid.rows - 1 && c0 === 0 && L.cw >= 60 && (
        <text x={(L.x(0) + L.x(1)) / 2} y={L.y(grid.rows) + 44} className="t-dim" textAnchor="middle">
          {fmt(grid.cellW)} {unit}
        </text>
      )}
      {r0 === 0 && c0 === 0 && L.ch >= 60 && (
        <text
          x={MARGIN.left - 26}
          y={(L.y(0) + L.y(1)) / 2}
          className="t-dim"
          textAnchor="middle"
          transform={`rotate(-90 ${MARGIN.left - 26} ${(L.y(0) + L.y(1)) / 2})`}
        >
          {fmt(grid.cellH)} {unit}
        </text>
      )}

      <path d={cellPaths.cut} fill="url(#pat-cut)" />
      <path d={cellPaths.fill} fill="url(#pat-fill)" />
      <path d={cellPaths.off} fill="url(#pat-off)" />
      {L.cw >= 24 && <path d={inner} className="edge" />}
      <path d={outer} className="edge boundary" />

      {cellChips}
      {cornerChips}

      {(['A', 'B', 'C', 'D'] as const).map((t) => (
        <path key={t} d={badges[t]} className={`badge type-${t}`} />
      ))}
      {letters.map((k) => (
        <text key={`t${k.r}-${k.c}`} x={L.x(k.c)} y={L.y(k.r) + 5} textAnchor="middle" className={`badge-t type-${k.type}`}>
          {k.type}
        </text>
      ))}
    </svg>
  );
});

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): string => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

/** One pixel per cell, shaded in three steps of net cut or fill. Scaled up for the overview. */
function cellImage(grid: Grid, result: Result, css: CSSStyleDeclaration): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = grid.cols;
  cv.height = grid.rows;
  const ctx = cv.getContext('2d')!;
  const get = (n: string) => parseColor(css.getPropertyValue(n));
  const [patCut, cut, patFill, fill] = [get('--pat-cut'), get('--cut'), get('--pat-fill'), get('--fill')];
  const steps = {
    cut: [mix(patCut, cut, 0), mix(patCut, cut, 0.5), mix(patCut, cut, 1)],
    fill: [mix(patFill, fill, 0), mix(patFill, fill, 0.5), mix(patFill, fill, 1)],
  };
  const panel = css.getPropertyValue('--panel');
  const faint = css.getPropertyValue('--faint');
  const cells = result.cells.flat();
  let max = 0;
  for (const cell of cells) if (cell.active) max = Math.max(max, Math.abs(cell.cut - cell.fill));
  for (const cell of cells) {
    const net = cell.cut - cell.fill;
    const level = max > 0 ? Math.min(2, Math.floor((Math.abs(net) / max) * 3)) : 0;
    ctx.fillStyle = !cell.active ? faint : net > 0 ? steps.cut[level] : net < 0 ? steps.fill[level] : panel;
    ctx.fillRect(cell.c, cell.r, 1, 1);
  }
  return cv;
}

/** Site boundary edges in grid units: [c0, r0, c1, r1]. */
function boundaryEdges(grid: Grid): [number, number, number, number][] {
  const on = (r: number, c: number) => !!grid.active[r]?.[c];
  const out: [number, number, number, number][] = [];
  for (let r = 0; r <= grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (on(r - 1, c) !== on(r, c)) out.push([c, r, c + 1, r]);
  for (let c = 0; c <= grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (on(r, c - 1) !== on(r, c)) out.push([c, r, c, r + 1]);
  return out;
}

export function PlanView({ grid, result, mode, editing, onEdit, onValue, onStep, onCellClick, onHover }: Props) {
  const vp = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fitZoom = size.w ? fitView(grid, size.w, size.h).zoom : 1;
  const { view, setView, zoomAt, dragging } = usePanZoom(vp, {
    min: Math.min(0.15, fitZoom * 0.5),
    max: MAX_ZOOM,
    origin: { x: MARGIN.left, y: MARGIN.top },
  });
  const [hover, setHover] = useState<Hover>({ corner: null, cell: null });

  useLayoutEffect(() => {
    const el = vp.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (size.w) setView(fitView(grid, size.w, size.h));
  }, [grid, size, setView]);

  // zoom to all when the viewport first gets a size and whenever the grid geometry changes
  const fitKey = `${grid.cols}x${grid.rows}@${grid.cellW}x${grid.cellH}|${size.w > 0}`;
  useEffect(fit, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = layoutFor(grid, view.zoom);
  const range = visibleRange(grid, L, view, size.w, size.h);
  const rangeCells = (range.c1 - range.c0 + 1) * (range.r1 - range.r0 + 1);
  const detail = L.cw >= DETAIL_MIN_PX && L.ch >= DETAIL_MIN_PX && rangeCells <= DETAIL_MAX_CELLS;
  // keep the same range object while panning inside the same blocks, so the memoized svg is reused
  const rangeKey = `${range.c0},${range.c1},${range.r0},${range.r1}`;
  const stableRange = useMemo(() => range, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // canvas overview when cells are too small for the svg
  const overview = useMemo(
    () => (detail || !vp.current ? null : { img: cellImage(grid, result, getComputedStyle(vp.current)), edges: boundaryEdges(grid) }),
    [detail, grid, result, size.w > 0], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    const cv = canvas.current;
    const el = vp.current;
    if (!cv || !el || !overview || !size.w) return;
    cv.width = size.w;
    cv.height = size.h;
    const ctx = cv.getContext('2d')!;
    const css = getComputedStyle(el);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size.w, size.h);
    const ox = view.x;
    const oy = view.y;
    ctx.drawImage(overview.img, ox + L.x(0), oy + L.y(0), L.x(grid.cols) - L.x(0), L.y(grid.rows) - L.y(0));
    const ink = css.getPropertyValue('--ink');
    ctx.fillStyle = ink;
    const t = L.cw >= 4 ? 2 : 1;
    for (const [c0, r0, c1, r1] of overview.edges) {
      const x0 = ox + L.x(c0);
      const y0 = oy + L.y(r0);
      ctx.fillRect(x0 - (t >> 1), y0 - (t >> 1), ox + L.x(c1) - x0 + t, oy + L.y(r1) - y0 + t);
    }
    // corner type squares once there is room for them
    if (L.cw >= 6 && L.ch >= 6) {
      const s = Math.max(3, Math.min(8, Math.floor(Math.min(L.cw, L.ch) / 2)));
      const tones = ['--tone-1', '--tone-2', '--tone-3', '--tone-4'].map((n) => css.getPropertyValue(n));
      for (let r = range.r0; r <= range.r1 + 1; r++) {
        for (let c = range.c0; c <= range.c1 + 1; c++) {
          const k = result.corners[r][c];
          if (!k.type) continue;
          const x = ox + L.x(c) - (s >> 1);
          const y = oy + L.y(r) - (s >> 1);
          ctx.fillStyle = ink;
          ctx.fillRect(x, y, s, s);
          if (s >= 5) {
            ctx.fillStyle = tones[k.n - 1];
            ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
          }
        }
      }
    }
  }, [overview, view, size, L, grid, result, range]);

  // keep the corner being edited on screen (Enter walks through corners that may be off screen)
  useEffect(() => {
    if (!editing || !size.w) return;
    const x = L.x(editing.c) + view.x;
    const y = L.y(editing.r) + view.y;
    if (x < 30 || x > size.w - 140 || y < 40 || y > size.h - 40) {
      setView((v) => ({ ...v, x: Math.round(v.x + size.w / 2 - x), y: Math.round(v.y + size.h / 2 - y) }));
    }
  }, [editing?.r, editing?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  const hitTest = (clientX: number, clientY: number) => {
    const rect = vp.current!.getBoundingClientRect();
    const px = clientX - rect.left - view.x;
    const py = clientY - rect.top - view.y;
    const fc = (px - MARGIN.left) / L.cw;
    const fr = (py - MARGIN.top) / L.ch;
    // a label sits right of its corner, so the corner is the one left of the pointer
    let label: EditRef | null = null;
    if (mode === 'edit' && showLabels(L)) {
      const k = result.corners[Math.round(fr)]?.[Math.floor(fc)];
      if (k?.type) {
        for (const field of ['proposed', 'existing'] as const) {
          const b = labelBox(L, k, field);
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) label = { r: k.r, c: k.c, field };
        }
      }
    }
    const kc = Math.round(fc);
    const kr = Math.round(fr);
    const reach = Math.max(6, Math.min(16, Math.min(L.cw, L.ch) / 2 - 1));
    const k = result.corners[kr]?.[kc];
    const corner = k?.type && Math.abs(px - L.x(kc)) <= reach && Math.abs(py - L.y(kr)) <= reach ? { r: kr, c: kc } : null;
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    const cell = c >= 0 && c < grid.cols && r >= 0 && r < grid.rows ? { r, c } : null;
    return { label, corner: corner ?? (label ? { r: label.r, c: label.c } : null), cell };
  };

  const same = (a: CornerRef | null, b: CornerRef | null) => a?.r === b?.r && a?.c === b?.c;
  const [overLabel, setOverLabel] = useState(false);
  const onMove = (e: React.PointerEvent) => {
    if (dragging || (e.target as Element).closest('.no-pan')) return;
    const h = hitTest(e.clientX, e.clientY);
    setOverLabel(!!h.label);
    if (same(h.corner, hover.corner) && same(h.cell, hover.cell)) return;
    const next = { corner: h.corner, cell: h.cell };
    setHover(next);
    onHover(next);
  };
  const onClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.no-pan')) return;
    const h = hitTest(e.clientX, e.clientY);
    if (mode === 'edit') onEdit(h.label ?? (h.corner ? { ...h.corner, field: 'proposed' } : null));
    if (mode === 'shape' && h.cell) onCellClick(h.cell.r, h.cell.c);
  };
  const clickable = mode === 'edit' ? !!hover.corner || overLabel : !!hover.cell;

  const hl = mode === 'shape' ? hover.cell : null;
  const ring = (k: CornerRef, cls: string) => {
    const s = Math.round(Math.max(14, Math.min(32, Math.min(L.cw, L.ch) * 0.45 + 10)));
    return <div className={cls} style={{ left: L.x(k.c) - s / 2, top: L.y(k.r) - s / 2, width: s, height: s }} />;
  };
  const editCorner = editing && mode === 'edit' ? result.corners[editing.r]?.[editing.c] : null;

  return (
    <div
      className={`vp ${dragging ? 'dragging' : ''} mode-${mode}`}
      ref={vp}
      style={clickable && !dragging ? { cursor: 'pointer' } : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setHover({ corner: null, cell: null });
        onHover({ corner: null, cell: null });
      }}
      onClick={onClick}
    >
      {!detail && <canvas ref={canvas} className="plan-canvas" />}
      <div className="plan-stage" style={{ transform: `translate(${view.x}px, ${view.y}px)` }}>
        {detail && <PlanDetail grid={grid} result={result} zoom={view.zoom} mode={mode} range={stableRange} />}
        {hl && (
          <div
            className="hl-cell"
            style={{ left: L.x(hl.c), top: L.y(hl.r), width: L.x(hl.c + 1) - L.x(hl.c), height: L.y(hl.r + 1) - L.y(hl.r) }}
          />
        )}
        {mode === 'edit' && hover.corner && ring(hover.corner, 'hover-ring')}
        {editCorner?.type && ring(editCorner, 'sel-ring')}
        {editCorner?.type && editing && (
          <InlineValue key="inline" corner={editCorner} edit={editing} L={L} onValue={onValue} onEdit={onEdit} onStep={onStep} />
        )}
      </div>
      {!L.toScale && <span className="vp-note">cells not to scale</span>}
      <ZoomTools zoom={view.zoom} onZoom={(f) => zoomAt(f, size.w / 2, size.h / 2)} onFit={fit} />
    </div>
  );
}

/**
 * The number itself turns into an input: it sits exactly on the label, saves as you type,
 * Enter / Shift+Enter walk to the next / previous corner, Tab swaps proposed and existing.
 */
function InlineValue({
  corner,
  edit,
  L,
  onValue,
  onEdit,
  onStep,
}: {
  corner: CornerResult;
  edit: EditRef;
  L: Layout;
  onValue: (e: EditRef, v: number) => void;
  onEdit: (e: EditRef | null) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const value = corner[edit.field];
  const [text, setText] = useState(fmt(value, 3));
  // one input for every corner, so walking with Enter never blurs it
  useEffect(() => {
    setText((t) => (t.trim() !== '' && Number(t) === value ? t : fmt(value, 3)));
  }, [value]);
  useEffect(() => {
    setText(fmt(value, 3));
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, [edit.r, edit.c, edit.field]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = labelBox(L, corner, edit.field);
  return (
    <div className="inline-edit no-pan" style={{ left: b.x - 2, top: b.y - 2 }}>
      <span className="inline-tag">{edit.field === 'proposed' ? 'P' : 'E'}</span>
      <input
        ref={ref}
        inputMode="decimal"
        value={text}
        aria-label={`${edit.field} elevation at corner ${edit.r + 1}, ${edit.c + 1}`}
        className={text.trim() !== '' && !Number.isFinite(Number(text)) ? 'bad' : ''}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onValue(edit, v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            onEdit({ ...edit, field: edit.field === 'proposed' ? 'existing' : 'proposed' });
          } else if (e.key === 'Escape') {
            onEdit(null);
          }
        }}
        onBlur={() => onEdit(null)}
      />
    </div>
  );
}
