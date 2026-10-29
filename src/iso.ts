// Tiny pixel-art rasterizer for the isometric view. Everything is drawn into a low resolution
// buffer with hard edges and ordered dither patterns, then scaled up with image-rendering: pixelated.

import type { Projection, Scene, ScenePoint } from './scene';
import { isoProjection } from './scene';

type RGB = [number, number, number];
type Pattern = (x: number, y: number) => boolean;

export interface Palette {
  ink: RGB;
  soft: RGB;
  cut: RGB;
  fill: RGB;
  patCut: RGB;
  patFill: RGB;
  tones: [RGB, RGB, RGB, RGB];
}

export const PATTERNS: Record<'solid' | 'cut' | 'fill' | 'sparse', Pattern> = {
  solid: () => true,
  cut: (x, y) => (((x - y) % 4) + 4) % 4 === 0,
  fill: (x, y) => (x % 4 === 0 && y % 4 === 0) || (x % 4 === 2 && y % 4 === 2),
  sparse: (x, y) => x % 4 === 0 && y % 4 === 0,
};

export function parseColor(s: string): RGB {
  const h = s.trim().replace('#', '');
  const v = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}

export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const get = (n: string) => parseColor(css.getPropertyValue(n));
  return {
    ink: get('--ink'),
    soft: get('--ink-soft'),
    cut: get('--cut'),
    fill: get('--fill'),
    patCut: get('--pat-cut'),
    patFill: get('--pat-fill'),
    tones: [get('--tone-1'), get('--tone-2'), get('--tone-3'), get('--tone-4')],
  };
}

export class PixelBuffer {
  readonly data: ImageData;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new ImageData(w, h);
  }

  px(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data.data;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** Bresenham line; `dash` (period, on) draws a dashed line. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, dash?: [number, number]) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let step = 0; ; step++) {
      if (!dash || step % dash[0] < dash[1]) this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Scanline triangle fill, sampling at pixel centres. */
  tri(a: P2, b: P2, c: P2, col: RGB, pat: Pattern = PATTERNS.solid) {
    const pts = [a, b, c].sort((p, q) => p[1] - q[1]);
    const [p0, p1, p2] = pts;
    const yStart = Math.max(0, Math.ceil(p0[1] - 0.5));
    const yEnd = Math.min(this.h - 1, Math.floor(p2[1] - 0.5));
    const xAt = (p: P2, q: P2, y: number) => (q[1] === p[1] ? p[0] : p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]));
    for (let y = yStart; y <= yEnd; y++) {
      const yc = y + 0.5;
      const xa = xAt(p0, p2, yc);
      const xb = yc < p1[1] ? xAt(p0, p1, yc) : xAt(p1, p2, yc);
      const xl = Math.ceil(Math.min(xa, xb) - 0.5);
      const xr = Math.floor(Math.max(xa, xb) - 0.5);
      for (let x = Math.max(0, xl); x <= Math.min(this.w - 1, xr); x++) if (pat(x, y)) this.px(x, y, col);
    }
  }

  quad(a: P2, b: P2, c: P2, d: P2, col: RGB, pat?: Pattern) {
    this.tri(a, b, c, col, pat);
    this.tri(a, c, d, col, pat);
  }
}

type P2 = [number, number];

// 3x5 bitmap glyphs for the corner letters.
const GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
};

function glyph(buf: PixelBuffer, ch: string, x: number, y: number, c: RGB) {
  GLYPHS[ch]?.forEach((row, j) => [...row].forEach((bit, i) => bit === '1' && buf.px(x + i, y + j, c)));
}

export interface IsoOptions {
  turn: number;
  /** vertical exaggeration relative to true scale */
  exaggeration: number;
  showLetters: boolean;
}

/** Auto vertical exaggeration so the relief is readable but not taller than about a third of the site. */
export function autoExaggeration(scene: Scene): number {
  const relief = scene.zMax - scene.zMin;
  if (relief <= 0) return 1;
  const span = Math.max(scene.width, scene.depth);
  return Math.min(50, Math.max(1, (0.3 * span) / relief));
}

