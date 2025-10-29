// File: src/app/dashboard/layout.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import AuthInitGate from '@/components/AuthInitGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sbOpen, setSbOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const closeLogoutConfirm = () => { if (!loggingOut) setShowLogoutConfirm(false); };
  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try { await signOut(auth); router.replace('/login'); }
    catch (e) { console.error(e); alert('Gagal logout. Coba lagi.'); }
    finally { setLoggingOut(false); setShowLogoutConfirm(false); }
  };

  return (
    <AuthInitGate>
      <div className="shell">
        <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} />
        <div className="bgDecor" aria-hidden />

        <header className="topbar">
          <button className="btn btn--icon hamburger" aria-label="Buka menu" onClick={() => setSbOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
          <div className="brand">
            <span className="dot" aria-hidden />
            Dedi Suryadi
          </div>
          <button className="btn btn--delete" onClick={() => setShowLogoutConfirm(true)}>Keluar</button>
        </header>

        {/* Kode dari page.tsx Anda akan dirender di sini */}
        <main className="content">{children}</main>

        {showLogoutConfirm && (
          <div className="modalBackdrop" onClick={(e) => { if (e.currentTarget === e.target) closeLogoutConfirm(); }}>
            <div className="modal" role="dialog" aria-modal="true">
              <div className="modalHeader">
                <div className="warnIcon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="1" fill="currentColor" />
                    <path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </svg>
                </div>
                <h3 className="modalTitle">Keluar dari akun?</h3>
              </div>
              <p className="modalDesc">Anda yakin ingin keluar? Anda akan kembali ke halaman login.</p>
              <div className="modalActions">
                <button className="btn btn--ghost" onClick={closeLogoutConfirm} disabled={loggingOut}>Batal</button>
                <button className="btn btn--delete" onClick={handleConfirmLogout} disabled={loggingOut}>
                  {loggingOut ? 'Keluar…' : 'Keluar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .shell {
          --sbw: 248px;
          min-height: 100svh;
          color: #e5e7eb;
          padding: clamp(8px, 3vw, 24px);
          padding-top: calc(clamp(8px, 3vw, 24px) + 64px);
          overflow-x: hidden;
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(99,102,241,0.15), transparent 40%),
            radial-gradient(900px circle at 90% 110%, rgba(236,72,153,0.12), transparent 40%),
            linear-gradient(180deg, #0b0f17, #0a0d14 60%, #080b11);
        }
        @media (min-width: 900px) {
          .shell { padding-left: calc(clamp(8px, 3vw, 24px) + var(--sbw)); }
        }

        .bgDecor {
          position: fixed; inset: -40% -10% -10% -10%;
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 18px 18px; pointer-events: none;
        }

        .topbar {
          width: min(100% - clamp(16px, 6vw, 48px), 1040px);
          position: fixed; top: 0; left: 50%; transform: translateX(-50%);
          z-index: 40;
          
          /* --- PERBAIKAN HEADER ADA DI SINI --- */
          padding-top: calc(clamp(6px, 1.8vw, 10px) + env(safe-area-inset-top));
          padding-bottom: clamp(6px, 1.8vw, 10px);
          padding-left: clamp(8px, 2vw, 12px);
          padding-right: clamp(8px, 2vw, 12px);
          /* --- AKHIR PERBAIKAN --- */
          
          display: flex; align-items: center; justify-content: space-between; gap: clamp(6px, 2vw, 8px);
          flex-wrap: wrap; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
          background: rgba(20,22,28,0.6); backdrop-filter: blur(10px);
        }
        @media (min-width: 900px) {
          .topbar {
            left: calc(var(--sbw) + clamp(8px, 3vw, 24px));
            right: clamp(8px, 3vw, 24px);
            transform: none; width: auto; max-width: none;
          }
        }

        /* ... Sisa CSS Anda tidak berubah ... */
        .brand { font-weight: 600; letter-spacing: .2px; display: inline-flex; align-items: center; gap: 8px; font-size: clamp(.9rem, 2.6vw, 1rem); flex: 1; }
        .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; background: #22c55e; margin-right: 8px; animation: dotCycle 2.4s steps(1, end) infinite; }
        @keyframes dotCycle {
          0% { background: #22c55e; } 20% { background: #ef4444; } 40% { background: rgb(2, 255, 133); } 60% { background: #3b82f6; } 80% { background: #f59e0b; } 100% { background: #22c55e; }
        }
        @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
        .hamburger { display: inline-flex; }
        @media (min-width: 900px) { .hamburger { display: none; } }
        .content { position: relative; z-index: 0; }
        .btn {
          padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 500;
          border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #e5e7eb;
          transition: background .15s;
        }
        .btn:not(:disabled):hover { background: rgba(255,255,255,0.1); }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn--icon { padding: 8px; display: grid; place-items: center; }
        .btn--delete { background: #ef4444; border: none; color: #fff; font-weight: 600; }
        .btn--delete:hover { background: #dc2626; }
        .btn--ghost { background: transparent; border: none; color: #cbd5e1; }
        .btn--ghost:hover { background: rgba(255,255,255,0.1); }
        .modalBackdrop {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
          display: grid; place-items: center; padding: 16px; animation: fadeIn .15s ease;
        }
        .modal {
          width: 100%; max-width: 420px; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
          background: #0d1017; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          padding: 20px; animation: zoomIn .15s ease-out;
        }
        .modalHeader { display: flex; align-items: center; gap: 10px; }
        .modalTitle { margin: 0; font-size: 1.1rem; }
        .warnIcon { color: #f59e0b; }
        .modalDesc { margin: 12px 0 0; color: #cbd5e1; font-size: .95rem; }
        .modalActions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </AuthInitGate>
  );
}