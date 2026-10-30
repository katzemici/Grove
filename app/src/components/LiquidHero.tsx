import { useEffect, useId, useRef } from 'react';
import GhibliCatScene from './GhibliCatScene';
import GhibliSuitCatScene from './GhibliSuitCatScene';
import { prefersReducedMotion } from '../lib/liquid';
import { easeInOutCubic as ease, surfaceEdge, surfaceLevel as level, surfacePath } from '../lib/liquidSurface';

const DURATION = 1100;
const DROPS = [0.22, 0.52, 0.8];

/**
 * Login illustration with the register illustration poured over it. Switching
 * fills the hero with the new scene like rising water (and drains it again
 * on the way back), with a few droplets leading the wave.
 */
export default function LiquidHero({ showRegister }: { showRegister: boolean }) {
  const clipId = 'lq-clip-' + useId().replace(/:/g, '');
  const fill = useRef<SVGPathElement>(null);
  const sheen = useRef<SVGPathElement>(null);
  const sheenSvg = useRef<SVGSVGElement>(null);
  const drops = useRef<(SVGEllipseElement | null)[]>([]);
  const progress = useRef(showRegister ? 1 : 0);

  function draw(p: number, phase: number) {
    fill.current?.setAttribute('d', surfacePath(p, phase));
    sheen.current?.setAttribute('d', surfaceEdge(p, phase));
    if (sheenSvg.current) sheenSvg.current.style.opacity = String(Math.sin(Math.PI * p));
    const lift = Math.sin(Math.PI * p);
    DROPS.forEach((x, i) => {
      const el = drops.current[i];
      if (!el) return;
      const y = level(p) - 0.05 - 0.07 * lift * (1 + 0.4 * Math.sin(phase + i * 2));
      const r = 0.022 * lift * (1 - i * 0.18);
      el.setAttribute('cx', String(x));
      el.setAttribute('cy', String(y));
      el.setAttribute('rx', String(r));
      el.setAttribute('ry', String(r * 0.8));
    });
  }

  useEffect(() => {
    const from = progress.current;
    const to = showRegister ? 1 : 0;
    if (from === to || prefersReducedMotion()) {
      progress.current = to;
      draw(to, 0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const p = from + (to - from) * ease(t);
      progress.current = p;
      draw(p, now / 260);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showRegister]);

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <clipPath id={clipId} clipPathUnits="objectBoundingBox">
          <path ref={fill} d={showRegister ? 'M0 -0.2 L1 -0.2 L1 1.2 L0 1.2 Z' : 'M0 1.2 L1 1.2 Z'} />
          {DROPS.map((_, i) => (
            <ellipse key={i} ref={(el) => (drops.current[i] = el)} rx="0" ry="0" />
          ))}
        </clipPath>
      </svg>

      <div className="auth-scene-layer" aria-hidden={showRegister}>
        <GhibliCatScene className="auth-scene" />
      </div>
      <div
        className="auth-scene-layer"
        aria-hidden={!showRegister}
        style={{ clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})` }}
      >
        <GhibliSuitCatScene className="auth-scene" />
      </div>

      {/* Bright meniscus line riding the surface while it moves */}
      <svg
        ref={sheenSvg}
        className="auth-sheen"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ opacity: 0 }}
      >
        <path ref={sheen} d="" />
      </svg>
    </>
  );
}
