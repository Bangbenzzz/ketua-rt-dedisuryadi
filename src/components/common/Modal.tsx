// src/components/common/Modal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({
  children, onClose, title = 'Modal', width = 800, // Ukuran default diperkecil
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  width?: number;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true); // Tandai bahwa komponen sudah di-mount di client
    
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const modalContent = (
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
          position: fixed;
          inset: 0;
          z-index: 10000; /* Tetap pakai z-index tinggi */
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.2s ease-out;
        }
        .modal {
          width: 100%;
          background: #1f2229;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          max-height: 90vh;
          animation: zoomIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .modalHead {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }
        .modalHead h2 { margin: 0; font-size: 1.2rem; }
        .closeBtn {
          background: transparent; border: none; color: #9ca3af;
          font-size: 1.8rem; line-height: 1; padding: 0;
          width: 32px; height: 32px; cursor: pointer; transition: color 0.2s;
        }
        .closeBtn:hover { color: white; }
        .modalBody {
          padding: 20px;
          overflow-y: auto;
        }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );

  // Jika belum di-mount di client, jangan render apa-apa (mencegah error SSR)
  if (!isMounted) {
    return null;
  }

  // Gunakan Portal untuk merender modal langsung ke body
  return createPortal(modalContent, document.body);
}