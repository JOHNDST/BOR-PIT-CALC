import { useMemo } from 'react';
import { CORNER_TYPES, FT3_PER_YD3, type Grid, type Result, sideTerms, type SideResult } from '../calc';
import { fmt, fmtElev } from '../matrix';

const num = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function bigUnits(grid: Grid, v: number) {
  return grid.units === 'ft'
    ? { main: num(v / FT3_PER_YD3, 2), mainU: 'yd³', sub: `${num(v, 1)} ft³` }
    : { main: num(v, 2), mainU: 'm³', sub: '' };
}

function Total({ label, grid, v, cls }: { label: string; grid: Grid; v: number; cls: string }) {
  const b = bigUnits(grid, Math.abs(v));
  return (
    <div className={`total ${cls}`}>
      <div className="total-tag">{label}</div>
      <div className="total-num">
        {label === 'Net' && v !== 0 ? (v > 0 ? '+' : '-') : ''}
        {b.main}
        <small>{b.mainU}</small>
      </div>
      {b.sub && <div className="total-sub">{b.sub}</div>}
    </div>
  );
}

/** Only the first few depths of each Σ are listed; big grids can have thousands. */
const MAX_TERMS = 12;

function Formula({ name, side, area, grid, result }: { name: 'CUT' | 'FILL'; side: SideResult; area: number; grid: Grid; result: Result }) {
  const terms = useMemo(() => sideTerms(result, name === 'CUT' ? 'cut' : 'fill', MAX_TERMS), [result, name]);
  const parts = side.sums.map((s, i) => (i === 0 ? fmtElev(s) : `${i + 1}×${fmtElev(s)}`)).filter((_, i) => side.sums[i] !== 0);
  const u = grid.units;
  return (
    <div className="formula">
      <div>
        {name} = A/4 × (1Σh1+2Σh2+3Σh3+4Σh4)
      </div>
      <div>
        = {fmt(area)}/4 × ({parts.length ? parts.join(' + ') : '0'})
      </div>
      <div>
        = {fmt(area / 4, 3)} × {fmt(side.weighted, 3)} = {num(side.volume, 1)} {u}³
        {u === 'ft' && <> = {num(side.volume / FT3_PER_YD3, 2)} yd³</>}
      </div>
      <details>
        <summary>Σh terms</summary>
        {terms.shown.map((t, i) => (
          <div key={i} className="terms">
            Σh{i + 1} ={' '}
            {t.length
              ? `${t.map((v) => fmtElev(v)).join(' + ')}${terms.total[i] > t.length ? ` + … (${terms.total[i]} terms)` : ''} = ${fmtElev(side.sums[i])}`
              : '0'}
          </div>
        ))}
      </details>
    </div>
  );
}

export function Results({ grid, result }: { grid: Grid; result: Result }) {
  const u = grid.units;
  const net = result.net;
  return (
    <div className="results-body">
      <Total label="Cut" grid={grid} v={result.cut.volume} cls="cut" />
      <Total label="Fill" grid={grid} v={result.fill.volume} cls="fill" />
      <Total label="Net" grid={grid} v={net} cls="net" />
      <div className="net-note">{net > 0 ? 'More cut than fill: export the surplus' : net < 0 ? 'More fill than cut: import material' : 'Cut and fill balance'}</div>

      <div className="facts">
        <div>
          A = {fmt(grid.cellW)} × {fmt(grid.cellH)} = {fmt(result.area)} {u}²
        </div>
        <div>
          {result.activeCells} cells, {result.counts.reduce((a, b) => a + b, 0)} corners
        </div>
      </div>

      <table className="sum-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>×</th>
            <th>#</th>
            <th>Σcut</th>
            <th>Σfill</th>
          </tr>
        </thead>
        <tbody>
          {CORNER_TYPES.map((t, i) => (
            <tr key={t}>
              <td>
                <span className={`badge-html type-${t}`}>{t}</span>
              </td>
              <td>{i + 1}</td>
              <td>{result.counts[i]}</td>
              <td>{fmtElev(result.cut.sums[i])}</td>
              <td>{fmtElev(result.fill.sums[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Formula name="CUT" side={result.cut} area={result.area} grid={grid} result={result} />
      <Formula name="FILL" side={result.fill} area={result.area} grid={grid} result={result} />
      <p className="note">h = existing - proposed. Positive h is cut, negative h is fill. Corners are typed by how many site cells share them.</p>
    </div>
  );
}
