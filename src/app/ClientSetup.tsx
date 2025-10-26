'use client';
import { useEffect } from 'react';
import { installConsoleFilter } from '@/lib/consoleFilter';

export default function ClientSetup({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      installConsoleFilter();
    }
  }, []);
  return <>{children}</>;
}