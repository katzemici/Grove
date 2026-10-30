import { dotsFor, weekdayName, type DayCount } from '../../lib/overview';
import { formatDateHuman } from '../../lib/date';

/** One column of dots per day; dot count scales with that day's volume. The peak day is saturated. */
export default function DotMatrix({ days }: { days: DayCount[] }) {
  const max = Math.max(0, ...days.map((d) => d.count));
  const peakIndex = max > 0 ? days.findIndex((d) => d.count === max) : -1;
  const label =
    peakIndex >= 0
      ? `Transactions per day, peak ${max} on ${formatDateHuman(days[peakIndex].date)}`
      : 'No transactions in this period';

  return (
    <div className="dot-matrix" role="img" aria-label={label}>
      {days.map((d, i) => {
        const n = Math.max(1, dotsFor(d.count, max));
        const isPeak = i === peakIndex;
        return (
          <div
            key={d.date}
            className={'dot-col' + (isPeak ? ' peak' : '')}
            title={`${formatDateHuman(d.date)}: ${d.count}`}
            style={d.count === 0 ? { opacity: 0.45 } : undefined}
          >
            {Array.from({ length: n }, (_, k) => (
              <i key={k} />
            ))}
            {isPeak && <span className="float-pill">Peak: {weekdayName(d.date)}</span>}
          </div>
        );
      })}
    </div>
  );
}
