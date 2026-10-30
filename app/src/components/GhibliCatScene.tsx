// Login hero: a hand-drawn-style meadow scene in the spirit of Studio Ghibli
// backgrounds. Towering cumulus clouds, a camphor tree, a ginger cat napping
// on the hill under a leaf umbrella, two soot sprites and drifting seeds.
// Pure SVG so it scales crisply and costs no network request.

const DAISIES: [number, number, number][] = [
  [60, 712, 1], [118, 748, 0.8], [182, 706, 0.9], [236, 766, 1.1], [402, 742, 0.9],
  [452, 704, 0.8], [508, 758, 1], [560, 716, 0.85], [92, 782, 1.2], [350, 784, 1],
  [28, 760, 0.8], [584, 780, 1.1], [270, 724, 0.75], [470, 790, 1.15],
];

const SEEDS: [number, number, number, number][] = [
  [120, 330, 2.2, 0], [210, 250, 1.6, 1.2], [420, 360, 2, 2.4], [520, 280, 1.4, 0.6],
  [80, 450, 1.8, 3], [330, 300, 1.4, 1.8], [470, 470, 2.2, 0.9], [260, 410, 1.5, 2.1],
];

export function Daisy({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-6" rx="2.6" ry="6" fill="#fffdf6" transform={`rotate(${i * 45})`} />
      ))}
      <circle r="3.2" fill="#f7c948" />
    </g>
  );
}

export function SootSprite({
  x,
  y,
  r,
  look = 0,
  filter = 'gh-fuzz',
}: {
  x: number;
  y: number;
  r: number;
  look?: number;
  /** Id of a displacement filter in the host SVG (ids must be unique per page). */
  filter?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} className="soot">
      <circle r={r} fill="#1c1a17" filter={`url(#${filter})`} />
      <circle cx={-r * 0.38} cy={-r * 0.12} r={r * 0.34} fill="#fff" />
      <circle cx={r * 0.38} cy={-r * 0.12} r={r * 0.34} fill="#fff" />
      <circle cx={-r * 0.38 + look} cy={-r * 0.1} r={r * 0.15} fill="#1c1a17" />
      <circle cx={r * 0.38 + look} cy={-r * 0.1} r={r * 0.15} fill="#1c1a17" />
    </g>
  );
}

