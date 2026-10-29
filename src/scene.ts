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
  return { points, cells, width: grid.cols * grid.cellW, depth: grid.rows * grid.cellH, zMin, zMax };
}

export interface Projected {
  sx: number;
  sy: number;
  /** larger is closer to the viewer */
  depth: number;
}

export interface Projection {
  project(x: number, y: number, z: number): Projected;
}

/**
 * 2:1 pixel-art isometric projection. `turn` rotates the site in 90 degree steps,
 * `zScale` is the vertical exaggeration in screen pixels per elevation unit.
 */
export function isoProjection(scene: Scene, opts: { turn: number; scale: number; zScale: number; zBase: number }): Projection {
  const { turn, scale, zScale, zBase } = opts;
  const cx = scene.width / 2;
  const cy = scene.depth / 2;
  return {
    project(x, y, z) {
      let u = x - cx;
      let v = y - cy;
      for (let i = 0; i < ((turn % 4) + 4) % 4; i++) [u, v] = [-v, u];
      return {
        sx: (u - v) * scale,
        sy: ((u + v) / 2) * scale - (z - zBase) * zScale,
        depth: u + v,
      };
    },
  };
}
