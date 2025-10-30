// src/components/warga/PasswordGate.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { LockIcon } from '../common/Icons'; // Pastikan path ini benar

export default function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch('/api/warga-auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        onSuccess();
      } else {
        setErr(data?.message || 'Password salah.');
      }
    } catch {
      setErr('Gagal memverifikasi. Periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kunci halaman daftar warga"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,.7)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#1f2229',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 16,
          padding: 24,
          display: 'grid',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(34,197,94,.15)',
              color: '#86efac',
              border: '1px solid rgba(34,197,94,.3)',
            }}
          >
            <LockIcon />
          </div>
        </div>

        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Akses Terkunci</h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
          Halaman ini memerlukan password untuk melanjutkan.
        </p>

        {/* BAGIAN FORM YANG HILANG ADA DI SINI */}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, textAlign: 'left', marginTop: 8 }}>
          <label htmlFor="password-gate-input" style={{ color: '#9ca3af', fontSize: '.9rem' }}>Password</label>
          
          {/* Input dan Tombol Show/Hide */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 4 }}>
            <input
              id="password-gate-input"
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Masukan Password"
              autoFocus
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e5e7eb', padding: '8px', fontSize: '1rem' }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              style={{ background: 'rgba(255,255,255,.06)', color: '#cbd5e1', border: 'none', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem' }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Pesan Error */}
          {err && <div style={{ color: '#fecaca', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 10, padding: '8px 12px', fontSize: '.9rem', textAlign: 'center' }}>{err}</div>}

          {/* Tombol Aksi */}
          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <a href="/dashboard" style={{ flex: 1, textDecoration: 'none', background: 'rgba(255,255,255,.08)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,.12)', padding: '10px', borderRadius: 8, fontWeight: 600, textAlign: 'center', display: 'grid', placeItems: 'center' }}>
              Dashboard
            </a>
            <button
              type="submit"
              disabled={!pw || loading}
              style={{ flex: 2, background: '#22c55e', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 600, opacity: !pw || loading ? 0.6 : 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading && <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor"><g fill="none" strokeWidth="2"><circle cx="12" cy="12" r="9.5" strokeOpacity=".3" /><path d="M12 2.5a9.5 9.5 0 0 1 0 19z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></g></svg>}
              Masuk
            </button>
          </div>
        </form>
        
      </div>
    </div>
  );
}