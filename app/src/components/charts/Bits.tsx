import type { ReactNode } from 'react';
import Icon from '../Icon';

/** Labelled pill track with a diagonally striped fill. */
export function StripedBar({
  label,
  value,
  pct,
  colors,
}: {
  label: string;
  value: ReactNode;
  /** 0-100 */
  pct: number;
  /** [stripe color 1, stripe color 2] */
  colors: [string, string];
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="breakdown-item">
      <div className="row">
        <span>{label}</span>
        <span className="num">{value}</span>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="fill stripes"
          style={{ width: width + '%', ['--s1' as string]: colors[0], ['--s2' as string]: colors[1] }}
        />
      </div>
    </div>
  );
}

/** Photo card with a palette color wash, a glass label pill, and one large stat. */
export function InsightCard({
  image,
  alt,
  stat,
  caption,
  action,
  className = '',
}: {
  image: string;
  alt: string;
  stat: string;
  caption: string;
  /** Optional control in the top-right corner (e.g. change picture). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={'insight-card ' + className}>
      <img src={image} alt={alt} loading="lazy" />
      <div className="wash" />
      <span className="insight-pill">
        <Icon name="lightbulb" size={13} /> Insights
      </span>
      {action}
      <div className="insight-stat">
        <div className="big num">{stat}</div>
        <div className="cap">{caption}</div>
      </div>
    </section>
  );
}
