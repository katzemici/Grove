import { useMemo, useRef, useState } from 'react';
import { formatDateHuman } from '../../lib/date';
import { formatMoney, formatMoneyCompact } from '../../lib/finance';
import { niceMax } from '../../lib/overview';
import type { SpendingSeries } from '../../lib/financeView';
import Icon from '../Icon';

const W = 1000;
const H = 280;

/** Monotone cubic (Fritsch-Carlson) path through points; never overshoots between points. */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${x0 + h} ${y0 + t[i] * h} ${x1 - h} ${y1 - t[i + 1] * h} ${x1} ${y1}`;
  }
  return d;
}

export default function SpendingChart({ series }: { series: SpendingSeries }) {
  const n = series.dates.length;
  const peak = Math.max(0, ...series.current, ...series.previous);
  const empty = peak === 0;
  const ceiling = niceMax(Math.max(1, peak));
  const [hover, setHover] = useState<number | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const geo = useMemo(() => {
    const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: number) => H - (v / ceiling) * H;
    const cur = series.current.map((v, i) => [x(i), y(v)] as [number, number]);
    const prev = series.previous.map((v, i) => [x(i), y(v)] as [number, number]);
    const curLine = smoothPath(cur);
    const prevLine = smoothPath(prev);
    return {
      x,
      y,
      curLine,
      prevLine,
      curArea: `${curLine} L${W} ${H} L0 ${H} Z`,
      prevArea: `${prevLine} L${W} ${H} L0 ${H} Z`,
    };
  }, [series, ceiling, n]);

  const active = hover ?? n - 1;
  const ax = (geo.x(active) / W) * 100;
  const cy = (geo.y(series.current[active]) / H) * 100;
  const py = (geo.y(series.previous[active]) / H) * 100;
  const ticks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => f * ceiling);
  const labelEvery = Math.max(1, Math.ceil(n / 11));

  function onMove(e: React.PointerEvent) {
    const r = overlay.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(f * (n - 1)));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') setHover(Math.max(0, active - 1));
    else if (e.key === 'ArrowRight') setHover(Math.min(n - 1, active + 1));
    else return;
    e.preventDefault();
  }

  const tooltipLeft = ax > 70;

  return (
    <div className="spend-chart">
      <div className="spend-y" aria-hidden>
        {!empty && ticks.map((t) => (
          <span key={t} style={{ top: (1 - t / ceiling) * 100 + '%' }}>
            {formatMoneyCompact(t)}
          </span>
        ))}
      </div>
      <div
        className="spend-plot"
        ref={overlay}
        tabIndex={0}
        role="img"
        aria-label={`Cumulative spending: ${formatMoney(series.total)} this period, ${formatMoney(series.previousTotal)} the period before. Use arrow keys to inspect days.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden key={n + ':' + series.total}>
          <defs>
            <linearGradient id="sp-cur" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--meadow)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--meadow)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sp-prev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a8f80" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#8a8f80" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="sp-area" d={geo.prevArea} fill="url(#sp-prev)" />
          <path className="sp-line prev" d={geo.prevLine} />
          <path className="sp-area" d={geo.curArea} fill="url(#sp-cur)" />
          <path className="sp-line cur" d={geo.curLine} />
        </svg>

        <span className="sp-cross" style={{ left: ax + '%', top: Math.min(cy, py) + '%' }} aria-hidden />
        <span className="sp-glow" style={{ left: ax + '%', top: cy + '%' }} aria-hidden />
        <span className="sp-dot cur" style={{ left: ax + '%', top: cy + '%' }} aria-hidden />
        <span className="sp-dot prev" style={{ left: ax + '%', top: py + '%' }} aria-hidden />

        {empty && <span className="sp-empty">No spending in this period</span>}
        <div
          hidden={empty}
          className={'sp-tip' + (tooltipLeft ? ' to-left' : '')}
          style={{ left: ax + '%', top: Math.min(cy, py) + '%' }}
          aria-hidden
        >
          <div className="sp-tip-date">{formatDateHuman(series.dates[active])}</div>
          <div className="sp-tip-row">
            <span className="ring-dot cur" /> This period
            <b className="pos">
              {formatMoney(series.current[active])} <Icon name="trendUp" size={12} />
            </b>
          </div>
          <div className="sp-tip-row">
            <span className="ring-dot prev" /> Period before
            <b className="neg">{formatMoney(series.previous[active])}</b>
          </div>
        </div>
      </div>
      <div className="spend-x" aria-hidden>
        {series.dates.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <span key={d} style={{ left: (geo.x(i) / W) * 100 + '%' }}>
              {Number(d.slice(8))}/{Number(d.slice(5, 7))}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
