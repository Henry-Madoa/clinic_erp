'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { INLINE_CARD_SLOT_ID } from './inline-card-slot';

export interface ModalProps {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Open cards, oldest first — Escape closes only the newest, as a stack would. */
const openCards: string[] = [];

/**
 * A form card opened in the page, not over it — creating and editing happen on an inline card
 * at the top of the content well (the slot <Page> renders), the way records are edited on
 * their own cards, rather than in a dialog that hides the screen behind a backdrop.
 *
 * The name and props are kept so every caller (FormModal, ModalFormButton, the bespoke
 * forms) moved with it. Several can be open at once — a picker opened from a form stacks on
 * top of it. The newest scrolls into view with its first control focused, so a cashier can
 * type straight away; Escape, × or the form's own Cancel close it.
 */
export function Modal({ title, wide, onClose, children, footer }: ModalProps) {
  const id = useId();
  const cardRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // A card only opens in the browser (on a click), where the page's slot already exists.
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById(INLINE_CARD_SLOT_ID) ?? document.body);

  useEffect(() => {
    openCards.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openCards[openCards.length - 1] === id) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = openCards.indexOf(id);
      if (at >= 0) openCards.splice(at, 1);
    };
  }, [id, onClose]);

  useEffect(() => {
    if (!host) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    bodyRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus({ preventScroll: true });
  }, [host]);

  if (!host) return null;

  return createPortal(
    <section ref={cardRef} className={`card inline-card${wide ? ' wide' : ''}${host === document.body ? ' detached' : ''}`}
      role="region" aria-label={title}>
      <div className="inline-card-head">
        <h3>{title}</h3>
        <button type="button" className="x" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="inline-card-body" ref={bodyRef}>{children}</div>
      {footer ? <div className="inline-card-foot">{footer}</div> : null}
    </section>,
    host,
  );
}
