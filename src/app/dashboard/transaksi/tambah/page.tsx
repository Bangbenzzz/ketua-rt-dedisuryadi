'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { FullscreenSpinner } from '@/components/Spinner';
import JenisToggle from '@/components/JenisToggle';

export default function TambahTransaksiPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace('/login');
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const jenis = (fd.get('jenis') as 'Pemasukan' | 'Pengeluaran') || 'Pemasukan';
    const tgl = String(fd.get('tanggal') || '');
    const nominal = Number(fd.get('nominal') || 0);
    const keterangan = String(fd.get('keterangan') || '').trim();
    const tanggal = tgl ? new Date(`${tgl}T00:00:00`).toISOString() : new Date().toISOString();

    try {
      await addDoc(collection(db, 'transaksi'), {
        uid: user.uid,
        jenis, nominal, keterangan, tanggal,
        createdAt: new Date().toISOString(),
      });
      router.push('/dashboard');
    } catch (e) {
      console.error(e);
      alert('Gagal menambah transaksi.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth) return <FullscreenSpinner />;

  return (
    <main className="page">
      <div className="bgDecor" aria-hidden />
      <section className="container">
        <div className="top">
          <h1>Tambah Transaksi</h1>
          <Link href="/dashboard" className="btn btn--ghost">Kembali</Link>
        </div>

        <form onSubmit={handleSubmit} className="card form">
          <div className="field">
            <label>Jenis Transaksi</label>
            <JenisToggle name="jenis" defaultValue="Pemasukan" required />
          </div>

          <div className="field">
            <label>Tanggal</label>
            <input type="date" name="tanggal" required />
          </div>

          <div className="field">
            <label>Nominal</label>
            <input type="number" name="nominal" placeholder="0" min="0" step="1000" required />
          </div>

          <div className="field">
            <label>Keterangan</label>
            <textarea name="keterangan" placeholder="Contoh: Iuran bulan Januari" rows={3} />
          </div>

          <div className="actions">
            <button type="submit" className="btn btn--add" disabled={loading}>
              {loading ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </section>

      <style jsx>{`
        .page { min-height: 100svh; color: #e5e7eb; padding: clamp(16px, 3vw, 24px); overflow-x: hidden;
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(99,102,241,0.15), transparent 40%),
            radial-gradient(900px circle at 90% 110%, rgba(236,72,153,0.12), transparent 40%),
            linear-gradient(180deg, #0b0f17, #0a0d14 60%, #080b11); }
        .bgDecor { position: fixed; inset: -40% -10% -10% -10%; background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 18px 18px; pointer-events: none; }
        .container { width: 100%; max-width: 720px; margin: 0 auto; padding-inline: clamp(12px, 3vw, 20px); display: grid; gap: 16px; }
        .top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        h1 { margin: 0; font-size: 1.2rem; }
        .card { width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: rgba(20,22,28,0.6);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45); backdrop-filter: blur(14px); padding: 16px; }
        .form { display: grid; gap: 14px; }
        .field label { display: block; margin-bottom: 8px; color: #cbd5e1; font-size: .95rem; }
        .field input, .field textarea { width: 100%; border-radius: 12px; padding: 10px 12px; color: #f3f4f6;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); }
        .actions { display: flex; justify-content: flex-end; margin-top: 6px; }
      `}</style>
    </main>
  );
}