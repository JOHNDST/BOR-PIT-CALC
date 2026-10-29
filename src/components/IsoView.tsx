import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Grid, Result } from '../calc';
import { autoExaggeration, PixelBuffer, readPalette, renderIso } from '../iso';
import { fmt } from '../matrix';
import { buildScene } from '../scene';

const PX = 3; // screen pixels per art pixel

export function IsoView({ grid, result, theme }: { grid: Grid; result: Result; theme: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 420 });
  const [turn, setTurn] = useState(0);
  const [zMul, setZMul] = useState(1);
  const [letters, setLetters] = useState(true);

  const scene = useMemo(() => buildScene(grid, result), [grid, result]);
  const exaggeration = autoExaggeration(scene) * zMul;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(320, Math.min(560, el.clientWidth * 0.62)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    const el = wrap.current;
    if (!cv || !el) return;
    const w = Math.max(1, Math.floor(size.w / PX));
    const h = Math.max(1, Math.floor(size.h / PX));
    cv.width = w;
    cv.height = h;
    const buf = new PixelBuffer(w, h);
    renderIso(buf, scene, readPalette(el), { turn, exaggeration, showLetters: letters });
    cv.getContext('2d')!.putImageData(buf.data, 0, 0);
  }, [scene, size, turn, exaggeration, letters, theme]);

  return (
    <div className="iso-wrap" ref={wrap}>
      <div className="iso-tools">
        <button className="btn sm" onClick={() => setTurn((t) => (t + 1) % 4)}>
          Rotate
        </button>
        <button className="btn sm" onClick={() => setZMul((z) => Math.max(0.25, z / 1.5))} aria-label="Less vertical exaggeration">
          Z-
        </button>
        <button className="btn sm" onClick={() => setZMul((z) => Math.min(8, z * 1.5))} aria-label="More vertical exaggeration">
          Z+
        </button>
        <button className={`btn sm ${letters ? 'on' : ''}`} onClick={() => setLetters((v) => !v)}>
          ABCD
        </button>
        <span className="iso-note">vert. exag. ×{fmt(exaggeration, 1)}</span>
      </div>
      <canvas
        ref={canvas}
        className="iso-canvas"
        style={{ width: Math.floor(size.w / PX) * PX, height: Math.floor(size.h / PX) * PX }}
        aria-label="Isometric view of existing and proposed surfaces"
      />
    </div>
  );
}
