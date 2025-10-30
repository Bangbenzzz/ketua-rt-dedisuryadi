// components/common/StatusBar.tsx
'use client';
import React from 'react';

export default function StatusBar({ label, value, total, color = '#3b82f6' }: { label: string; value: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <div className="barWrap">
      <div className="barLab">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="barTrack">
        <div className="barFill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <style jsx>{`
        .barWrap { display: grid; gap: 4px; }
        .barLab { display: flex; justify-content: space-between; align-items: center; color: #e5e7eb; font-size: .85rem; }
        .barTrack { width: 100%; height: 6px; background: rgba(255,255,255,.1); border-radius: 99px; overflow: hidden; }
        .barFill { height: 100%; transition: width .3s; }
      `}</style>
    </div>
  );
}