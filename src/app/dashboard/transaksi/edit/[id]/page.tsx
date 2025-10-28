'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import JenisToggle from '@/components/JenisToggle';
import { FullscreenSpinner } from '@/components/Spinner';
import { isOperatorUser } from '@/lib/roles';

type Transaksi = {
  uid: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  nominal: number;
  keterangan: string;
  tanggal: string;
  createdAt?: string;
};

export default function EditTransaksiPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Transaksi | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace('/login');
      else setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    (async () => {
      if (!user || !id) return;
      // Batasi UI edit untuk operator (rules juga sudah batasi)
      if (!isOperatorUser(user)) {
        alert('Hanya operator yang bisa mengedit transaksi.');
        router.replace('/dashboard');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'transaksi', id));
        if (!snap.exists()) {
          alert('Transaksi tidak ditemukan.');
          router.replace('/dashboard');
          return;
        }
        setData(snap.data() as Transaksi);
      } catch (e) {
        console.error(e);
        alert('Gagal memuat transaksi (cek akses operator).');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id || !data) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const jenis = (fd.get('jenis') as 'Pemasukan' | 'Pengeluaran') || data.jenis;
    const tgl = String(fd.get('tanggal') || '');
    const nominal = Number(fd.get('nominal') || 0);
    const keterangan = String(fd.get('keterangan') || '').trim();
    const tanggal = tgl ? new Date(`${tgl}T00:00:00`).toISOString() : data.tanggal;

    try {
      await updateDoc(doc(db, 'transaksi', id), { jenis, nominal, keterangan, tanggal });
      router.replace('/dashboard');
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan perubahan (cek akses operator).');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Yakin ingin menghapus transaksi ini?')) return;
    try {
      setDeleting(true);
      await deleteDoc(doc(db, 'transaksi', id));
      router.replace('/dashboard');
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus transaksi (cek akses operator).');
    } finally {
      setDeleting(false);
    }
  };

  if (loadingAuth || loading) return <FullscreenSpinner />;
  if (!data) return null;

  const d = new Date(data.tanggal);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const inputDate = `${yyyy}-${mm}-${dd}`;

  return (
    <main className="page">
      <section className="container">
        <div className="top">
          <h1>Edit Transaksi</h1>
          <Link href="/dashboard" className="btn btn--ghost">Kembali</Link>
        </div>

        <form onSubmit={handleSubmit} className="card form">
          <div className="field">
            <label>Jenis Transaksi</label>
            <JenisToggle name="jenis" defaultValue={data.jenis} required />
          </div>

          <div className="field">
            <label>Tanggal</label>
            <input type="date" name="tanggal" defaultValue={inputDate} required />
          </div>

          <div className="field">
            <label>Nominal</label>
            <input type="number" name="nominal" defaultValue={data.nominal} min="0" step="1000" required />
          </div>

          <div className="field">
            <label>Keterangan</label>
            <textarea name="keterangan" defaultValue={data.keterangan} rows={3} />
          </div>

          <div className="actions">
            <button type="submit" className="btn btn--edit" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
            <button type="button" className="btn btn--delete" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Menghapus…' : 'Hapus'}
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
        .btn--ghost { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #e5e7eb; }
        .btn--edit { background: #3b82f6; color: #fff; border: none; }
        .btn--delete { background: #ef4444; color: #fff; border: none; }
      `}</style>
    </main>
  );
}