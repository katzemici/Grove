import type { ReactNode } from 'react';

const SEGMENTS = 12;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(3)} ${y0.toFixed(3)} A${r} ${r} 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

/** Circular progress. `dashed` draws the segmented ring used beside list rows. */
export default function Ring({
  pct,
  color,
  size = 18,
  stroke = 2.5,
  dashed = false,
  track = 'rgba(101, 116, 77, 0.16)',
  children,
  label,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  dashed?: boolean;
  track?: string;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * SEGMENTS);
  const step = (Math.PI * 2) / SEGMENTS;
  const gap = step * 0.35;

  return (
    <span
      className={'ring' + (dashed ? ' dashed' : '')}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {dashed ? (
          Array.from({ length: SEGMENTS }, (_, k) => {
            const a0 = -Math.PI / 2 + k * step + gap / 2;
            return (
              <path
                key={k}
                d={arc(cx, cx, r, a0, a0 + step - gap)}
                fill="none"
                stroke={k < filled ? color : track}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
            );
          })
        ) : (
          <>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={stroke} />
            <circle
              className="ring-value"
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${(p / 100) * c} ${c}`}
              transform={`rotate(-90 ${cx} ${cx})`}
            />
          </>
        )}
      </svg>
      {children && <span className="ring-center">{children}</span>}
    </span>
  );
}
