'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import {
  onAuthStateChanged,
  User,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { FullscreenSpinner } from '@/components/Spinner';
import JenisToggle from '@/components/JenisToggle';

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
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Transaksi | null>(null);
  const [saving, setSaving] = useState(false);

  // Hapus (dengan re-auth)
  const [showDelete, setShowDelete] = useState(false);
  const [delPass, setDelPass] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace('/login');
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'transaksi', id));
        if (!snap.exists()) {
          alert('Transaksi tidak ditemukan.');
          router.replace('/dashboard');
          return;
        }
        const dt = snap.data() as Transaksi;
        if (dt.uid !== user.uid) {
          alert('Tidak diizinkan.');
          router.replace('/dashboard');
          return;
        }
        setData(dt);
      } catch (e) {
        console.error(e);
        alert('Gagal memuat transaksi.');
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
      router.push('/dashboard');
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !id) return;
    if (!user.email) {
      alert('Akun ini tidak memiliki email/password. Silakan logout, lalu login dengan email & password untuk menghapus.');
      return;
    }
    if (!delPass.trim()) {
      alert('Masukkan password untuk konfirmasi.');
      return;
    }
    if (!confirm('Yakin ingin menghapus transaksi ini? Tindakan ini tidak bisa dibatalkan.')) return;

    try {
      setDeleting(true);
      // Re-authenticate sebelum operasi sensitif
      const cred = EmailAuthProvider.credential(user.email, delPass);
      await reauthenticateWithCredential(user, cred);

      // Hapus dokumen transaksi
      await deleteDoc(doc(db, 'transaksi', id));

      // Paksa user login ulang
      await signOut(auth);
      router.replace('/login?reauth=1');
    } catch (e: any) {
      console.error(e);
      const msg = e?.code === 'auth/invalid-credential'
        ? 'Password salah. Coba lagi.'
        : e?.message || 'Gagal menghapus transaksi.';
      alert(msg);
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
      <div className="bgDecor" aria-hidden />
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
          </div>
        </form>

        {/* Danger zone: Hapus transaksi + re-auth password */}
        <section className="card danger">
          <div className="dangerHead">
            <h3>Hapus Transaksi</h3>
            <button className="btn btn--danger" onClick={() => setShowDelete(v => !v)}>
              {showDelete ? 'Batal' : 'Hapus Transaksi'}
            </button>
          </div>

          {showDelete && (
            <div className="dangerBody">
              <p className="muted">Demi keamanan, masukkan password akun kamu untuk melanjutkan penghapusan. Setelah berhasil dihapus, kamu akan diminta login lagi.</p>
              <div className="field">
                <label>Email</label>
                <input type="email" value={user?.email ?? ''} readOnly />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Password akun"
                  value={delPass}
                  onChange={(e) => setDelPass(e.target.value)}
                />
              </div>
              <div className="actions">
                <button className="btn btn--ghost" onClick={() => setShowDelete(false)}>Batal</button>
                <button className="btn btn--danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Menghapus…' : 'Konfirmasi Hapus & Logout'}
                </button>
              </div>
            </div>
          )}
        </section>
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
        .field { display: grid; gap: 8px; }
        .field label { color: #cbd5e1; font-size: .95rem; }
        .field input, .field textarea { width: 100%; border-radius: 12px; padding: 10px 12px; color: #f3f4f6;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); }

        .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; flex-wrap: wrap; }
        .btn { border-radius: 12px; padding: 10px 12px; min-height: 40px; border: 1px solid rgba(255,255,255,0.12); color: #e5e7eb; background: rgba(255,255,255,0.06); }
        .btn--ghost { background: rgba(255,255,255,0.04); }
        .btn--edit { background: #3b82f6; border-color: transparent; color: white; font-weight: 700; }
        .btn--danger { background: #ef4444; border-color: transparent; color: white; font-weight: 700; }

        .danger { display: grid; gap: 10px; }
        .dangerHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .dangerBody { display: grid; gap: 10px; }
        .muted { color: #9ca3af; }
      `}</style>
    </main>
  );
}