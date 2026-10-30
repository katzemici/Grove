import { useState } from 'react';
import { biggestDropIndex, compact, funnelMetrics, niceMax, type FunnelStage } from '../../lib/overview';

// Geometry in px. The chart is a fixed height so the slopes can use px clip-paths.
const HEIGHT = 300;
const HEADER = 64; // space for the stage label + value at the top of each column
const BASE = 48; // covered by the overlapping ask bar; bars always rise above it
const PLOT = HEIGHT - HEADER - BASE;
const BAR_WIDTH = 78; // percent of the column; the rest is the slope to the next bar

export default function FunnelChart({
  stages,
  unit,
}: {
  stages: FunnelStage[];
  /** Noun used in the tooltip, e.g. "tasks". */
  unit: string;
}) {
  const metrics = funnelMetrics(stages);
  const [active, setActive] = useState(() => biggestDropIndex(metrics));
  const activeIndex = Math.min(active, metrics.length - 1);

  const ceiling = niceMax(Math.max(0, ...stages.map((s) => s.value)));
  const barPx = (v: number) => BASE + (v / ceiling) * PLOT;
  const ticks = [1, 0.75, 0.5, 0.25].map((t) => t * ceiling);

  const a = metrics[activeIndex];
  const n = metrics.length;
  const summary = metrics.map((m) => `${m.label} ${m.value}`).join(', ');

  return (
    <div className="funnel-scroll">
      <div
        className="funnel"
        style={{ ['--cols' as string]: n, height: HEIGHT }}
        role="group"
        aria-label={`Funnel: ${summary}`}
      >
        <div className="funnel-y" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: barPx(t) }}>
              {compact(t)}
            </span>
          ))}
        </div>

        {metrics.map((m, i) => {
          const h = barPx(m.value);
          const next = metrics[i + 1];
          const nextH = next ? barPx(next.value) : h;
          return (
            <button
              type="button"
              key={m.label}
              className={'funnel-stage' + (i === activeIndex ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-pressed={i === activeIndex}
              aria-label={`${m.label}: ${m.value}${i > 0 ? `, conversion ${m.conversion}%` : ''}`}
            >
              <span className="stage-label">{m.label}</span>
              <span className="stage-value">{compact(m.value)}</span>
              <span className="funnel-bar stripes" style={{ height: h, width: BAR_WIDTH + '%' }}>
                <span className="handle" />
              </span>
              {next && (
                <span
                  className="funnel-slope"
                  style={{
                    height: h,
                    clipPath: `polygon(0 0, 100% ${Math.max(0, h - nextH)}px, 100% 100%, 0 100%)`,
                  }}
                />
              )}
            </button>
          );
        })}

        <div
          className="funnel-tooltip"
          role="status"
          style={{
            left: `calc(40px + (100% - 40px) * ${(activeIndex + 0.5) / n})`,
            top: Math.max(HEADER + 34, HEIGHT - barPx(a.value) - 14),
            transform:
              activeIndex === n - 1
                ? 'translate(-88%, -100%)'
                : activeIndex === 0
                  ? 'translate(-20%, -100%)'
                  : 'translate(-50%, -100%)',
          }}
        >
          <b>{a.value}</b>&nbsp;{unit}
          {activeIndex > 0 && (
            <>
              <span className="sep" />
              Conversion:&nbsp;<b>{a.conversion}%</b>
              <span className="sep" />
              Drop-off:&nbsp;<span className="drop">-{a.dropOff}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
