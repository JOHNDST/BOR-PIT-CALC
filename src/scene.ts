// View-independent 3D description of the site. Plan and isometric views both read from this,
// so new views (volume prisms, cross sections, etc.) only need a projection and a renderer.

import type { CornerType, Grid, Result } from './calc';

export interface ScenePoint {
  r: number;
  c: number;
  /** world coordinates: x east, y south, in grid units */
  x: number;
  y: number;
  zExisting: number;
  zProposed: number;
  type: CornerType;
  cut: number;
  fill: number;
}

export interface SceneCell {
  r: number;
  c: number;
  /** corner keys in order: top-left, top-right, bottom-right, bottom-left */
  corners: [string, string, string, string];
  cut: number;
  fill: number;
}

export interface Scene {
  points: Map<string, ScenePoint>;
  cells: SceneCell[];
  width: number;
  depth: number;
  cellW: number;
  cellH: number;
  zMin: number;
  zMax: number;
}

export const key = (r: number, c: number) => `${r},${c}`;

export function buildScene(grid: Grid, result: Result): Scene {
  const points = new Map<string, ScenePoint>();
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const k of result.corners.flat()) {
    if (!k.type) continue;
    points.set(key(k.r, k.c), {
      r: k.r,
      c: k.c,
      x: k.c * grid.cellW,
      y: k.r * grid.cellH,
      zExisting: k.existing,
      zProposed: k.proposed,
      type: k.type,
      cut: k.cut,
      fill: k.fill,
    });
    zMin = Math.min(zMin, k.existing, k.proposed);
    zMax = Math.max(zMax, k.existing, k.proposed);
  }
  const cells: SceneCell[] = result.cells
    .flat()
    .filter((cl) => cl.active)
    .map((cl) => ({
      r: cl.r,
      c: cl.c,
      corners: [key(cl.r, cl.c), key(cl.r, cl.c + 1), key(cl.r + 1, cl.c + 1), key(cl.r + 1, cl.c)],
      cut: cl.cut,
      fill: cl.fill,
    }));
  if (!Number.isFinite(zMin)) zMin = zMax = 0;
  return { points, cells, width: grid.cols * grid.cellW, depth: grid.rows * grid.cellH, cellW: grid.cellW, cellH: grid.cellH, zMin, zMax };
}

export interface Projected {
  sx: number;
  sy: number;
  /** distance toward the viewer along the view direction; larger is closer */
  depth: number;
}

export interface Projection {
  project(x: number, y: number, z: number): Projected;
}

/**
 * Fixed 2:1 pixel-art isometric projection, viewed from the south-east corner above the site.
 * `zScale` is screen pixels per elevation unit, so zScale / scale is the vertical exaggeration.
 */
export function isoProjection(scene: Scene, opts: { scale: number; zScale: number; zBase: number }): Projection {
  const { scale, zScale, zBase } = opts;
  const cx = scene.width / 2;
  const cy = scene.depth / 2;
  // view direction (toward the viewer) is (a, a, 1) with a = zScale / scale: moving along it keeps sx and sy
  const a = zScale / scale;
  return {
    project(x, y, z) {
      const u = x - cx;
      const v = y - cy;
      return {
        sx: (u - v) * scale,
        sy: ((u + v) / 2) * scale - (z - zBase) * zScale,
        depth: a * (u + v) + (z - zBase),
      };
    },
  };
}
