// Register hero: the same Ghibli palette as the login scene, but the cat has
// put on a suit, a coral tie and sunglasses, and means business. A seaside
// town with red roofs sits on the far hill. Pure SVG; ids use a `gs-` prefix
// so both scenes can live on the page at once.

import { Daisy, SootSprite } from './GhibliCatScene';

const DAISIES: [number, number, number][] = [
  [48, 724, 1], [104, 770, 0.85], [176, 742, 0.8], [420, 748, 0.9], [470, 716, 0.75],
  [526, 766, 1.05], [578, 730, 0.85], [30, 784, 1.15], [360, 786, 0.95], [248, 780, 1.1],
];

const HOUSES: [number, number, number, number][] = [
  // x, base y, width, height
  [44, 534, 34, 30], [84, 526, 28, 36], [120, 530, 38, 28], [164, 522, 30, 38], [200, 530, 32, 26],
];

export default function GhibliSuitCatScene({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustration: a cool ginger cat in a suit, coral tie and sunglasses waves hello while holding a briefcase"
    >
      <defs>
        <linearGradient id="gs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86c0e6" />
          <stop offset="0.5" stopColor="#c3e1f0" />
          <stop offset="0.72" stopColor="#fbe9c8" />
        </linearGradient>
        <radialGradient id="gs-sun" cx="0.85" cy="0.1" r="0.55">
          <stop offset="0" stopColor="#fff6d2" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff6d2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gs-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7dd8f" />
          <stop offset="0.5" stopColor="#8cc46c" />
          <stop offset="1" stopColor="#5d9c4e" />
        </linearGradient>
        <linearGradient id="gs-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#fbf7f0" />
          <stop offset="1" stopColor="#ecdccb" />
        </linearGradient>
        <linearGradient id="gs-fur" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2b56c" />
          <stop offset="1" stopColor="#d98c43" />
        </linearGradient>
        <linearGradient id="gs-suit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6f9e" />
          <stop offset="1" stopColor="#47598a" />
        </linearGradient>
        <filter id="gs-fuzz" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="7" />
        </filter>
        <filter id="gs-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="3" />
          <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0.5 0" />
        </filter>
        <filter id="gs-soft">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Golden-afternoon sky */}
      <rect width="600" height="800" fill="url(#gs-sky)" />
      <rect width="600" height="800" fill="url(#gs-sun)" />

      <g fill="url(#gs-cloud)">
        <g className="cloud cloud-a">
          <circle cx="120" cy="190" r="62" />
          <circle cx="196" cy="150" r="80" />
          <circle cx="278" cy="184" r="64" />
          <circle cx="226" cy="90" r="52" />
          <ellipse cx="200" cy="238" rx="140" ry="20" fill="#f3e9dd" />
        </g>
        <g className="cloud cloud-b" opacity="0.9">
          <circle cx="470" cy="250" r="38" />
          <circle cx="516" cy="232" r="48" />
          <circle cx="566" cy="256" r="38" />
          <ellipse cx="518" cy="282" rx="80" ry="12" fill="#f3e9dd" />
        </g>
      </g>

      {/* Far hill with a little red-roofed seaside town */}
      <path d="M0 548 Q 120 486 260 520 T 600 512 V 800 H 0 Z" fill="#9cc7a8" />
      <g>
        {HOUSES.map(([x, y, w, h], i) => (
          <g key={i}>
            <rect x={x} y={y - h} width={w} height={h} fill="#f6eddc" />
            <path d={`M${x - 3} ${y - h} L ${x + w / 2} ${y - h - w * 0.55} L ${x + w + 3} ${y - h} Z`} fill={i % 2 ? '#d9725a' : '#e8876c'} />
            <rect x={x + w / 2 - 4} y={y - h + 8} width="8" height="9" fill="#86c0e6" />
          </g>
        ))}
        {/* clock tower */}
        <rect x="236" y="460" width="20" height="66" fill="#f6eddc" />
        <path d="M232 460 L 246 432 L 260 460 Z" fill="#5f8fb0" />
        <circle cx="246" cy="474" r="6" fill="#fff" stroke="#c8b89b" strokeWidth="1.5" />
      </g>

      {/* Near hill */}
      <path d="M0 662 Q 160 612 300 630 T 600 622 V 800 H 0 Z" fill="url(#gs-hill)" />
      <ellipse cx="300" cy="714" rx="116" ry="14" fill="#3f6f35" opacity="0.28" filter="url(#gs-soft)" />

      {/* The cat, dressed for the quarterly meeting */}
      <g className="gh-cat">
        {/* tail */}
        <path d="M352 630 C 410 630 430 580 412 548 C 402 532 386 540 394 552" fill="none" stroke="url(#gs-fur)" strokeWidth="18" strokeLinecap="round" />

        {/* trousers and shoes */}
        <rect x="266" y="628" width="30" height="78" rx="8" fill="#43547f" />
        <rect x="304" y="628" width="30" height="78" rx="8" fill="#43547f" />
        <path d="M281 640 v58 M319 640 v58" stroke="#5b6f9e" strokeWidth="2" />
        <ellipse cx="276" cy="709" rx="24" ry="9" fill="#2b2a33" />
        <ellipse cx="324" cy="709" rx="24" ry="9" fill="#2b2a33" />
        <path d="M262 705 q 8 -4 16 -2 M310 705 q 8 -4 16 -2" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />

        {/* jacket */}
        <path d="M240 520 Q 300 498 360 520 L 372 650 Q 300 668 228 650 Z" fill="url(#gs-suit)" />
        <path d="M276 512 L 300 602 L 324 512 Z" fill="#fffaf0" />
        <path d="M276 512 L 254 544 L 282 568 L 300 602 Z" fill="#3d4e7a" />
        <path d="M324 512 L 346 544 L 318 568 L 300 602 Z" fill="#3d4e7a" />
        <circle cx="300" cy="620" r="4" fill="#2f3c63" />
        <circle cx="300" cy="638" r="4" fill="#2f3c63" />
        {/* pocket square */}
        <path d="M326 572 h26" stroke="#2f3c63" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M330 572 l 5 -10 l 4 6 l 5 -8 l 4 12 Z" fill="#f6b8c8" />

        {/* left arm down, holding the briefcase */}
        <path d="M246 526 Q 222 580 224 640 L 246 642 Q 250 592 264 548 Z" fill="#52669a" stroke="#3d4e7a" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="222" y="636" width="26" height="9" rx="3" fill="#fffaf0" />
        <rect x="194" y="660" width="78" height="50" rx="7" fill="#b07a48" />
        <path d="M194 678 h78" stroke="#8d5d33" strokeWidth="2" />
        <rect x="226" y="672" width="14" height="10" rx="2" fill="#f7c948" />
        <path d="M222 660 q 11 -14 22 0" stroke="#7a4f2a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="235" cy="652" r="12" fill="url(#gs-fur)" />

        {/* coral tie */}
        <path d="M292 514 L 308 514 L 305 528 L 295 528 Z" fill="#e8746a" />
        <path d="M295 528 L 305 528 L 312 588 L 300 602 L 288 588 Z" fill="#f08a7e" />
        <path d="M292 548 l 16 -8 M290 566 l 20 -10 M290 584 l 20 -10" stroke="#ffd3c9" strokeWidth="3" strokeLinecap="round" />

        {/* right arm up: a casual "hey" */}
        <path d="M352 524 Q 386 502 398 466 L 416 476 Q 400 518 366 548 Z" fill="#52669a" stroke="#3d4e7a" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="396" y="462" width="24" height="9" rx="3" fill="#fffaf0" transform="rotate(26 408 466)" />
        <circle cx="410" cy="450" r="15" fill="url(#gs-fur)" />
        <g fill="#f6b8a8">
          <ellipse cx="410" cy="454" rx="5" ry="4" />
          <circle cx="403" cy="445" r="2.4" />
          <circle cx="410" cy="442" r="2.4" />
          <circle cx="417" cy="445" r="2.4" />
        </g>

        {/* ears */}
        <path d="M244 428 L 236 354 L 288 396 Z" fill="url(#gs-fur)" />
        <path d="M356 428 L 364 354 L 312 396 Z" fill="url(#gs-fur)" />
        <path d="M251 414 L 246 370 L 278 398 Z" fill="#f6b8a8" />
        <path d="M349 414 L 354 370 L 322 398 Z" fill="#f6b8a8" />

        {/* head */}
        <ellipse cx="300" cy="444" rx="72" ry="60" fill="url(#gs-fur)" />
        <path d="M288 396 q 2 14 0 22 M300 392 q 2 16 0 26 M312 396 q 2 14 0 22" stroke="#c77a35" strokeWidth="5" strokeLinecap="round" fill="none" />
        <ellipse cx="300" cy="474" rx="34" ry="22" fill="#fff3e2" />

        {/* sunglasses and one very confident eyebrow */}
        <path d="M232 432 L 254 434 M346 434 L 368 432" stroke="#23232d" strokeWidth="3" strokeLinecap="round" />
        <rect x="252" y="424" width="42" height="26" rx="11" fill="#23232d" />
        <rect x="306" y="424" width="42" height="26" rx="11" fill="#23232d" />
        <path d="M294 432 q 6 -5 12 0" stroke="#23232d" strokeWidth="3.5" fill="none" />
        <path d="M262 444 l 12 -14 M316 444 l 12 -14" stroke="#9ccbea" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
        <path d="M312 410 q 16 -10 32 -2" stroke="#8a5428" strokeWidth="4" strokeLinecap="round" fill="none" />

        {/* blush, nose, smirk, whiskers */}
        <ellipse cx="256" cy="466" rx="11" ry="6" fill="#f08a7e" opacity="0.45" />
        <ellipse cx="344" cy="466" rx="11" ry="6" fill="#f08a7e" opacity="0.45" />
        <path d="M293 460 h14 l-7 8 z" fill="#e7837a" />
        <path d="M300 468 q -5 7 -11 4 M300 468 q 9 7 17 -3" stroke="#3b2618" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M262 470 l -34 -4 M262 478 l -32 4 M338 470 l 34 -4 M338 478 l 32 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      </g>

      {/* Speech bubble */}
      <g className="gs-bubble">
        <rect x="420" y="360" width="150" height="46" rx="23" fill="#fffaf0" opacity="0.96" />
        <path d="M440 404 L 428 424 L 458 404 Z" fill="#fffaf0" opacity="0.96" />
        <text x="495" y="390" textAnchor="middle" fontFamily="Fredoka Variable, Fredoka, Nunito, sans-serif" fontSize="18" fontWeight="500" fill="#3f4a2c">
          Purrfessional.
        </text>
      </g>

      {/* Grass in front */}
      <g stroke="#5d9c4e" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M250 716 q 4 -18 -4 -30 M352 716 q -2 -16 6 -28 M40 744 q 4 -22 -4 -36 M460 760 q -2 -20 6 -32 M560 746 q 4 -16 -2 -26" />
      </g>

      {DAISIES.map(([x, y, s], i) => (
        <Daisy key={i} x={x} y={y} s={s} />
      ))}

      {/* A soot sprite who also got the memo about ties */}
      <SootSprite x={128} y={712} r={17} look={2} filter="gs-fuzz" />
      <path d="M124 727 h8 l -2 4 l 3 9 l -5 5 l -5 -5 l 3 -9 Z" fill="#e8746a" />
      <SootSprite x={492} y={732} r={12} look={-2} filter="gs-fuzz" />

      <rect width="600" height="800" filter="url(#gs-paper)" opacity="0.22" />
    </svg>
  );
}
