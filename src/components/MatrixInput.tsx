import { useState } from 'react';
import { type Cell, formatMatrix, matrixShape, parseMatrix } from '../matrix';

interface Props {
  title: string;
  matrix: number[][];
  used: (r: number, c: number) => boolean;
  onApply: (values: Cell[][]) => void;
  /** apply after resizing the grid to fit a matrix of a different size */
  onResizeApply: (values: Cell[][]) => void;
  children?: React.ReactNode;
}

export function MatrixInput({ title, matrix, used, onApply, onResizeApply, children }: Props) {
  const synced = formatMatrix(matrix, used);
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; resize?: Cell[][] } | null>(null);

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  const apply = () => {
    const p = parseMatrix(draft ?? synced);
    if (p.error) return setMsg({ text: p.error });
    const shape = matrixShape(p.values);
    if (shape.ragged) return setMsg({ text: 'Every row needs the same number of values (use - for unused corners).' });
    if (shape.rows !== rows || shape.cols !== cols) {
      const ok = shape.rows >= 2 && shape.cols >= 2;
      return setMsg({
        text: `Expected ${rows} rows x ${cols} values, got ${shape.rows} x ${shape.cols}.`,
        resize: ok ? p.values : undefined,
      });
    }
    onApply(p.values);
    setDraft(null);
    setMsg(null);
  };

  return (
    <div className="matrix">
      <div className="matrix-head">
        <span>{title}</span>
        <span className="dim">
          {rows} x {cols} corners
        </span>
      </div>
      <textarea
        value={draft ?? synced}
        spellCheck={false}
        rows={Math.min(8, Math.max(3, rows))}
        onChange={(e) => {
          setDraft(e.target.value);
          setMsg(null);
        }}
        aria-label={`${title} elevation matrix`}
      />
      {msg && (
        <div className="msg">
          {msg.text}
          {msg.resize && (
            <button
              className="btn sm"
              onClick={() => {
                onResizeApply(msg.resize!);
                setDraft(null);
                setMsg(null);
              }}
            >
              Resize grid + apply
            </button>
          )}
        </div>
      )}
      <div className="row-btns">
        <button className="btn sm primary" onClick={apply} disabled={draft === null}>
          Apply
        </button>
        <button
          className="btn sm"
          onClick={() => {
            setDraft(null);
            setMsg(null);
          }}
          disabled={draft === null}
        >
          Revert
        </button>
        {draft !== null && <span className="dim">unsaved</span>}
      </div>
      {children}
    </div>
  );
}
