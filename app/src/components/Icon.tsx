// Minimal stroke icon set (24px grid, 1.75 stroke). Replaces emoji usage so
// icons inherit `currentColor` and render consistently across platforms.

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  wallet:
    'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zm13 7h.01',
  sprout: 'M12 21v-9m0 0C12 7 8.5 4 4 4c0 4.5 3.5 8 8 8zm0 0c0-4 3-7 8-7 0 4-3 7-8 7z',
  board: 'M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v7h-3z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 12.5 10 17l9-10',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4m8-4v4',
  flame: 'M12 21c-4 0-7-2.8-7-6.5 0-3 2-5 3.5-6.5.3 2 1.5 3 2.5 3 0-3 1-6 4-8 0 3 4 5.5 4 11 0 4-3 7-7 7z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4m-4 2v4m-4 3h8',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  arrowRight: 'M5 12h14m-5-5 5 5-5 5',
  leaf: 'M5 19C5 10 11 5 20 4c0 9-5 15-14 15zm0 0 7-7',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  plus: 'M12 5v14M5 12h14',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  more: 'M4.5 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M10.75 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M17 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm9 16-4.2-4.2',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.9L4 8m0-4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4',
  panel: 'M4 5h16v14H4zM9.5 5v14',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  trendUp: 'M4 16l5-5 4 4 7-7m0 0h-5m5 0v5',
  trendDown: 'M4 8l5 5 4-4 7 7m0 0h-5m5 0v-5',
  droplet: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  book: 'M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zm16 0a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dumbbell: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  medal: 'M8 3h8l-2 6h-4zM12 21a5.5 5.5 0 1 0 0-11a5.5 5.5 0 0 0 0 11zm0-7.5v4',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  send: 'M21 3 3 10.5l7 3 3 7zM21 3l-11 10.5',
  filter: 'M4 5h16l-6 7.5V19l-4 2v-8.5z',
  sort: 'M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  utensils: 'M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-4 4-4 7.5V13h4',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  bus: 'M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11zM5 11h14M8 17v3m8-3v3M8.5 14h.01M15.5 14h.01',
  bag: 'M5 8h14l-1.2 12H6.2zM9 8V6a3 3 0 0 1 6 0v2',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-4-6-4-6-1.5S10 7 12 7zm0 0c1.5-4 6-4 6-1.5S14 7 12 7z',
  plane: 'M10.5 13 3 10l1.5-1.5 7.5 1L16.5 5a2 2 0 0 1 3 3L15 12.5l1 7.5-1.5 1.5-3-7.5L8 17v3l-1.5 1L5 18l-3-1.5L3 15h3z',
  piggy: 'M19 10c-.5-3-3.5-5-7.5-5C7 5 4 7.7 4 11c0 1.8.9 3.4 2.4 4.5L6 19h3l.7-1.6c.6.1 1.2.1 1.8.1s1.2 0 1.8-.1L14 19h3l-.4-3.2c1-.7 1.7-1.6 2.1-2.8H21v-3zM15.5 9.5h.01M10 5.5V3',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5zM6 10v.01M18 14v.01',
  phone: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v6m-3-3h6',
  file: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 0v5h5M9 13h6M9 17h4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
  rain: 'M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 4.25 4.25 0 0 1 17.5 15M8 18l-1 2.5M12 17l-1 3.5M16 18l-1 2.5',
  eyeOff:
    'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.6 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
