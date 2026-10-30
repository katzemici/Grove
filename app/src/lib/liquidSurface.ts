// Geometry for the login ⇄ register liquid pour (components/LiquidHero.tsx).
// All values are in objectBoundingBox units: x and y run 0..1 across the hero.

const POINTS = 56;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Liquid surface height (0 = top of the hero, 1 = bottom) for progress p (0..1). */
export function surfaceLevel(p: number): number {
  return 1.08 - p * 1.16;
}

/** Wavy surface points. Waves peak mid-transition and settle flat at both ends. */
function edge(p: number, phase: number): [number, number][] {
  const a = 0.055 * Math.sin(Math.PI * p);
  const base = surfaceLevel(p);
  const pts: [number, number][] = [];
  for (let i = 0; i <= POINTS; i++) {
    const x = i / POINTS;
    const y =
      base +
      a * Math.sin(2 * Math.PI * 1.4 * x + phase) +
      a * 0.45 * Math.sin(2 * Math.PI * 3.1 * x - phase * 1.4);
    pts.push([x, y]);
  }
  return pts;
}

/** Open path along the surface, for the shiny meniscus line. */
export function surfaceEdge(p: number, phase: number): string {
  return edge(p, phase)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)} ${y.toFixed(4)}`)
    .join(' ');
}

/** Closed clip path for the poured-in scene: 0 shows nothing, 1 covers everything. */
export function surfacePath(p: number, phase: number): string {
  return `${surfaceEdge(p, phase)} L1 1.2 L0 1.2 Z`;
}
