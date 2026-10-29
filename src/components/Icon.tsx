import { ICONS, type IconName } from '../icons';

const paths = new Map<IconName, string>();

/** One rect per horizontal run of ink pixels. */
function pathFor(name: IconName): string {
  let d = paths.get(name);
  if (d) return d;
  d = '';
  ICONS[name].forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === '#') x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  paths.set(name, d);
  return d;
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <path d={pathFor(name)} fill="currentColor" />
    </svg>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
}

/** Square pixel button; `label` is the tooltip and the accessible name. */
export function IconButton({ icon, label, active, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`btn icon-btn ${active ? 'on' : ''} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