export function renderIso(buf: PixelBuffer, scene: Scene, pal: Palette, opts: IsoOptions) {
  const pad = 10;
  // project at unit scale to find the bounds, then fit the buffer
  const unit = isoProjection(scene, { turn: opts.turn, scale: 1, zScale: opts.exaggeration, zBase: scene.zMin });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of scene.points.values()) {
    for (const z of [p.zExisting, p.zProposed]) {
      const s = unit.project(p.x, p.y, z);
      minX = Math.min(minX, s.sx);
      maxX = Math.max(maxX, s.sx);
      minY = Math.min(minY, s.sy);
      maxY = Math.max(maxY, s.sy);
    }
  }
  if (!Number.isFinite(minX)) return;
  const k = Math.min((buf.w - 2 * pad) / Math.max(1e-9, maxX - minX), (buf.h - 2 * pad) / Math.max(1e-9, maxY - minY));
  const ox = (buf.w - (maxX - minX) * k) / 2 - minX * k;
  const oy = (buf.h - (maxY - minY) * k) / 2 - minY * k;
  const proj: Projection = {
    project(x, y, z) {
      const s = unit.project(x, y, z);
      return { sx: s.sx * k + ox, sy: s.sy * k + oy, depth: s.depth };
    },
  };
  const P = (p: ScenePoint, which: 'e' | 'p'): P2 => {
    const s = proj.project(p.x, p.y, which === 'e' ? p.zExisting : p.zProposed);
    return [s.sx, s.sy];
  };
  const pt = (id: string) => scene.points.get(id)!;
  const depthOf = (p: ScenePoint) => proj.project(p.x, p.y, 0).depth;

  const cells = [...scene.cells].sort(
    (a, b) => a.corners.reduce((s, id) => s + depthOf(pt(id)), 0) - b.corners.reduce((s, id) => s + depthOf(pt(id)), 0),
  );
  const activeSet = new Set(scene.cells.map((c) => `${c.r},${c.c}`));

  // 1. finished grade, lightly toned
  for (const cell of cells) {
    const [a, b, c, d] = cell.corners.map((id) => P(pt(id), 'p'));
    buf.quad(a, b, c, d, pal.tones[1], PATTERNS.sparse);
  }

  // 2. earthwork curtains along the site boundary, split where cut turns into fill
  const curtains: { a: ScenePoint; b: ScenePoint; depth: number }[] = [];
  for (const cell of scene.cells) {
    const [tl, tr, br, bl] = cell.corners.map(pt);
    const sides: [ScenePoint, ScenePoint, number, number][] = [
      [tl, tr, cell.r - 1, cell.c],
      [tr, br, cell.r, cell.c + 1],
      [br, bl, cell.r + 1, cell.c],
      [bl, tl, cell.r, cell.c - 1],
    ];
    for (const [a, b, nr, nc] of sides) {
      if (!activeSet.has(`${nr},${nc}`)) curtains.push({ a, b, depth: (depthOf(a) + depthOf(b)) / 2 });
    }
  }
  curtains.sort((p, q) => p.depth - q.depth);
  for (const { a, b } of curtains) {
    const ha = a.zExisting - a.zProposed;
    const hb = b.zExisting - b.zProposed;
    const side = (h: number) => (h > 0 ? { col: pal.patCut, pat: PATTERNS.cut } : { col: pal.patFill, pat: PATTERNS.fill });
    if (ha * hb >= 0) {
      if (ha === 0 && hb === 0) continue;
      const s = side(ha !== 0 ? ha : hb);
      buf.quad(P(a, 'p'), P(b, 'p'), P(b, 'e'), P(a, 'e'), s.col, s.pat);
    } else {
      const t = ha / (ha - hb);
      const mx = a.x + (b.x - a.x) * t;
      const my = a.y + (b.y - a.y) * t;
      const mz = a.zProposed + (b.zProposed - a.zProposed) * t;
      const m = proj.project(mx, my, mz);
      const mp: P2 = [m.sx, m.sy];
      const sa = side(ha);
      const sb = side(hb);
      buf.tri(P(a, 'p'), mp, P(a, 'e'), sa.col, sa.pat);
      buf.tri(mp, P(b, 'p'), P(b, 'e'), sb.col, sb.pat);
    }
  }

  // 3. existing ground as a dashed wireframe, 4. finished grade as a solid wireframe
  const drawEdges = (which: 'e' | 'p', col: RGB, dash?: [number, number]) => {
    for (const cell of cells) {
      const q = cell.corners.map((id) => P(pt(id), which));
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = q[i];
        const [x1, y1] = q[(i + 1) % 4];
        buf.line(x0, y0, x1, y1, col, dash);
      }
    }
  };
  drawEdges('e', pal.ink, [3, 2]);
  drawEdges('p', pal.ink);

  // 5. posts from existing to proposed at every corner
  const pts = [...scene.points.values()].sort((a, b) => depthOf(a) - depthOf(b));
  for (const p of pts) {
    if (p.cut === 0 && p.fill === 0) continue;
    const [x0, y0] = P(p, 'e');
    const [x1, y1] = P(p, 'p');
    const col = p.cut > 0 ? pal.cut : pal.fill;
    buf.line(x0, y0, x1, y1, col);
    buf.rect(Math.round(x0) - 1, Math.round(y0) - 1, 3, 3, col);
  }

  // 6. corner badges on the finished grade
  if (opts.showLetters) {
    for (const p of pts) {
      const [x, y] = P(p, 'p');
      const bx = Math.round(x) - 3;
      const by = Math.round(y) - 4;
      const tone = pal.tones[p.type.charCodeAt(0) - 65];
      buf.rect(bx, by, 7, 9, pal.ink);
      buf.rect(bx + 1, by + 1, 5, 7, tone);
      glyph(buf, p.type, bx + 2, by + 2, p.type === 'D' || p.type === 'C' ? contrast(tone, pal) : pal.ink);
    }
  }
}

function lum([r, g, b]: RGB) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink or the lightest tone, whichever reads better on `bg`. */
function contrast(bg: RGB, pal: Palette): RGB {
  return Math.abs(lum(bg) - lum(pal.ink)) > Math.abs(lum(bg) - lum(pal.tones[0])) ? pal.ink : pal.tones[0];
}
