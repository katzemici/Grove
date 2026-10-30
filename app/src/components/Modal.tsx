import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

// Open dialogs, newest last. Only the topmost one reacts to Escape.
const stack: symbol[] = [];

/**
 * Dialog rendered in a portal on <body>, so no page section (blur, transforms,
 * entrance animations, overflow) can trap it or paint over it.
 */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useRef(Symbol('modal'));
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = id.current;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Keep focus inside the dialog unless a field already autofocused.
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={box}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-secondary" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
