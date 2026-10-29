# Borrow Pit Calc

A pixel-art cut and fill calculator for the borrow pit (grid) method.

Live page: https://johndst.github.io/BOR-PIT-CALC/

```
V = A/4 × (1Σh1 + 2Σh2 + 3Σh3 + 4Σh4)
```

- `A` is the area of one grid cell.
- `h = existing − proposed` at each grid corner. Positive `h` is cut, negative `h` is fill. Cut and fill are summed separately.
- `Σhn` sums `h` over the corners shared by `n` cells. Corners are typed A (1 cell), B (2), C (3) and D (4).

## Features

- Rectangular grid: cell width, cell height, column and row counts (up to 300 × 300), feet or meters.
- Edit shape mode: click cells to remove or add them, for L-shaped and irregular sites (this is where C corners appear).
- Elevation matrices for existing and proposed grades: paste from a spreadsheet (spaces, commas or tabs; `-` leaves a corner unchanged). Level all proposed corners to one elevation, or copy the existing grade.
- Click any corner in the plan to edit its existing and proposed elevation. Enter jumps to the next corner.
- Live cut, fill and net totals (ft³ and yd³, or m³), the Σh table, the worked formula and per-cell volumes.
- Plan view and isometric 3D view, both with drag to pan, wheel or pinch to zoom, and zoom to all. The 3D view is a hidden-line drawing: the existing ground is hatched, the proposed grade and the cut/fill depths are lines, dashed where hidden.
- Big grids stay fast: the plan only draws what is on screen and switches to a one-pixel-per-cell overview when zoomed out; the 3D view drops detail as cells shrink.
- Work is kept in the browser's local storage. `?example=exercise`, `?example=basement` or `?example=slope` loads a worked example.

The two textbook examples (in-class exercise: 67.38 yd³; basement: 352.2 yd³) are checked in `src/calc.test.ts`.

## Code map

- `src/calc.ts`: grid model and the borrow pit computation.
- `src/scene.ts`: view-independent 3D scene (corner x, y, existing and proposed z) and the isometric projection. New 3D views only need a projection and a renderer.
- `src/iso.ts`: pixel rasterizer with a depth buffer for the hidden-line isometric view.
- `src/components/PlanView.tsx`: plan view (svg detail for the visible cells, canvas overview when zoomed out).
- `src/usePanZoom.ts`: shared drag / wheel / pinch handling.

## Develop

```bash
yarn install
yarn dev       # local dev server
yarn test      # unit tests
yarn build     # type check and build to dist/
```

## Deploy

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

## Font

[Pixel Operator](https://notabug.org/HarvettFox96/ttf-pixeloperator) by Jayvee Enaguas, CC0 1.0 (see `src/fonts/LICENSE.txt`). The original files are in `assets/fonts-src/`. `scripts/add-pixel-glyphs.py` adds the Σ, ² and ³ glyphs the formulas need and writes the woff2 files in `src/fonts/`:

```bash
pip install fonttools brotli
python3 scripts/add-pixel-glyphs.py assets/fonts-src src/fonts
```
