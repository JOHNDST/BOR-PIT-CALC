import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Grid, Result } from '../calc';
import { autoExaggeration, PixelBuffer, readPalette, renderIso } from '../iso';
import { fmt } from '../matrix';
import { buildScene } from '../scene';
import { usePanZoom } from '../usePanZoom';
import { ZoomTools } from './ZoomTools';

const PX = 3; // screen pixels per art pixel

export function IsoView({ grid, result }: { grid: Grid; result: Result }) {
  const vp = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { view, setView, zoomAt, dragging } = usePanZoom(vp, { min: 0.5, max: 6, origin: { x: size.w / 2, y: size.h / 2 } });

  const scene = useMemo(() => buildScene(grid, result), [grid, result]);
  const exaggeration = autoExaggeration(scene);

  useLayoutEffect(() => {
    const el = vp.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a new grid layout starts from the fitted view
  useEffect(() => setView({ zoom: 1, x: 0, y: 0 }), [grid.cols, grid.rows, grid.cellW, grid.cellH, setView]);

  useEffect(() => {
    const cv = canvas.current;
    const el = vp.current;
    if (!cv || !el || !size.w) return;
    const w = Math.max(1, Math.floor(size.w / PX));
    const h = Math.max(1, Math.floor(size.h / PX));
    cv.width = w;
    cv.height = h;
    const buf = new PixelBuffer(w, h);
    renderIso(buf, scene, readPalette(el), {
      zoom: view.zoom,
      panX: Math.round(view.x / PX),
      panY: Math.round(view.y / PX),
      exaggeration,
      letters: true,
    });
    cv.getContext('2d')!.putImageData(buf.data, 0, 0);
  }, [scene, size, view, exaggeration]);

  return (
    <div className={`vp ${dragging ? 'dragging' : ''}`} ref={vp}>
      <canvas
        ref={canvas}
        className="iso-canvas"
        style={{ width: Math.floor(size.w / PX) * PX, height: Math.floor(size.h / PX) * PX }}
        aria-label="Isometric view of existing ground and proposed grade"
      />
      <span className="vp-note">vert. exag. ×{fmt(exaggeration, 1)}</span>
      <ZoomTools zoom={view.zoom} onZoom={(f) => zoomAt(f, size.w / 2, size.h / 2)} onFit={() => setView({ zoom: 1, x: 0, y: 0 })} />
    </div>
  );
}
