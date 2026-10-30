import { stepPath } from '../../lib/overview';

/** Stepped line over faint vertical bars, with a marker and value bubble on one point. */
export default function StepLine({
  values,
  markerIndex = values.length - 1,
  label,
}: {
  /** 0-100 values, oldest first. */
  values: number[];
  markerIndex?: number;
  label: string;
}) {
  if (values.length === 0) return null;
  const slot = 100 / values.length;
  const mx = slot * (markerIndex + 0.5);
  const my = 100 - values[markerIndex];

  return (
    <div className="step-chart" role="img" aria-label={label}>
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 3 }}
      >
        {values.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: Math.max(4, v) + '%',
              borderRadius: '2px 2px 0 0',
              background: 'rgba(213, 199, 172, 0.5)',
            }}
          />
        ))}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path
          d={stepPath(values)}
          fill="none"
          stroke="var(--ginger)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="guide" style={{ left: mx + '%', height: 100 - my + '%' }} aria-hidden />
      <span className="marker" style={{ left: mx + '%', top: my + '%' }} aria-hidden />
      <span className="float-pill" style={{ left: mx + '%', top: my + '%' }} aria-hidden>
        {values[markerIndex]}%
      </span>
    </div>
  );
}
