// Brand mark: long-eared cat peeking up from the bottom edge, drawn on the 24px grid.
// Stroke color comes from the palette in styles.css (cream on the leaf→sage tile).

export default function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--cream)"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.9 22.3C3.9 12 5 1.6 7.2 1.6S9.9 9 9.9 15.3M14.1 15.3C14.1 9 15 1.6 16.8 1.6S20.1 12 20.1 22.3" />
      <path d="M4.4 18.2 7.3 12.8 9.2 16.4Q12 14.6 14.8 16.4L16.7 12.8 19.6 18.2" />
      <circle cx="9.1" cy="20.5" r="1.25" fill="var(--cream)" stroke="none" />
      <circle cx="14.9" cy="20.5" r="1.25" fill="var(--cream)" stroke="none" />
    </svg>
  );
}
