'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import JenisToggle from '@/components/JenisToggle';
import { FullscreenSpinner } from '@/components/Spinner';
import { isOperatorUser } from '@/lib/roles';

export default function TambahTransaksiPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace('/login');
      else setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  // Batasi UI tambah untuk operator (rules juga sudah batasi)
  useEffect(() => {
    if (!loadingAuth && user && !isOperatorUser(user)) {
      alert('Hanya operator yang bisa menambah transaksi.');
      router.replace('/dashboard');
    }
  }, [user, loadingAuth, router]);

  if (loadingAuth) return <FullscreenSpinner />;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const fd = new FormData(e.currentTarget);
    const jenis = (fd.get('jenis') as 'Pemasukan' | 'Pengeluaran') || 'Pemasukan';
    const tgl = String(fd.get('tanggal') || '');
    const nominal = Number(fd.get('nominal') || 0);
    const keterangan = String(fd.get('keterangan') || '').trim();
    const tanggal = tgl ? new Date(`${tgl}T00:00:00`).toISOString() : new Date().toISOString();

    try {
      setSaving(true);
      await addDoc(collection(db, 'transaksi'), {
        uid: user.uid,
        jenis,
        nominal,
        keterangan,
        tanggal,
        createdAt: serverTimestamp(),
      });
      router.replace('/dashboard');
    } catch (e) {
      console.error(e);
      alert('Gagal menambah transaksi. Cek akses operator & rules.');
    } finally {
      setSaving(false);
    }
  };

  const defaultDate = new Date();
  const yyyy = defaultDate.getFullYear();
  const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
  const dd = String(defaultDate.getDate()).padStart(2, '0');
  const inputDate = `${yyyy}-${mm}-${dd}`;

  return (
    <main className="page">
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
            <input type="date" name="tanggal" defaultValue={inputDate} required />
          </div>

          <div className="field">
            <label>Nominal</label>
            <input type="number" name="nominal" min="0" step="1000" required placeholder="0" />
          </div>

          <div className="field">
            <label>Keterangan</label>
            <textarea name="keterangan" rows={3} placeholder="Opsional" />
          </div>

          <div className="actions">
            <button type="submit" className="btn btn--add" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </section>

      <style jsx>{`
        .page { min-height: 100svh; color: #e5e7eb; padding: 16px; }
        .container { max-width: 720px; margin: 0 auto; display: grid; gap: 12px; }
        .top { display: flex; justify-content: space-between; align-items: center; }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 12px; }
        .form { display: grid; gap: 12px; }
        .field { display: grid; gap: 6px; }
        input, textarea {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
          color: #e5e7eb; border-radius: 10px; padding: 10px;
        }
        .actions { display: flex; justify-content: flex-end; gap: 8px; }
        .btn { padding: 10px 12px; border-radius: 10px; }
        .btn--add { background: #10b981; color: #fff; border: none; }
        .btn--ghost { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #e5e7eb; }
      `}</style>
    </main>
  );
}