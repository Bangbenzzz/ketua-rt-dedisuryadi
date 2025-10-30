// components/common/Pagination.tsx
'use client';
import React from 'react';

export default function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; }) {
  return (
    <div className="pag">
      <div className="pagInfo">Hal {page} dari {totalPages} ({total} item)</div>
      <div className="pagBtns">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1}>«</button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}>»</button>
      </div>
      <style jsx>{`
        .pag { display: flex; align-items: center; justify-content: space-between; padding: 10px 6px 0; }
        .pagInfo { color: #9ca3af; font-size: .9rem; }
        .pagBtns { display: flex; gap: 6px; }
        .pagBtns button { width: 32px; height: 32px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: #e5e7eb; border-radius: 8px; }
        .pagBtns button:disabled { opacity: .4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}