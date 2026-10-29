import { IconButton } from './Icon';

interface Props {
  onZoom: (factor: number) => void;
  onFit: () => void;
  zoom: number;
}

/** Zoom buttons in the corner of a viewport. `no-pan` keeps drags on them from panning. */
export function ZoomTools({ onZoom, onFit, zoom }: Props) {
  return (
    <div className="zoom-tools no-pan">
      <IconButton icon="zoomIn" label="Zoom in" onClick={() => onZoom(1.25)} />
      <IconButton icon="zoomOut" label="Zoom out" onClick={() => onZoom(0.8)} />
      <IconButton icon="fit" label="Zoom to all" onClick={onFit} />
      <span className="zoom-pct">{zoom >= 0.1 ? Math.round(zoom * 100) : (zoom * 100).toFixed(1)}%</span>
    </div>
  );
}
