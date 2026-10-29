# Borrow Pit Calc

A pixel-art cut and fill calculator for the borrow pit (grid) method.

```
V = A/4 × (1Σh1 + 2Σh2 + 3Σh3 + 4Σh4)
```

- `A` is the area of one grid cell.
- `h = existing − proposed` at each grid corner. Positive `h` is cut, negative `h` is fill. Cut and fill are summed separately.
- `Σhn` sums `h` over the corners shared by `n` cells. Corners are typed A (1 cell), B (2), C (3) and D (4).

## Features

- Rectangular grid: cell width, cell height, column and row counts, feet or meters.
- Edit shape mode: click cells to remove or add them, for L-shaped and irregular sites (this is where C corners appear).
- Paste existing and proposed elevation matrices (spaces, commas or tabs from a spreadsheet; `-` leaves a corner unchanged).
- Click any corner in the plan to edit its existing and proposed elevation. Enter jumps to the next corner.
- Live cut, fill and net totals (ft³ and yd³, or m³), the Σh table, the worked formula and per-cell volumes.
- Isometric 3D view of existing ground, proposed grade and the cut/fill walls.
- Work is kept in the browser's local storage. `?example=exercise`, `?example=basement` or `?example=slope` loads a worked example.

The two textbook examples (in-class exercise: 67.38 yd³; basement: 352.2 yd³) are checked in `src/calc.test.ts`.

## Develop

```bash
yarn install
yarn dev       # local dev server
yarn test      # unit tests
yarn build     # type check and build to dist/
```

## Deploy

`.github/workflows/deploy.yml` builds with yarn and publishes `dist/` to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

## Font

[Pixel Operator](https://notabug.org/HarvettFox96/ttf-pixeloperator) by Jayvee Enaguas, CC0 1.0 (see `src/fonts/LICENSE.txt`). The original files are in `assets/fonts-src/`. `scripts/add-pixel-glyphs.py` adds the Σ, ² and ³ glyphs the formulas need and writes the woff2 files in `src/fonts/`:

```bash
pip install fonttools brotli
python3 scripts/add-pixel-glyphs.py assets/fonts-src src/fonts
```
