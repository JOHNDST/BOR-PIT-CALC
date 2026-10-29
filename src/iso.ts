// Pixel-art hidden-line renderer for the isometric view. Both surfaces are rasterized into a
// low resolution depth buffer; only the visible existing ground gets hatched, and every line is
// tested against the buffer so that hidden parts come out dashed. The buffer is scaled up on
// screen with image-rendering: pixelated.

import type { Projection, Scene, ScenePoint } from './scene';
import { isoProjection } from './scene';

type RGB = [number, number, number];

export interface Palette {
  ink: RGB;
  soft: RGB;
  cut: RGB;
  fill: RGB;
  hatch: RGB;
  tones: [RGB, RGB, RGB, RGB];
  onInk: RGB;
}

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
    hatch: get('--iso-hatch'),
    tones: [get('--tone-1'), get('--tone-2'), get('--tone-3'), get('--tone-4')],
    onInk: get('--on-ink'),
  };
}

// owner ids in the depth buffer (0 = empty)
const EXISTING = 1;
const PROPOSED = 2;

/** sparse diagonal hatch for the existing ground */
const hatch = (x: number, y: number) => (((x + y) % 4) + 4) % 4 === 0;
/** dash pattern for hidden lines, in steps along the line */
const DASH = (step: number) => step % 4 < 2;

export class PixelBuffer {
  readonly data: ImageData;
  readonly depth: Float32Array;
  readonly owner: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new ImageData(w, h);
    this.depth = new Float32Array(w * h).fill(-Infinity);
    this.owner = new Uint8Array(w * h);
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

  /** Depth-tested triangle (x, y, depth per vertex), sampled at pixel centres. */
  tri(a: P3, b: P3, c: P3, id: number) {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const e = -1e-6; // small overlap so shared edges leave no cracks
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < e || w1 < e || w2 < e) continue;
        const d = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * this.w + x;
        if (d > this.depth[i]) {
          this.depth[i] = d;
          this.owner[i] = id;
        }
      }
    }
  }

  /**
   * Bresenham line with depth: pixels in front of (or on) the surfaces are drawn solid when
   * `visible` is true, pixels behind them are drawn dashed when `visible` is false.
   */
  line(a: P3, b: P3, c: RGB, visible: boolean, eps: number) {
    let x0 = Math.round(a[0]);
    let y0 = Math.round(a[1]);
    const x1 = Math.round(b[0]);
    const y1 = Math.round(b[1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    const n = Math.max(dx, -dy) || 1;
    let err = dx + dy;
    for (let step = 0; ; step++) {
      if (x0 >= 0 && y0 >= 0 && x0 < this.w && y0 < this.h) {
        const d = a[2] + ((b[2] - a[2]) * step) / n;
        const shown = d >= this.depth[y0 * this.w + x0] - eps;
        if (shown === visible && (visible || DASH(step))) this.px(x0, y0, c);
      }
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
}

type P3 = [number, number, number];

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

/** Vertical exaggeration so the relief is readable but no taller than about a third of the site. */
export function autoExaggeration(scene: Scene): number {
  const relief = scene.zMax - scene.zMin;
  if (relief <= 0) return 1;
  const span = Math.max(scene.width, scene.depth);
  return Math.min(50, Math.max(1, (0.3 * span) / relief));
}

export interface IsoView {
  /** 1 fits the site in the buffer */
  zoom: number;
  /** pan in buffer pixels */
  panX: number;
  panY: number;
  exaggeration: number;
  letters: boolean;
}

export function renderIso(buf: PixelBuffer, scene: Scene, pal: Palette, view: IsoView) {
  const pad = 12;
  const unit = isoProjection(scene, { scale: 1, zScale: view.exaggeration, zBase: scene.zMin });
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
  const fit = Math.min((buf.w - 2 * pad) / Math.max(1e-9, maxX - minX), (buf.h - 2 * pad) / Math.max(1e-9, maxY - minY));
  const k = fit * view.zoom;
  const ox = Math.round(buf.w / 2 - ((minX + maxX) / 2) * k + view.panX);
  const oy = Math.round(buf.h / 2 - ((minY + maxY) / 2) * k + view.panY);
  const proj: Projection = {
    project(x, y, z) {
      const s = unit.project(x, y, z);
      return { sx: s.sx * k + ox, sy: s.sy * k + oy, depth: s.depth };
    },
  };
  const P = (p: ScenePoint, which: 'e' | 'p'): P3 => {
    const s = proj.project(p.x, p.y, which === 'e' ? p.zExisting : p.zProposed);
    return [s.sx, s.sy, s.depth];
  };
  const pt = (id: string) => scene.points.get(id)!;

  // depth tolerance: about two screen pixels of depth on flat ground, so lines lying on a surface stay solid
  const eps = (2 * 2 * view.exaggeration) / k + 1e-6;
  // level of detail: a cell edge this many buffer pixels long decides what is worth drawing
  const cellPx = k * Math.min(scene.cellW, scene.cellH);
  const allEdges = cellPx >= 3;
  const posts = cellPx >= 4;
  const letters = view.letters && cellPx >= 10;

  // 1. both surfaces into the depth buffer
  for (const cell of scene.cells) {
    for (const [which, id] of [['e', EXISTING], ['p', PROPOSED]] as const) {
      const [a, b, c, d] = cell.corners.map((cid) => P(pt(cid), which));
      buf.tri(a, b, c, id);
      buf.tri(a, c, d, id);
    }
  }

  // 2. hatch only where the existing ground is the visible surface
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (buf.owner[y * buf.w + x] === EXISTING && hatch(x, y)) buf.px(x, y, pal.hatch);
    }
  }

  // 3. lines: grid edges of both surfaces plus a post per corner from existing to proposed.
  // An edge used by one cell is on the site boundary; tiny cells only get the boundary.
  const edgeUse = new Map<string, { ka: string; kb: string; n: number }>();
  for (const cell of scene.cells) {
    for (let i = 0; i < 4; i++) {
      const ka = cell.corners[i];
      const kb = cell.corners[(i + 1) % 4];
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edgeUse.get(id);
      if (e) e.n++;
      else edgeUse.set(id, { ka, kb, n: 1 });
    }
  }
  const segs: { a: P3; b: P3; c: RGB }[] = [];
  for (const which of ['e', 'p'] as const) {
    for (const { ka, kb, n } of edgeUse.values()) {
      if (allEdges || n === 1) segs.push({ a: P(pt(ka), which), b: P(pt(kb), which), c: which === 'e' ? pal.soft : pal.ink });
    }
  }
  if (posts) {
    for (const p of scene.points.values()) {
      if (p.cut === 0 && p.fill === 0) continue;
      segs.push({ a: P(p, 'e'), b: P(p, 'p'), c: p.cut > 0 ? pal.cut : pal.fill });
    }
  }
  // hidden (dashed) first so visible lines win where they cross
  for (const s of segs) buf.line(s.a, s.b, s.c, false, eps);
  for (const s of segs) buf.line(s.a, s.b, s.c, true, eps);

  // 4. corner letters at the proposed grade
  if (letters) {
    for (const p of scene.points.values()) {
      const [x, y] = P(p, 'p');
      const bx = Math.round(x) - 3;
      const by = Math.round(y) - 4;
      const tone = pal.tones[p.type.charCodeAt(0) - 65];
      buf.rect(bx, by, 7, 9, pal.ink);
      buf.rect(bx + 1, by + 1, 5, 7, tone);
      glyph(buf, p.type, bx + 2, by + 2, p.type === 'C' || p.type === 'D' ? pal.onInk : pal.ink);
    }
  }
}

