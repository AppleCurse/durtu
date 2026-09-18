'use client';
// DÜRTÜ — paylaşılan modal kabuğu.
//
// 13 bileşen aynı overlay kalıbını elle tekrarlıyordu ve hiçbirinde:
//   • Escape ile kapatma,
//   • focus trap (Tab modalın dışına kaçıyordu),
//   • açılışta odak yönetimi / kapanışta odağı iade,
//   • role="dialog" + aria-modal + aria-labelledby,
//   • arka plan scroll kilidi
// yoktu. Klavye kullanıcısı ve ekran okuyucu için modallar pratikte erişilemezdi.
// Tek yerde çözülünce tüm oyunlar birden erişilebilir hale gelir.

import { useCallback, useEffect, useId, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Sayfa genelinde kaç modal açık — iç içe açılışta scroll kilidini bozmamak için. */
let openCount = 0;

export default function Modal({
  onClose,
  title,
  children,
  className = 'sheet',
  zIndex = 75,
  labelledBy,
  initialFocus,
  closeLabel = 'Kapat',
  showClose = true,
  style,
}) {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const autoId = useId();
  const titleId = labelledBy || (title ? `modal-title-${autoId}` : undefined);

  const close = useCallback(() => { onClose?.(); }, [onClose]);

  // Açılışta odağı modala al, kapanışta tetikleyen öğeye iade et.
  useEffect(() => {
    restoreRef.current = document.activeElement;

    const target =
      (initialFocus?.current) ||
      panelRef.current?.querySelector('[data-autofocus]') ||
      panelRef.current?.querySelector(FOCUSABLE) ||
      panelRef.current;

    // Layout oturduktan sonra odaklan (canvas/animasyon içeren modallar için).
    const raf = requestAnimationFrame(() => {
      try { target?.focus({ preventScroll: true }); } catch { /* odak kritik değil */ }
    });

    return () => {
      cancelAnimationFrame(raf);
      const prev = restoreRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus({ preventScroll: true }); } catch { /* öğe DOM'dan gitmiş olabilir */ }
      }
    };
  }, [initialFocus]);

  // Arka plan scroll kilidi (iç içe modal sayacıyla).
  useEffect(() => {
    openCount++;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Escape ile kapat + Tab'ı modal içinde döngüle (focus trap).
  useEffect(() => {
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || [])
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [close]);

  return (
    <div
      className="ovl"
      ref={overlayRef}
      style={{ zIndex, ...style }}
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className={className}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {showClose && (
          <button className="close" onClick={close} aria-label={closeLabel} type="button">
            ✕
          </button>
        )}
        {title && (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
