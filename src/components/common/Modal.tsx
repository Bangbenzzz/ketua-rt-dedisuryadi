'use client';

import React, { useEffect } from 'react';

export default function Modal({
  children,
  onClose,
  title = 'Modal',
  width = 540,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  width?: number;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);

    const prevOverflow = document.body.style.overflow;
    const prevTouch = (document.body.style as any).touchAction as string | undefined;
    document.body.style.overflow = 'hidden';
    (document.body.style as any).touchAction = 'none';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = prevOverflow;
      (document.body.style as any).touchAction = prevTouch ?? '';
    };
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: width }}>
        <header className="modalHead">
          <h2>{title}</h2>
          <button className="closeBtn" onClick={onClose} title="Tutup">×</button>
        </header>
        <div className="modalBody">{children}</div>
      </div>

      <style jsx>{`
        .scrim {
          position: fixed; inset: 0;
          z-index: 20000;
          background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 16px;
          padding-top: calc(16px + var(--app-header-h, 64px) + env(safe-area-inset-top));
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
          animation: fadeIn .15s ease-out;
          overscroll-behavior: contain;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal {
          width: 100%;
          background: #1f2229; color: #e5e7eb;
          border-radius: 16px; border: 1px solid rgba(255,255,255,.12);
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,.2);
          animation: zoomIn .15s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .modalHead {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,.12);
        }
        .modalHead h2 { margin: 0; font-size: 1.1rem; }
        .closeBtn {
          background: transparent; border: none; color: #9ca3af;
          font-size: 1.6rem; line-height: 1; width: 32px; height: 32px;
          cursor: pointer;
        }
        .closeBtn:hover { color: #fff; }

        .modalBody {
          padding: 16px;
          max-height: calc(100vh - var(--app-header-h, 64px) - 120px);
          overflow: auto;
        }
      `}</style>
    </div>
  );
}