import { useEffect, useRef, useState } from 'react';
import type { CornerResult } from '../calc';
import { fmt, fmtElev } from '../matrix';
import type { PanZoom } from '../usePanZoom';
import { IconButton } from './Icon';
import type { Layout } from './PlanView';

interface Props {
  corner: CornerResult;
  layout: Layout;
  view: PanZoom;
  viewport: { w: number; h: number };
  units: string;
  onChange: (field: 'existing' | 'proposed', value: number) => void;
  onStep: (dir: 1 | -1) => void;
  onClose: () => void;
}

const W = 236;
const H = 250;

function Field({
  label,
  value,
  autoFocus,
  onCommit,
  onKey,
}: {
  label: string;
  value: number;
  autoFocus?: boolean;
  onCommit: (v: number) => void;
  onKey: (e: React.KeyboardEvent) => void;
}) {
  // keep typed text (e.g. "10.") while editing; the parent only receives valid numbers
  const [text, setText] = useState(fmt(value, 3));
  const ref = useRef<HTMLInputElement>(null);
  const bad = text.trim() !== '' && !Number.isFinite(Number(text));

  useEffect(() => {
    if (autoFocus) ref.current?.select();
  }, [autoFocus]);

  return (
    <label className="field row">
      <span>{label}</span>
      <input
        ref={ref}
        inputMode="decimal"
        value={text}
        className={bad ? 'bad' : ''}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={onKey}
      />
    </label>
  );
}

export function CornerEditor({ corner, layout, view, viewport, units, onChange, onStep, onClose }: Props) {
  // corner position inside the viewport; keep the editor fully visible
  const x0 = layout.x(corner.c) + view.x;
  const y0 = layout.y(corner.r) + view.y;
  const right = x0 + 22;
  const left = Math.max(4, Math.min(right + W > viewport.w - 4 ? x0 - 22 - W : right, viewport.w - W - 4));
  const top = Math.max(4, Math.min(y0 - 40, viewport.h - H - 4));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onStep(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const id = `${corner.r}-${corner.c}`;
  const kind = corner.cut > 0 ? 'CUT' : corner.fill > 0 ? 'FILL' : 'NO CHANGE';

  return (
    <div className="editor no-pan" style={{ left, top, width: W }} role="dialog" aria-label="Edit corner elevations">
      <div className="editor-head">
        <span>
          Corner {corner.r + 1},{corner.c + 1}
        </span>
        <IconButton icon="close" label="Close (Esc)" className="x" onClick={onClose} />
      </div>
      <div className="editor-type">
        <span className={`badge-html type-${corner.type}`}>{corner.type}</span>
        <span>
          shared by {corner.n} cell{corner.n > 1 ? 's' : ''}, weight ×{corner.n}
        </span>
      </div>
      <Field key={`e${id}`} label="Existing" value={corner.existing} onCommit={(v) => onChange('existing', v)} onKey={onKey} />
      <Field key={`p${id}`} label="Proposed" value={corner.proposed} autoFocus onCommit={(v) => onChange('proposed', v)} onKey={onKey} />
      <div className="editor-h">
        h = {corner.h > 0 ? '+' : ''}
        {fmtElev(corner.h, 3)} {units} <b>{kind}</b>
      </div>
      <div className="editor-nav">
        <IconButton icon="left" label="Previous corner (Shift+Enter)" onClick={() => onStep(-1)} />
        <IconButton icon="right" label="Next corner (Enter)" onClick={() => onStep(1)} />
        <span className="editor-hint">Enter = next</span>
      </div>
    </div>
  );
}
