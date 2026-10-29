import { useMemo, useState } from 'react';
import { type Cell, formatMatrix, matrixShape, parseMatrix } from '../matrix';
import { IconButton } from './Icon';

interface Props {
  label: string;
  matrix: number[][];
  used: (r: number, c: number) => boolean;
  onApply: (values: Cell[][]) => void;
  /** apply after resizing the grid to fit a matrix of a different size */
  onResizeApply: (values: Cell[][]) => void;
  hidden?: boolean;
  /** extra controls at the end of the button row */
  children?: React.ReactNode;
}

export function MatrixInput({ label, matrix, used, onApply, onResizeApply, hidden, children }: Props) {
  // formatting is the slow part on big grids: only for the visible tab, and only when this matrix or the site changes
  const synced = useMemo(() => (hidden ? '' : formatMatrix(matrix, used)), [matrix, used, hidden]);
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
    <div className="matrix" hidden={hidden}>
      <textarea
        className="px-scroll"
        value={draft ?? synced}
        spellCheck={false}
        wrap="off"
        onChange={(e) => {
          setDraft(e.target.value);
          setMsg(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply();
        }}
        aria-label={`${label} elevation matrix`}
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
        <IconButton icon="check" label="Apply matrix (Ctrl+Enter)" className={draft !== null ? 'primary' : ''} onClick={apply} disabled={draft === null} />
        <IconButton
          icon="undo"
          label="Revert to the current values"
          onClick={() => {
            setDraft(null);
            setMsg(null);
          }}
          disabled={draft === null}
        />
        {draft !== null && <span className="dim">unsaved</span>}
        <span className="grow" />
        {children}
      </div>
    </div>
  );
}
