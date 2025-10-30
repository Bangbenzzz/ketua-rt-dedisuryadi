'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { FullscreenSpinner } from '@/components/Spinner';

export default function AuthInitGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => setReady(true));
    return () => unsub();
  }, []);

  if (!ready) return <FullscreenSpinner label="Memuat..." />;
  return <>{children}</>;
}