'use client';
// DÜRTÜ — tur kilidi.
// useState asenkrondur; "if (spinning) return; setSpinning(true)" kalıbı çift tıklamada
// iki kez spend() çağrılmasına izin veriyordu. Kilit senkron ref ile tutulur,
// görsel durum ayrı state ile taşınır.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useRoundLock() {
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Kilidi senkron olarak alır. Zaten kilitliyse false döner. */
  const acquire = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    if (mounted.current) setBusy(true);
    return true;
  }, []);

  /** Kilidi bırakır. Unmount sonrası setState çağırmaz. */
  const release = useCallback(() => {
    locked.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  const isLocked = useCallback(() => locked.current, []);

  return { busy, acquire, release, isLocked };
}
