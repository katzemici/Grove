// Liquid interaction layer.
//  - installLiquidPress(): one delegated pointerdown listener that spawns a morphing
//    "drop" inside any pressable element and gives it a short jelly squish.
//  - flip(): FLIP reflow animation so items glide (with a little overshoot) when
//    their layout position changes, e.g. Kanban cards making room for a drag.
// Everything is skipped when the user prefers reduced motion.

const PRESSABLE = [
  '.btn',
  '.chip',
  '.project-tab',
  '.side-link',
  '.lq-tabs button',
  '.day-dot',
  '.cal-cell',
  '.matrix-cell',
  '.lq-check',
  '.status-select',
  '.menu-item',
  '.reward',
  '.icon-pick',
  '.swatch',
  '.acct-body',
  '.bank-row',
  '.bank-add',
  '.kind-pick',
  '.liquid',
].join(',');

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function installLiquidPress(root: Document = document): () => void {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || prefersReducedMotion()) return;
    const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
    if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;

    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const drop = document.createElement('span');
    drop.className = 'liquid-drop';
    drop.style.width = drop.style.height = size + 'px';
    drop.style.left = e.clientX - rect.left - size / 2 + 'px';
    drop.style.top = e.clientY - rect.top - size / 2 + 'px';
    el.appendChild(drop);
    drop.addEventListener('animationend', () => drop.remove(), { once: true });

    el.classList.remove('liquid-squish');
    // Force reflow so the squish animation restarts on rapid presses.
    void el.offsetWidth;
    el.classList.add('liquid-squish');
  };
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName === 'liquid-squish') (e.target as HTMLElement).classList.remove('liquid-squish');
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('animationend', onEnd as EventListener);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('animationend', onEnd as EventListener);
  };
}

export type RectMap = Map<string, { x: number; y: number }>;

/** Layout position of `el` relative to `container`, ignoring CSS transforms (so running animations don't skew it). */
function layoutPos(el: HTMLElement, container: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** Record the layout position of every [data-flip-id] element inside `container`. */
export function measure(container: HTMLElement | null): RectMap {
  const map: RectMap = new Map();
  if (!container) return map;
  container.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
    map.set(el.dataset.flipId!, layoutPos(el, container));
  });
  return map;
}

/**
 * Animate [data-flip-id] elements from their `previous` positions to where they are now.
 * Returns the new positions so the caller can keep them for the next frame.
 */
export function flip(container: HTMLElement | null, previous: RectMap): RectMap {
  const now = measure(container);
  if (!container || prefersReducedMotion()) return now;
  container.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
    const before = previous.get(el.dataset.flipId!);
    const after = now.get(el.dataset.flipId!);
    if (!before || !after) return;
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 380,
      easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)',
    });
  });
  return now;
}
