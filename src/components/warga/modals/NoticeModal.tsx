// src/components/warga/modals/NoticeModal.tsx
'use client';
import React, { useEffect } from 'react';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; title?: string; message: string };

export default function NoticeModal({ notice, onClose }: { notice: Notice; onClose: () => void; }) {
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
  const color = colors[notice.type] ?? colors.info;
  
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 10001, background: '#1f2229', color: '#e5e7eb', borderLeft: `4px solid ${color}`, borderRadius: '8px', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,.2)', maxWidth: '340px' }}>
      <strong style={{ color }}>{notice.title ?? 'Notifikasi'}</strong>
      <p style={{ margin: '4px 0 0' }}>{notice.message}</p>
      <button onClick={onClose} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
    </div>
  );
}