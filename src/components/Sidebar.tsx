'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const isActive = useCallback(
    (href: string) => {
      if (href === '/dashboard') return pathname === '/' || pathname.startsWith('/dashboard');
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const links = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
          <path d="M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8z" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
    {
      href: '/warga',
      label: 'Data Warga',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
          <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M20 8v6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M17 11h6" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
    {
      href: '/laporan',
      label: 'Laporan',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
          <path d="M3 3h14l4 4v14a1 1 0 0 1-1 1H3V3z" stroke="currentColor" strokeWidth="1.4" />
          <path d="M17 3v4h4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7 13h10M7 9h6M7 17h8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
    {
      href: '/grafik',
      label: 'Grafik',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
          <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7 15l4-4 4 3 5-7" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className={`sbBackdrop ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      {/* Sidebar / Drawer */}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menu utama">
        <div className="sbHeader">
          <div className="brand">
            <span className="logo" aria-hidden>RT</span>
            <span className="brandText">Admin RT</span>
          </div>
          <button className="sbClose" aria-label="Tutup menu" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>

        {/* Kartu menu dengan border + jarak */}
        <div className="menuCard">
          <nav className="nav">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <Link key={l.href} href={l.href} onClick={onClose} className={`item ${active ? 'active' : ''}`}>
                  <span className="icon">{l.icon}</span>
                  <span className="label">{l.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sbFooter">
          <span className="mini">© {new Date().getFullYear()} Kp. Cikadu RT. 06 - Ketua RT - Dedi Suryadi</span>
        </div>
      </aside>

      <style jsx>{`
        :root { --sbw: 248px; }

        .sbBackdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(2px);
          opacity: 0; pointer-events: none;
          transition: opacity .2s ease;
          z-index: 59;
        }
        .sbBackdrop.show { opacity: 1; pointer-events: auto; }

        .sidebar {
          position: fixed; top: 0; left: 0; bottom: 0;
          width: clamp(220px, 72vw, 260px);
          transform: translateX(-100%);
          transition: transform .25s ease;
          z-index: 60;
          padding: 12px;
          border-right: 1px solid rgba(255,255,255,0.12);
          background: rgba(20,22,28,0.75);
          backdrop-filter: blur(16px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.55);
          overflow: auto;
        }
        .sidebar.open { transform: translateX(0); }

        /* Desktop: sidebar selalu tampil, tombol close & backdrop disembunyikan */
        @media (min-width: 900px) {
          .sidebar {
            width: var(--sbw);
            transform: translateX(0) !important;
          }
          .sbBackdrop { display: none !important; }
          .sbClose { display: none; }
        }

        .sbHeader {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
        }
        .brand { display: inline-flex; align-items: center; gap: 10px; }
        .logo {
          width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-weight: 800;
          background: conic-gradient(from 220deg, #6366f1, #22d3ee, #6366f1);
          border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-size: 12px; letter-spacing: .5px;
        }
        .brandText { font-weight: 700; letter-spacing: .2px; font-size: clamp(.9rem, 2.2vw, 1rem); color: #e5e7eb; }
        .sbClose {
          width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: #cbd5e1;
          transition: .15s;
        }
        .sbClose:hover { background: rgba(255,255,255,0.08); }

        .menuCard {
          margin-top: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
          padding: 8px;
        }

        .nav { display: grid; gap: 8px; }
        .item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          color: #e5e7eb;
          background: rgba(255,255,255,0.02);
          transition: .15s;
          font-size: clamp(.86rem, 2.2vw, .95rem);
        }
        .item:hover { background: rgba(255,255,255,0.06); transform: translateX(2px); }
        .item.active {
          border-color: rgba(34,197,94,0.4);
          background: linear-gradient(180deg, rgba(34,197,94,0.12), rgba(34,197,94,0.06));
          box-shadow: 0 10px 28px rgba(34,197,94,0.18) inset, 0 8px 24px rgba(0,0,0,0.35);
        }
        .icon { width: 22px; height: 22px; display: grid; place-items: center; color: #a7f3d0; }
        .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e5e7eb; }

        .sbFooter { margin-top: 10px; padding: 8px; text-align: center; color: #9ca3af; font-size: .8rem; }
        .mini { font-size: clamp(.7rem, 2vw, .8rem); }
      `}</style>
    </>
  );
}