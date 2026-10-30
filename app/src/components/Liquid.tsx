import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * Segmented tabs with a "liquid" indicator: the leading edge moves first and the
 * trailing edge follows, so the pill stretches toward its target and then settles.
 */
export function LiquidTabs<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const prevLeft = useRef<number | null>(null);
  const [box, setBox] = useState<{ left: number; right: number; dir: 'l' | 'r' } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => {
      const btn = el.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!btn) return;
      const left = btn.offsetLeft;
      const right = el.clientWidth - (btn.offsetLeft + btn.offsetWidth);
      const dir = prevLeft.current !== null && left < prevLeft.current ? 'l' : 'r';
      prevLeft.current = left;
      setBox({ left, right, dir });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div className={'lq-tabs ' + size} role="tablist" aria-label={label} ref={wrap}>
      {box && (
        <span
          className={'lq-indicator dir-' + box.dir}
          style={{ left: box.left, right: box.right }}
          aria-hidden
        />
      )}
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Checkbox whose fill rises like liquid, with a rolling wave on top. */
export function LiquidCheck({
  checked,
  onChange,
  label,
  shape = 'square',
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  shape?: 'square' | 'round';
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={'lq-check ' + shape + (checked ? ' on' : '')}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <span className="lq-fill" aria-hidden />
      <span className="lq-tick" aria-hidden>
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
}

/**
 * Small popover menu behind a "more" button.
 * The popover renders in a portal on <body> with fixed positioning, so cards with
 * their own stacking context (blur, transforms, animations) or overflow clipping
 * can never paint over it. It flips above the trigger when there is no room below,
 * follows the trigger on scroll/resize, and supports arrow-key navigation.
 */
export function Menu({
  items,
  label,
  trigger,
  align = 'right',
}: {
  items: MenuItem[];
  label: string;
  /** Visible trigger content. Without it, a round "more" icon button is used. */
  trigger?: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) btn.current?.focus();
  };

  // Place the popover next to the trigger, inside the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      const m = pop.current;
      if (!b || !m) return;
      const gap = 6;
      const w = m.offsetWidth;
      const h = m.offsetHeight;
      const up = b.bottom + gap + h > window.innerHeight - 8 && b.top - gap - h > 8;
      let left = align === 'right' ? b.right - w : b.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      const top = up ? b.top - gap - h : b.bottom + gap;
      setPos({ top, left, up });
    };
    place();
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrap.current?.contains(target) && !pop.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey, true);
    // Move focus into the menu for keyboard users.
    const first = pop.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End' && e.key !== 'Tab') return;
    const list = Array.from(pop.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? []);
    if (!list.length) return;
    if (e.key === 'Tab') {
      close();
      return;
    }
    e.preventDefault();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next].focus();
  }

  return (
    <div className="menu" ref={wrap} onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        className={trigger ? 'btn btn-outline btn-sm' : 'btn btn-icon sm ghost-icon'}
        aria-label={trigger ? undefined : label}
        title={trigger ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
      >
        {trigger ?? <Icon name="more" size={16} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={'menu-pop portal ' + align + (pos?.up ? ' up' : '')}
            role="menu"
            aria-label={label}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={it.checked}
                className={'menu-item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : '')}
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  it.onSelect();
                }}
              >
                {it.checked !== undefined && (
                  <span className="menu-check" aria-hidden>
                    {it.checked && <Icon name="check" size={13} />}
                  </span>
                )}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