export default function GhibliCatScene({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustration: a ginger cat naps on a sunny hill under a leaf, with soot sprites in the grass"
    >
      <defs>
        <linearGradient id="gh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fa8dc" />
          <stop offset="0.55" stopColor="#9ccbea" />
          <stop offset="1" stopColor="#e6f3ee" />
        </linearGradient>
        <radialGradient id="gh-sun" cx="0.18" cy="0.12" r="0.6">
          <stop offset="0" stopColor="#fff8d6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff8d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gh-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d27a" />
          <stop offset="0.45" stopColor="#7fbb5f" />
          <stop offset="1" stopColor="#4f8f43" />
        </linearGradient>
        <linearGradient id="gh-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fc1a4" />
          <stop offset="1" stopColor="#a9d0b0" />
        </linearGradient>
        <linearGradient id="gh-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f4f8fb" />
          <stop offset="1" stopColor="#cfe0ee" />
        </linearGradient>
        <linearGradient id="gh-fur" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2b56c" />
          <stop offset="1" stopColor="#d98c43" />
        </linearGradient>
        <filter id="gh-fuzz" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="7" />
        </filter>
        <filter id="gh-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0.5 0" />
        </filter>
        <filter id="gh-soft">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Sky and sunlight */}
      <rect width="600" height="800" fill="url(#gh-sky)" />
      <rect width="600" height="800" fill="url(#gh-sun)" />

      {/* Towering cumulus clouds */}
      <g fill="url(#gh-cloud)">
        <g className="cloud cloud-a">
          <circle cx="170" cy="230" r="70" />
          <circle cx="250" cy="190" r="92" />
          <circle cx="340" cy="220" r="74" />
          <circle cx="300" cy="130" r="66" />
          <circle cx="215" cy="120" r="48" />
          <ellipse cx="260" cy="282" rx="170" ry="34" fill="#d6e6f1" />
        </g>
        <g className="cloud cloud-b" opacity="0.92">
          <circle cx="500" cy="120" r="44" />
          <circle cx="552" cy="100" r="54" />
          <circle cx="600" cy="128" r="46" />
          <ellipse cx="552" cy="160" rx="96" ry="18" fill="#d6e6f1" />
        </g>
        <g className="cloud cloud-c" opacity="0.85">
          <circle cx="40" cy="380" r="34" />
          <circle cx="82" cy="366" r="42" />
          <ellipse cx="66" cy="404" rx="76" ry="14" fill="#d6e6f1" />
        </g>
      </g>

      {/* Far hills */}
      <path d="M0 560 Q 110 498 230 528 T 450 506 T 600 520 V 800 H 0 Z" fill="url(#gh-far)" />
      <path d="M0 560 Q 110 498 230 528 T 450 506 T 600 520" fill="none" stroke="#eaf5e4" strokeOpacity="0.6" strokeWidth="3" />

      {/* Camphor tree on the right */}
      <g>
        <path d="M498 640 C 492 560 488 470 470 400 L 492 398 C 506 452 520 520 528 640 Z" fill="#6b4a32" />
        <path d="M486 470 C 460 450 432 444 404 446" stroke="#6b4a32" strokeWidth="10" strokeLinecap="round" fill="none" />
        <g fill="#3f7a3c">
          <circle cx="470" cy="360" r="78" />
          <circle cx="400" cy="420" r="56" />
          <circle cx="552" cy="390" r="70" />
          <circle cx="520" cy="300" r="66" />
          <circle cx="430" cy="320" r="52" />
        </g>
        <g fill="#5f9f4c">
          <circle cx="462" cy="336" r="56" />
          <circle cx="526" cy="318" r="46" />
          <circle cx="410" cy="404" r="38" />
          <circle cx="560" cy="380" r="44" />
        </g>
        <g fill="#b9d27a" opacity="0.8">
          <circle cx="446" cy="306" r="22" />
          <circle cx="510" cy="290" r="16" />
          <circle cx="398" cy="392" r="14" />
          <circle cx="548" cy="352" r="12" />
        </g>
      </g>

      {/* Near hill */}
      <path d="M0 650 Q 140 590 300 612 T 600 600 V 800 H 0 Z" fill="url(#gh-hill)" />
      <ellipse cx="300" cy="700" rx="120" ry="16" fill="#3f6f35" opacity="0.28" filter="url(#gh-soft)" />

      {/* The cat */}
      <g className="gh-cat">
        {/* tail curled around */}
        <path d="M360 680 C 430 690 452 640 420 610 C 404 596 392 608 402 620" fill="none" stroke="url(#gh-fur)" strokeWidth="22" strokeLinecap="round" />
        <path d="M404 618 C 398 610 404 600 414 606" fill="none" stroke="#fff3e2" strokeWidth="14" strokeLinecap="round" />
        {/* body */}
        <ellipse cx="300" cy="610" rx="80" ry="90" fill="url(#gh-fur)" />
        <path d="M232 580 q 14 -6 24 4 M226 612 q 14 -6 24 4 M352 586 q -14 -6 -24 4 M360 618 q -14 -6 -24 4" stroke="#c77a35" strokeWidth="5" strokeLinecap="round" fill="none" />
        <ellipse cx="300" cy="628" rx="44" ry="64" fill="#fff3e2" />
        {/* paws */}
        <ellipse cx="276" cy="694" rx="20" ry="12" fill="#fff3e2" />
        <ellipse cx="324" cy="694" rx="20" ry="12" fill="#fff3e2" />
        <path d="M270 696 v6 M278 697 v6 M318 697 v6 M326 696 v6" stroke="#e3c9a8" strokeWidth="2" strokeLinecap="round" />
        {/* leaf umbrella, a nod to a certain forest spirit */}
        <g transform="rotate(-14 344 420)">
          <path d="M344 440 L 344 380" stroke="#4f7a32" strokeWidth="4" strokeLinecap="round" />
          <path d="M270 392 C 290 340 398 340 418 392 C 398 380 376 384 366 392 C 356 382 332 382 322 392 C 312 382 288 382 270 392 Z" fill="#6faf5b" />
          <path d="M344 350 L 344 392 M300 372 L 322 392 M388 372 L 366 392" stroke="#b9d27a" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        {/* ears */}
        <path d="M244 478 L 236 404 L 288 446 Z" fill="url(#gh-fur)" />
        <path d="M356 478 L 364 404 L 312 446 Z" fill="url(#gh-fur)" />
        <path d="M251 464 L 246 420 L 278 448 Z" fill="#f6b8a8" />
        <path d="M349 464 L 354 420 L 322 448 Z" fill="#f6b8a8" />
        {/* head */}
        <ellipse cx="300" cy="494" rx="72" ry="60" fill="url(#gh-fur)" />
        <path d="M288 446 q 2 14 0 22 M300 442 q 2 16 0 26 M312 446 q 2 14 0 22" stroke="#c77a35" strokeWidth="5" strokeLinecap="round" fill="none" />
        <ellipse cx="300" cy="522" rx="34" ry="22" fill="#fff3e2" />
        {/* closed, content eyes */}
        <path d="M262 494 q 12 10 24 0 M314 494 q 12 10 24 0" stroke="#3b2618" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        {/* blush */}
        <ellipse cx="256" cy="514" rx="12" ry="7" fill="#f08a7e" opacity="0.45" />
        <ellipse cx="344" cy="514" rx="12" ry="7" fill="#f08a7e" opacity="0.45" />
        {/* nose and mouth */}
        <path d="M293 508 h14 l-7 8 z" fill="#e7837a" />
        <path d="M300 516 q -5 9 -12 4 M300 516 q 5 9 12 4" stroke="#3b2618" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {/* whiskers */}
        <path d="M262 518 l -34 -4 M262 526 l -32 4 M338 518 l 34 -4 M338 526 l 32 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      </g>

      {/* Grass blades in front of the cat */}
      <g stroke="#4f8f43" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M230 712 q 4 -20 -4 -34 M244 714 q 2 -16 10 -26 M356 714 q -2 -18 6 -30 M370 712 q 4 -14 -2 -24" />
        <path d="M40 740 q 4 -22 -4 -36 M150 760 q 2 -18 10 -28 M430 760 q -2 -20 6 -32 M540 742 q 4 -16 -2 -26" />
      </g>

      {DAISIES.map(([x, y, s], i) => (
        <Daisy key={i} x={x} y={y} s={s} />
      ))}

      {/* Soot sprites peeking from the grass */}
      <SootSprite x={128} y={706} r={17} look={2} />
      <SootSprite x={164} y={730} r={11} look={2.5} />
      <SootSprite x={478} y={728} r={13} look={-2} />

      {/* Drifting seeds and sun sparkles */}
      <g fill="#fffbe6">
        {SEEDS.map(([x, y, r, d], i) => (
          <circle key={i} className="seed" cx={x} cy={y} r={r} style={{ animationDelay: `${d}s` }} />
        ))}
      </g>

      {/* Painted paper grain */}
      <rect width="600" height="800" filter="url(#gh-paper)" opacity="0.22" />
    </svg>
  );
}
