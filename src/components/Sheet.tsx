import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Cell, fmt, fmtElev, parseMatrix, toTSV } from '../matrix';

interface Props {
  label: string;
  /** (rows + 1) x (cols + 1) corner elevations */
  matrix: number[][];
  used: (r: number, c: number) => boolean;
  onCell: (r: number, c: number, v: number) => void;
  /** a pasted block, top-left at (r, c); the owner grows the grid if it does not fit */
  onPaste: (r: number, c: number, values: Cell[][]) => void;
}

const CW = 60; // cell width: 7 characters of the 8px mono font plus padding
const RH = 22; // row height
const HW = 30; // row header width (three digits)
const OVERSCAN = 2;

interface Pos {
  r: number;
  c: number;
}

/**
 * Small spreadsheet for one elevation matrix. Only the cells in view are rendered, so a
 * 301 x 301 matrix stays light. Edits save as you type; blocks copied from Excel paste at the
 * active cell, and a selected range copies back out as tab separated text.
 */
export function Sheet({ label, matrix, used, onCell, onPaste }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const dragging = useRef(false);

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const clamp = (p: Pos): Pos => ({ r: Math.max(0, Math.min(rows - 1, p.r)), c: Math.max(0, Math.min(cols - 1, p.c)) });
  const value = matrix[active.r]?.[active.c] ?? 0;

  // keep the active cell inside the matrix after a resize
  useEffect(() => {
    if (active.r >= rows || active.c >= cols) {
      setActive(clamp(active));
      setAnchor(clamp(anchor));
    }
  }, [rows, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  // show the stored value unless the typed text already means the same number ("10." while typing)
  useEffect(() => {
    setText((t) => (t.trim() !== '' && Number(t) === value ? t : fmt(value, 3)));
  }, [value, active.r, active.c]);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setScroll({ left: el.scrollLeft, top: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const r0 = Math.max(0, Math.floor(scroll.top / RH) - OVERSCAN);
  const r1 = Math.min(rows - 1, Math.ceil((scroll.top + scroll.h) / RH) + OVERSCAN);
  const c0 = Math.max(0, Math.floor(scroll.left / CW) - OVERSCAN);
  const c1 = Math.min(cols - 1, Math.ceil((scroll.left + scroll.w) / CW) + OVERSCAN);

  const sel = {
    r0: Math.min(anchor.r, active.r),
    r1: Math.max(anchor.r, active.r),
    c0: Math.min(anchor.c, active.c),
    c1: Math.max(anchor.c, active.c),
  };
  const multi = sel.r0 !== sel.r1 || sel.c0 !== sel.c1;

  const reveal = (p: Pos) => {
    const el = body.current;
    if (!el) return;
    const x = p.c * CW;
    const y = p.r * RH;
    if (x < el.scrollLeft) el.scrollLeft = x;
    else if (x + CW > el.scrollLeft + el.clientWidth) el.scrollLeft = x + CW - el.clientWidth;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + RH > el.scrollTop + el.clientHeight) el.scrollTop = y + RH - el.clientHeight;
  };

  const focusInput = () => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  };

  const go = (p: Pos, extend = false) => {
    const q = clamp(p);
    setActive(q);
    if (!extend) setAnchor(q);
    reveal(q);
    requestAnimationFrame(focusInput);
  };

  const cellAt = (e: React.PointerEvent): Pos => {
    const rect = body.current!.getBoundingClientRect();
    return clamp({
      r: Math.floor((e.clientY - rect.top + body.current!.scrollTop) / RH),
      c: Math.floor((e.clientX - rect.left + body.current!.scrollLeft) / CW),
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const t = e.currentTarget;
    const whole = t.selectionStart === 0 && t.selectionEnd === t.value.length;
    const step = (dr: number, dc: number) => {
      e.preventDefault();
      go({ r: active.r + dr, c: active.c + dc }, e.shiftKey && e.key.startsWith('Arrow'));
    };
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: rows - 1, c: cols - 1 });
      return;
    }
    switch (e.key) {
      case 'Enter':
        return step(e.shiftKey ? -1 : 1, 0);
      case 'Tab':
        return step(0, e.shiftKey ? -1 : 1);
      case 'ArrowUp':
        return step(-1, 0);
      case 'ArrowDown':
        return step(1, 0);
      case 'ArrowLeft':
        if (whole || t.selectionStart === 0 || e.shiftKey) step(0, -1);
        return;
      case 'ArrowRight':
        if (whole || t.selectionEnd === t.value.length || e.shiftKey) step(0, 1);
        return;
      case 'Escape':
        setText(fmt(value, 3));
        setAnchor(active);
        return;
    }
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (!multi) return; // single cell: the input copies its own text
    e.preventDefault();
    e.clipboardData.setData('text/plain', toTSV(matrix, sel.r0, sel.c0, sel.r1, sel.c1));
    setMsg(`Copied ${sel.r1 - sel.r0 + 1} × ${sel.c1 - sel.c0 + 1} values`);
  };

  const onPasteEvent = (e: React.ClipboardEvent) => {
    const data = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(data.trim())) return; // one value: let it land in the input
    e.preventDefault();
    const p = parseMatrix(data);
    if (p.error) return setMsg(p.error);
    const at = multi ? { r: sel.r0, c: sel.c0 } : active;
    onPaste(at.r, at.c, p.values);
    const h = p.values.length;
    const w = Math.max(...p.values.map((r) => r.length));
    setAnchor(at);
    setActive(clamp({ r: at.r + h - 1, c: at.c + w - 1 }));
    setMsg(`Pasted ${h} × ${w} values`);
  };

  const copyAll = async () => {
    const tsv = toTSV(matrix);
    try {
      await navigator.clipboard.writeText(tsv);
      setMsg(`Copied all ${rows} × ${cols} values`);
    } catch {
      setAnchor({ r: 0, c: 0 });
      setActive({ r: rows - 1, c: cols - 1 });
      setMsg('Press Ctrl+C to copy the selection');
    }
  };

  const cells: React.ReactNode[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r === active.r && c === active.c) continue;
      const inSel = r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;
      cells.push(
        <div
          key={`${r}-${c}`}
          className={`sh-cell${used(r, c) ? '' : ' unused'}${inSel ? ' in-sel' : ''}`}
          style={{ left: c * CW, top: r * RH }}
        >
          {fmtElev(matrix[r][c])}
        </div>,
      );
    }
  }

  return (
    <div className="sheet-wrap">
      <div className="sheet" style={{ gridTemplateColumns: `${HW}px 1fr`, gridTemplateRows: `${RH}px 1fr` }} onCopy={onCopy} onPaste={onPasteEvent}>
        <div className="sh-corner" />
        <div className="sh-colhead">
          <div style={{ transform: `translateX(${-scroll.left}px)` }}>
            {Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i).map((c) => (
              <div key={c} className={`sh-h${c >= sel.c0 && c <= sel.c1 ? ' on' : ''}`} style={{ left: c * CW, width: CW }}>
                {c + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="sh-rowhead">
          <div style={{ transform: `translateY(${-scroll.top}px)` }}>
            {Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i).map((r) => (
              <div key={r} className={`sh-h${r >= sel.r0 && r <= sel.r1 ? ' on' : ''}`} style={{ top: r * RH, height: RH }}>
                {r + 1}
              </div>
            ))}
          </div>
        </div>
        <div
          className="sh-body px-scroll"
          ref={body}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScroll({ left: el.scrollLeft, top: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
          }}
          onPointerDown={(e) => {
            if (e.target === input.current || e.button !== 0) return;
            if (e.clientX - e.currentTarget.getBoundingClientRect().left > e.currentTarget.clientWidth) return; // scroll bar
            if (e.clientY - e.currentTarget.getBoundingClientRect().top > e.currentTarget.clientHeight) return;
            e.preventDefault();
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            go(cellAt(e), e.shiftKey);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const p = cellAt(e);
            if (p.r !== active.r || p.c !== active.c) {
              setActive(p);
              reveal(p);
            }
          }}
          onPointerUp={() => {
            dragging.current = false;
            focusInput();
          }}
        >
          <div className="sh-inner" style={{ width: cols * CW, height: rows * RH }}>
            {cells}
            {multi && (
              <div
                className="sh-sel"
                style={{ left: sel.c0 * CW, top: sel.r0 * RH, width: (sel.c1 - sel.c0 + 1) * CW, height: (sel.r1 - sel.r0 + 1) * RH }}
              />
            )}
            <input
              ref={input}
              className={`sh-input${used(active.r, active.c) ? '' : ' unused'}`}
              style={{ left: active.c * CW, top: active.r * RH, width: CW, height: RH }}
              inputMode="decimal"
              aria-label={`${label} elevation, row ${active.r + 1}, column ${active.c + 1}`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMsg(null);
                const v = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(v)) onCell(active.r, active.c, v);
              }}
              onKeyDown={onKey}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
      </div>
      <div className="sheet-foot">
        <span className="dim">
          {msg ?? `Row ${active.r + 1}, col ${active.c + 1}${multi ? ` · ${sel.r1 - sel.r0 + 1} × ${sel.c1 - sel.c0 + 1} selected` : ''}`}
        </span>
        <button type="button" className="btn sm" onClick={copyAll} title="Copy the whole matrix as tab separated text for Excel">
          Copy all
        </button>
      </div>
    </div>
  );
}
