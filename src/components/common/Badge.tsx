// components/common/Badge.tsx
'use client';
import React from 'react';

export default function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'blue' | 'slate' | 'violet' }) {
  const map: Record<string, string> = {
    green: 'rgba(34,197,94,.18)', amber: 'rgba(245,158,11,.22)', blue: 'rgba(59,130,246,.20)', slate: 'rgba(148,163,184,.22)', violet: 'rgba(139,92,246,.22)',
  };
  const bg = map[tone] ?? map.slate;
  return (<span style={{ background: bg, color: '#e5e7eb', padding: '4px 8px', borderRadius: 999, fontSize: '.85rem', border: '1px solid rgba(255,255,255,.12)' }}>{children}</span>);
}