'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db, auth } from '../../../lib/firebase';
import {
  collection, onSnapshot, addDoc, setDoc, doc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

type Peran = 'Kepala Keluarga' | 'Istri' | 'Anak';
type Status = 'Menikah' | 'Cerai' | 'Lajang';
type KategoriUmur = 'Balita' | 'Anak-anak' | 'Remaja' | 'Dewasa' | 'Lansia';

type Warga = {
  id: string;
  nama: string;
  nik: string;        // 16 digit
  noKk: string;       // 16 digit
  tglLahir: string;   // YYYY-MM-DD
  peran: Peran;
  status: Status;
};

/* Utils umur */
function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function getAge(ymd: string, now = new Date()) {
  const birth = parseYmd(ymd);
  if (!birth) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return Math.max(0, age);
}
function getKategoriUmur(age: number): KategoriUmur {
  if (age <= 5) return 'Balita';
  if (age <= 12) return 'Anak-anak';
  if (age <= 17) return 'Remaja';
  if (age <= 59) return 'Dewasa';
  return 'Lansia';
}
function validateNik(nik: string) { return /^\d{16}$/.test(nik); }
function validateNoKk(noKk: string) { return /^\d{16}$/.test(noKk); }
function validateDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !!parseYmd(s); }

function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  return { page: currentPage, setPage, total, totalPages, pageItems };
}

/* Koleksi log transaksi */
const LOG_COLLECTION = 'transaksi';
async function logTransaksi(action: 'create' | 'update' | 'delete', payload: any, before?: any) {
  try {
    await addDoc(collection(db, LOG_COLLECTION), {
      action,
      wargaId: payload?.id ?? null,
      nik: payload?.nik ?? null,
      noKk: payload?.noKk ?? null,
      nama: payload?.nama ?? null,
      before: before ?? null,
      after: payload ?? null,
      by: auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email ?? null } : null,
      at: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Gagal tulis transaksi:', e);
  }
}

export default function WargaPage() {
  const [data, setData] = useState<Warga[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<'tabel' | 'kk'>('tabel');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
  const [kategoriFilter, setKategoriFilter] = useState<'All' | KategoriUmur>('All');
  const [pageSize, setPageSize] = useState(10);

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Warga | null>(null);
  const [showDetail, setShowDetail] = useState<Warga | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Warga | null>(null);

  // Realtime Firestore: koleksi 'warga'
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'warga'),
      (snap) => {
        const arr: Warga[] = snap.docs.map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            nama: v.nama ?? '',
            nik: v.nik ?? '',
            noKk: v.noKk ?? '',
            tglLahir: v.tglLahir ?? '2000-01-01',
            peran: (v.peran ?? 'Anak') as Peran,
            status: (v.status ?? 'Lajang') as Status,
          };
        });
        setData(arr);
        setLoaded(true);
      },
      (err) => {
        console.error('Gagal subscribe warga:', err);
        setLoaded(true);
      }
    );
    return () => unsub();
  }, []);

  // Derived filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((w) => {
      const qMatch = q === '' || w.nama.toLowerCase().includes(q) || w.nik.includes(q) || w.noKk.includes(q);
      const stMatch = statusFilter === 'All' || w.status === statusFilter;
      const age = getAge(w.tglLahir);
      const kat = getKategoriUmur(age);
      const katMatch = kategoriFilter === 'All' || kat === kategoriFilter;
      return qMatch && stMatch && katMatch;
    });
  }, [data, query, statusFilter, kategoriFilter]);

  // Group KK
  const groupedKK = useMemo(() => {
    const groups = new Map<string, { noKk: string; kk?: Warga; istri?: Warga; anak: Warga[]; anggota: Warga[] }>();
    for (const w of filtered) {
      const g = groups.get(w.noKk) || { noKk: w.noKk, anak: [], anggota: [] as Warga[] };
      g.anggota.push(w);
      if (w.peran === 'Kepala Keluarga') g.kk = w;
      else if (w.peran === 'Istri') g.istri = w;
      else if (w.peran === 'Anak') g.anak.push(w);
      groups.set(w.noKk, g);
    }
    return Array.from(groups.values()).sort((a, b) => a.noKk.localeCompare(b.noKk));
  }, [filtered]);

  const statusSummary = useMemo(() => {
    const base = { Menikah: 0, Cerai: 0, Lajang: 0 };
    for (const w of filtered) base[w.status] += 1;
    return base;
  }, [filtered]);

  const kategoriSummary = useMemo(() => {
    const base: Record<KategoriUmur, number> = { Balita: 0, 'Anak-anak': 0, Remaja: 0, Dewasa: 0, Lansia: 0 };
    for (const w of filtered) base[getKategoriUmur(getAge(w.tglLahir))] += 1;
    return base;
  }, [filtered]);

  // Pagination
  const { page, setPage, total, totalPages, pageItems } =
    usePagination<any>(view === 'tabel' ? filtered : groupedKK, pageSize);

  // Handlers
  function onAdd() { setEditing(null); setShowForm(true); }
  function onEdit(row: Warga) { setEditing(row); setShowForm(true); }
  function onDelete(row: Warga) { setConfirmDelete(row); }
  function onDetail(row: Warga) { setShowDetail(row); }

  async function upsertWarga(input: Omit<Warga, 'id'>, editingId?: string) {
    if (!input.nama.trim()) return alert('Nama wajib diisi.');
    if (!validateNik(input.nik)) return alert('NIK harus 16 digit angka.');
    if (!validateNoKk(input.noKk)) return alert('No KK harus 16 digit angka.');
    if (!validateDate(input.tglLahir)) return alert('Tanggal lahir tidak valid.');
    const birth = parseYmd(input.tglLahir)!;
    if (birth > new Date()) return alert('Tanggal lahir tidak boleh di masa depan.');

    // Cegah NIK duplikat (cek di state realtime)
    const nikExists = data.some((x) => x.nik === input.nik && x.id !== editingId);
    if (nikExists) return alert('NIK sudah terdaftar.');

    try {
      if (editingId) {
        const before = data.find((x) => x.id === editingId);
        await setDoc(doc(db, 'warga', editingId), { ...input, updatedAt: serverTimestamp() }, { merge: true });
        await logTransaksi('update', { ...input, id: editingId }, before);
      } else {
        const ref = await addDoc(collection(db, 'warga'), { ...input, createdAt: serverTimestamp() });
        await logTransaksi('create', { ...input, id: ref.id });
      }
      setShowForm(false);
    } catch (e: any) {
      alert('Gagal menyimpan: ' + (e?.message || e));
    }
  }

  async function removeWarga(row: Warga) {
    try {
      await deleteDoc(doc(db, 'warga', row.id));
      await logTransaksi('delete', row);
      setConfirmDelete(null);
    } catch (e: any) {
      alert('Gagal menghapus: ' + (e?.message || e));
    }
  }

  // Helpers UI
  const TableRows = pageItems as Warga[];
  const KKCards = pageItems as Array<{ noKk: string; kk?: Warga; istri?: Warga; anak: Warga[]; anggota: Warga[] }>;

  if (!loaded) {
    return (
      <div className="wrap">
        <div className="pageLoader">
          <Spinner label="Memuat data (Firebase)..." />
        </div>
        <style jsx>{`
          .pageLoader { min-height: 60vh; display: grid; place-items: center; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="head">
        <div className="title">
          <h1>Data Warga</h1>
          <p className="sub">Tabel/Kartu KK, kategori umur.</p>
        </div>

        <div className="headActions">
          <a className="btn dashboard" href="/dashboard" title="Kembali ke Dashboard">← Dashboard</a>
          <button className="btn primary" onClick={onAdd}>+ Tambah Warga</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="left">
          <div className="seg">
            <button className={`tab ${view === 'tabel' ? 'active' : ''}`} onClick={() => { setPage(1); setView('tabel'); }}>Tabel</button>
            <button className={`tab ${view === 'kk' ? 'active' : ''}`} onClick={() => { setPage(1); setView('kk'); }}>Kartu KK</button>
          </div>

        <div className="search">
            <input placeholder="Cari nama / NIK / No KK..." value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} />
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M21 21l-4.35-4.35M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" stroke="currentColor" strokeWidth="1.6" fill="none"/></svg>
          </div>

          <div className="filter">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value as any); }}>
              <option value="All">Semua</option>
              <option value="Menikah">Menikah</option>
              <option value="Cerai">Cerai</option>
              <option value="Lajang">Lajang</option>
            </select>
          </div>

          <div className="filter">
            <label>Kategori</label>
            <select value={kategoriFilter} onChange={(e) => { setPage(1); setKategoriFilter(e.target.value as any); }}>
              <option value="All">Semua</option>
              <option value="Balita">Balita (0-5)</option>
              <option value="Anak-anak">Anak-anak (6-12)</option>
              <option value="Remaja">Remaja (13-17)</option>
              <option value="Dewasa">Dewasa (18-59)</option>
              <option value="Lansia">Lansia (60+)</option>
            </select>
          </div>
        </div>

        <div className="right">
          <label>Tampil</label>
          <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
            <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
          </select>
        </div>
      </section>

      <section className="summary">
        <StatusBar label="Menikah" value={statusSummary.Menikah} total={filtered.length} color="#22c55e" />
        <StatusBar label="Cerai"   value={statusSummary.Cerai}   total={filtered.length} color="#f59e0b" />
        <StatusBar label="Lajang"  value={statusSummary.Lajang}  total={filtered.length} color="#3b82f6" />
        <div className="tot">Total: {filtered.length} warga</div>
      </section>

      <section className="summaryAge">
        <StatusBar label="Balita"     value={kategoriSummary['Balita']}     total={filtered.length} color="#06b6d4" />
        <StatusBar label="Anak-anak"  value={kategoriSummary['Anak-anak']}  total={filtered.length} color="#10b981" />
        <StatusBar label="Remaja"     value={kategoriSummary['Remaja']}     total={filtered.length} color="#8b5cf6" />
        <StatusBar label="Dewasa"     value={kategoriSummary['Dewasa']}     total={filtered.length} color="#f97316" />
        <StatusBar label="Lansia"     value={kategoriSummary['Lansia']}     total={filtered.length} color="#ef4444" />
      </section>

      {view === 'tabel' ? (
        <div className="card">
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>NIK</th>
                  <th>No KK</th>
                  <th>Umur/Kategori</th>
                  <th>Peran</th>
                  <th>Status</th>
                  <th className="actionsCol">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {TableRows.length === 0 ? (
                  <tr><td colSpan={7} className="empty">Tidak ada data.</td></tr>
                ) : TableRows.map((w) => {
                  const umur = getAge(w.tglLahir);
                  const kat = getKategoriUmur(umur);
                  return (
                    <tr key={w.id}>
                      <td><button className="link" onClick={() => setShowDetail(w)} title="Lihat detail">{w.nama}</button></td>
                      <td><code>{w.nik}</code></td>
                      <td><code>{w.noKk}</code></td>
                      <td>{umur} th • <Badge tone="violet">{kat}</Badge></td>
                      <td><Badge>{w.peran}</Badge></td>
                      <td><Badge tone={w.status === 'Menikah' ? 'green' : w.status === 'Cerai' ? 'amber' : 'blue'}>{w.status}</Badge></td>
                      <td className="actionsCol">
                        <div className="rowActions">
                          <button className="btn sm" onClick={() => setShowDetail(w)} title="Detail"><EyeIcon /></button>
                          <button className="btn sm" onClick={() => onEdit(w)} title="Edit"><EditIcon /></button>
                          <button className="btn sm danger" onClick={() => onDelete(w)} title="Hapus"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      ) : (
        <div className="card">
          <div className="kkGrid">
            {KKCards.length === 0 ? (
              <div className="empty">Tidak ada KK yang cocok.</div>
            ) : KKCards.map((g) => (
              <div key={g.noKk} className="kkCard">
                <div className="kkHead">
                  <div className="kkNo"><span>No KK:</span> <code>{g.noKk}</code></div>
                  <div className="kkCount">{g.anggota.length} anggota</div>
                </div>
                <div className="kkBody">
                  <div className="row"><span className="lbl">Kepala Keluarga</span><span className="val">{g.kk ? g.kk.nama : '-'}</span></div>
                  <div className="row"><span className="lbl">Istri</span><span className="val">{g.istri ? g.istri.nama : '-'}</span></div>
                  <div className="row"><span className="lbl">Anak</span><span className="val">{g.anak.length ? g.anak.map(a => a.nama).join(', ') : '-'}</span></div>
                  <div className="members">
                    {g.anggota.map((m) => (
                      <button key={m.id} className="chip" onClick={() => setShowDetail(m)} title="Detail anggota">
                        {m.nama} • {m.peran}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      )}

      {showForm && (
        <WargaFormModal
          initial={editing ?? undefined}
          onClose={() => setShowForm(false)}
          onSubmit={(payload) => upsertWarga(payload, editing?.id)}
        />
      )}

      {showDetail && (
        <DetailModal
          warga={showDetail}
          all={data}
          onClose={() => setShowDetail(null)}
          onEdit={() => { setEditing(showDetail); setShowForm(true); setShowDetail(null); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Hapus Warga"
          message={`Yakin ingin menghapus ${confirmDelete.nama}? Tindakan ini tidak bisa dibatalkan.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeWarga(confirmDelete)}
        />
      )}

      <style jsx>{`
        .wrap { padding: 18px; display: grid; gap: 16px; }
        @media (max-width: 640px) { .wrap { padding: 12px; } }

        /* Header: teks di atas, tombol bawah kiri–kanan */
        .head { display: grid; gap: 10px; }
        .title { text-align: center; }
        .title h1 { margin: 0; font-size: clamp(1.1rem, 2.2vw, 1.4rem); }
        .sub { margin: 4px 0 0; color: #9ca3af; font-size: .9rem; }

        .headActions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .headActions .btn {
          background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 10px 12px; border-radius: 10px; min-height: 40px; text-decoration: none;
        }
        .headActions .btn.dashboard { background: #3b82f6; color: #fff; border: none; font-weight: 700; }
        .headActions .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
        .btn.dashboard:hover, .btn.primary:hover { filter: brightness(1.05); }

        .toolbar {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          padding: 10px;
          background: rgba(255,255,255,.03);
        }
        .left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .seg { display: inline-flex; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; overflow: hidden; }
        .tab { background: transparent; color: #e5e7eb; padding: 8px 10px; border: none; }
        .tab.active { background: rgba(34,197,94,.16); color: #bbf7d0; }
        .search { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.02); }
        .search input { border: none; outline: none; background: transparent; color: #e5e7eb; width: clamp(120px, 32vw, 220px); }

        .filter label, .right label { color: #9ca3af; font-size: .85rem; margin-right: 6px; }
        select { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 6px 10px; border-radius: 8px; }

        @media (max-width: 640px) { .left, .right { width: 100%; } }
        @media (max-width: 480px) {
          .toolbar { gap: 8px; }
          .search { flex: 1; }
          .search input { width: 100%; }
        }

        .summary { display: grid; grid-template-columns: repeat(3, 1fr) auto; gap: 10px; align-items: center; }
        @media (max-width: 800px) { .summary { grid-template-columns: 1fr 1fr; } .summary .tot { grid-column: 1 / -1; text-align: left; margin-top: 4px; } }

        .summaryAge { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; align-items: center; }
        @media (max-width: 900px) { .summaryAge { grid-template-columns: 1fr 1fr 1fr; } }
        @media (max-width: 560px) { .summaryAge { grid-template-columns: 1fr 1fr; } }

        .tot { color: #9ca3af; font-size: .9rem; text-align: right; }

        .card { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(255,255,255,.03); padding: 10px; }

        .tableWrap { overflow: auto; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable both-edges; }
        table.tbl { width: 100%; min-width: 980px; border-collapse: collapse; }
        @media (max-width: 1024px) { table.tbl { min-width: 900px; } }
        @media (max-width: 900px)  { table.tbl { min-width: 760px; } }
        @media (max-width: 700px)  { table.tbl { min-width: 0; } }

        .tbl thead th { position: sticky; top: 0; z-index: 2; background: rgba(20,22,28,.92); backdrop-filter: blur(6px); }
        .tbl th, .tbl td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,.08); text-align: left; vertical-align: middle; }
        .tbl th { color: #a7f3d0; font-weight: 600; }
        .tbl td code { background: rgba(255,255,255,.04); padding: 2px 6px; border-radius: 6px; color: #e5e7eb; }
        .tbl th:nth-child(1), .tbl td:nth-child(1) { white-space: normal; }
        .tbl th:nth-child(2), .tbl td:nth-child(2), .tbl th:nth-child(3), .tbl td:nth-child(3) { white-space: nowrap; width: 180px; }
        .tbl th:nth-child(4), .tbl td:nth-child(4) { white-space: nowrap; }
        .tbl th.actionsCol, .tbl td.actionsCol { text-align: right; width: 160px; min-width: 160px; white-space: nowrap; }
        @media (max-width: 900px) {
          .tbl th:nth-child(2), .tbl td:nth-child(2),
          .tbl th:nth-child(3), .tbl td:nth-child(3) { width: 150px; }
        }

        @media (max-width: 700px) {
          .tbl thead {
            position: absolute; width: 1px; height: 1px; margin: -1px; border: 0; padding: 0;
            clip: rect(0 0 0 0); overflow: hidden;
          }
          .tbl tbody { display: grid; gap: 10px; }
          .tbl tr {
            display: grid;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
            background: rgba(255,255,255,.02);
            overflow: hidden;
          }
          .tbl td {
            display: grid; grid-template-columns: 120px 1fr; gap: 8px;
            border: 0; border-bottom: 1px solid rgba(255,255,255,.08); padding: 10px; white-space: normal;
          }
          .tbl td:last-child { border-bottom: 0; }
          .tbl td:nth-child(1)::before { content: 'Nama'; color: #9ca3af; }
          .tbl td:nth-child(2)::before { content: 'NIK'; color: #9ca3af; }
          .tbl td:nth-child(3)::before { content: 'No KK'; color: #9ca3af; }
          .tbl td:nth-child(4)::before { content: 'Umur/Kategori'; color: #9ca3af; }
          .tbl td:nth-child(5)::before { content: 'Peran'; color: #9ca3af; }
          .tbl td:nth-child(6)::before { content: 'Status'; color: #9ca3af; }
          .tbl td:nth-child(7)::before { content: 'Aksi'; color: #9ca3af; }
          .tbl td.actionsCol { grid-template-columns: 1fr; }
          .tbl td.actionsCol::before { display: none; }
          .rowActions { justify-content: flex-start; flex-wrap: wrap; }
        }

        .rowActions { display: inline-flex; gap: 6px; flex-wrap: nowrap; }
        .btn.sm {
          width: 36px; height: 36px; padding: 0;
          border-radius: 8px; border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.02); color: #e5e7eb;
          display: inline-grid; place-items: center; flex: 0 0 auto;
        }
        .btn.sm:hover { background: rgba(255,255,255,.06); }
        .btn.sm.danger { border-color: rgba(239,68,68,.35); color: #fecaca; }
        .btn.sm.danger:hover { background: rgba(239,68,68,.15); }
        .btn.sm svg { pointer-events: none; }
        @media (pointer: coarse) { .btn.sm { width: 40px; height: 40px; } }

        .empty { color: #9ca3af; text-align: center; padding: 20px 6px; }

        .kkGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
        @media (max-width: 420px) { .kkGrid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }
        @media (max-width: 360px) { .kkGrid { grid-template-columns: 1fr; } }
        .kkCard { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.02); }
        .kkHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px; background: rgba(34,197,94,.08); }
        .kkNo { color: #cbd5e1; font-weight: 600; }
        .kkNo span { color: #94a3b8; font-weight: 400; margin-right: 6px; }
        .kkCount { color: #9ca3af; font-size: .9rem; }
        .kkBody { padding: 10px; display: grid; gap: 8px; }
        .row { display: grid; grid-template-columns: 140px 1fr; gap: 10px; }
        @media (max-width: 480px) { .row { grid-template-columns: 120px 1fr; } }
        @media (max-width: 360px) { .row { grid-template-columns: 100px 1fr; } }
        .lbl { color: #9ca3af; }
        .val { color: #e5e7eb; }
        .members { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .chip { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: #e5e7eb; padding: 6px 10px; border-radius: 999px; }

        .link { background: transparent; color: #93c5fd; border: none; cursor: pointer; }
        .link:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

/* Components */
function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'blue' | 'slate' | 'violet' }) {
  const map: Record<string, string> = {
    green: 'rgba(34,197,94,.18)', amber: 'rgba(245,158,11,.22)', blue: 'rgba(59,130,246,.20)', slate: 'rgba(148,163,184,.22)', violet:'rgba(139,92,246,.22)',
  };
  const bg = map[tone] ?? map.slate;
  return (<span style={{ background: bg, color: '#e5e7eb', padding: '4px 8px', borderRadius: 999, fontSize: '.85rem', border: '1px solid rgba(255,255,255,.12)' }}>{children}</span>);
}

function StatusBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="statusBar">
      <div className="row"><span className="lbl">{label}</span><span className="val">{value}</span></div>
      <div className="bar"><div className="fill" style={{ width: `${pct}%`, background: color }} /></div>
      <style jsx>{`
        .statusBar { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px; background: rgba(255,255,255,.03); }
        .row { display: flex; align-items: center; justify-content: space-between; color: #e5e7eb; }
        .lbl { color: #cbd5e1; }
        .bar { height: 8px; background: rgba(255,255,255,.06); border-radius: 999px; overflow: hidden; margin-top: 6px; }
        .fill { height: 100%; border-radius: 999px; }
      `}</style>
    </div>
  );
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="pg">
      <div className="info">Menampilkan halaman {page} dari {totalPages} • Total {total} data</div>
      <div className="ctrl">
        <button disabled={page <= 1} onClick={() => onPage(1)}>{'⏮'}</button>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>{'‹'}</button>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{'›'}</button>
        <button disabled={page >= totalPages} onClick={() => onPage(totalPages)}>{'⏭'}</button>
      </div>
      <style jsx>{`
        .pg { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 8px; flex-wrap: wrap; }
        .info { color: #9ca3af; font-size: .9rem; }
        .ctrl { display: inline-flex; gap: 6px; }
        .ctrl button { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 6px 10px; border-radius: 8px; min-height: 36px; }
        .ctrl button:disabled { opacity: .4; cursor: not-allowed; }
        @media (max-width: 560px) {
          .pg { justify-content: center; }
          .info { width: 100%; text-align: center; }
        }
      `}</style>
    </div>
  );
}

function WargaFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: Warga;
  onClose: () => void;
  onSubmit: (payload: Omit<Warga, 'id'>) => void;
}) {
  const [nama, setNama] = useState(initial?.nama ?? '');
  const [nik, setNik] = useState(initial?.nik ?? '');
  const [noKk, setNoKk] = useState(initial?.noKk ?? '');
  const [tglLahir, setTglLahir] = useState(initial?.tglLahir ?? '');
  const [peran, setPeran] = useState<Peran>(initial?.peran ?? 'Kepala Keluarga');
  const [status, setStatus] = useState<Status>(initial?.status ?? 'Lajang');

  const umur = tglLahir ? getAge(tglLahir) : null;
  const kat = umur !== null ? getKategoriUmur(umur) : null;

  return (
    <Modal title={initial ? 'Edit Warga' : 'Tambah Warga'} onClose={onClose}>
      <div className="form">
        <div className="field"><label>Nama</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama lengkap" /></div>
        <div className="grid2">
          <div className="field"><label>NIK</label><input value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))} placeholder="16 digit" maxLength={16} /></div>
          <div className="field"><label>No KK</label><input value={noKk} onChange={(e) => setNoKk(e.target.value.replace(/\D/g, ''))} placeholder="16 digit" maxLength={16} /></div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Tanggal Lahir</label>
            <input type="date" value={tglLahir} onChange={(e) => setTglLahir(e.target.value)} />
            {umur !== null && <small style={{ color: '#9ca3af' }}>Umur: {umur} th • Kategori: {kat}</small>}
          </div>
          <div className="field">
            <label>Peran</label>
            <select value={peran} onChange={(e) => setPeran(e.target.value as Peran)}>
              <option>Kepala Keluarga</option><option>Istri</option><option>Anak</option>
            </select>
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option>Lajang</option><option>Menikah</option><option>Cerai</option>
            </select>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" onClick={() => onSubmit({ nama, nik, noKk, tglLahir, peran, status })}>Simpan</button>
        </div>
      </div>
      <style jsx>{`
        .form { display: grid; gap: 10px; }
        .grid2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
        @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }
        .field { display: grid; gap: 6px; }
        label { color: #9ca3af; font-size: .9rem; }
        input, select { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 10px; border-radius: 10px; }
        .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .btn { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 10px 12px; border-radius: 10px; min-height: 40px; }
        .btn.primary { background: #22c55e; border-color: transparent; color: #fff; font-weight: 700; }
        @media (max-width: 360px) {
          input, select { font-size: 16px; } /* hindari zoom iOS saat fokus */
        }
      `}</style>
    </Modal>
  );
}

function DetailModal({ warga, all, onClose, onEdit }: { warga: Warga; all: Warga[]; onClose: () => void; onEdit: () => void; }) {
  const kkGroup = useMemo(() => {
    const anggota = all.filter((x) => x.noKk === warga.noKk);
    const kk = anggota.find((x) => x.peran === 'Kepala Keluarga');
    const istri = anggota.find((x) => x.peran === 'Istri');
    const anak = anggota.filter((x) => x.peran === 'Anak');
    return { kk, istri, anak, anggota };
  }, [warga, all]);

  const parts = { kepala: kkGroup.kk ? 1 : 0, istri: kkGroup.istri ? 1 : 0, anak: kkGroup.anak.length };
  const total = parts.kepala + parts.istri + parts.anak || 1;
  const pct = { kepala: (parts.kepala / total) * 100, istri: (parts.istri / total) * 100, anak: (parts.anak / total) * 100 };
  const umur = getAge(warga.tglLahir);
  const kategori = getKategoriUmur(umur);

  return (
    <Modal title="Detail Warga" onClose={onClose}>
      <div className="detail">
        <div className="id">
          <div className="row"><span>Nama</span><b>{warga.nama}</b></div>
          <div className="row"><span>NIK</span><code>{warga.nik}</code></div>
          <div className="row"><span>No KK</span><code>{warga.noKk}</code></div>
          <div className="row"><span>Tanggal Lahir</span><b>{warga.tglLahir}</b></div>
          <div className="row"><span>Umur</span><b>{umur} tahun</b></div>
          <div className="row"><span>Kategori Umur</span><b>{kategori}</b></div>
          <div className="row"><span>Peran</span><b>{warga.peran}</b></div>
          <div className="row"><span>Status</span><b>{warga.status}</b></div>
        </div>

        <div className="kk">
          <h4>Kartu Keluarga</h4>
          <div className="row"><span className="lbl">Kepala Keluarga</span><span className="val">{kkGroup.kk ? <><b>{kkGroup.kk.nama}</b><div className="muted"><code>{kkGroup.kk.nik}</code></div></> : '-'}</span></div>
          <div className="row"><span className="lbl">Istri</span><span className="val">{kkGroup.istri ? <><b>{kkGroup.istri.nama}</b><div className="muted"><code>{kkGroup.istri.nik}</code></div></> : '-'}</span></div>
          <div className="row">
            <span className="lbl">Anak</span>
            <span className="val">
              {kkGroup.anak.length ? (
                <ul className="anakList">
                  {kkGroup.anak.map((a) => (<li key={a.id}>{a.nama} <span className="muted"><code>{a.nik}</code></span></li>))}
                </ul>
              ) : '-'}
            </span>
          </div>

          <div className="kkChart">
            <div className="stack" title={`Total ${total} orang`}>
              {parts.kepala > 0 && <span className="seg kepala" style={{ width: `${pct.kepala}%` }} />}
              {parts.istri > 0 && <span className="seg istri" style={{ width: `${pct.istri}%` }} />}
              {parts.anak > 0 && <span className="seg anak" style={{ width: `${pct.anak}%` }} />}
            </div>
            <div className="legend">
              <span className="lg"><i className="dot kepala" /> Kepala ({parts.kepala})</span>
              <span className="lg"><i className="dot istri" /> Istri ({parts.istri})</span>
              <span className="lg"><i className="dot anak" /> Anak ({parts.anak})</span>
              <span className="tot">Total: {total} orang</span>
            </div>
          </div>

          <div className="chips" style={{ marginTop: 8 }}>
            {kkGroup.anggota.map(m => (<span key={m.id} className="chip">{m.nama} • {m.peran}</span>))}
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={onClose}>Tutup</button>
          <button className="btn primary" onClick={onEdit}>Edit</button>
        </div>
      </div>

      <style jsx>{`
        .detail { display: grid; gap: 12px; }
        .id, .kk { border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 10px; background: rgba(255,255,255,.03); }
        .row { display: grid; grid-template-columns: 140px 1fr; gap: 10px; padding: 6px 0; }
        @media (max-width: 480px) { .row { grid-template-columns: 120px 1fr; } }
        @media (max-width: 360px) { .row { grid-template-columns: 100px 1fr; } }
        .row span { color: #9ca3af; }
        h4 { margin: 0 0 6px; color: #a7f3d0; }

        .muted { color: #9ca3af; font-size: .9rem; margin-top: 2px; display: inline-block; }
        .anakList { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
        .anakList code { margin-left: 6px; }

        .kkChart { margin-top: 10px; }
        .stack { height: 12px; width: 100%; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); }
        .seg { display: inline-block; height: 100%; }
        .seg.kepala { background: #22c55e; } .seg.istri { background: #f472b6; } .seg.anak { background: #60a5fa; }

        .legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 8px; color: #cbd5e1; }
        .lg { display: inline-flex; align-items: center; gap: 6px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .dot.kepala { background: #22c55e; } .dot.istri { background: #f472b6; } .dot.anak { background: #60a5fa; }
        .tot { margin-left: auto; color: #9ca3af; }

        .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .chip { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: #e5e7eb; padding: 6px 10px; border-radius: 999px; }

        .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .btn { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 10px 12px; border-radius: 10px; min-height: 40px; }
        .btn.primary { background: #22c55e; border-color: transparent; color: #fff; font-weight: 700; }
      `}</style>
    </Modal>
  );
}

function ConfirmModal({ title, message, onCancel, onConfirm }: { title: string; message: string; onCancel: () => void; onConfirm: () => void; }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ color: '#e5e7eb', marginTop: 6 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onCancel}>Batal</button>
        <button className="btn danger" onClick={onConfirm}>Hapus</button>
      </div>
      <style jsx>{`
        .btn { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 10px 12px; border-radius: 10px; min-height: 40px; }
        .btn.danger { background: #ef4444; color: #fff; border-color: transparent; font-weight: 700; }
      `}</style>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="head">
          <h3 id="modal-title">{title}</h3>
          <button className="x" onClick={onClose} aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
        <div className="body">{children}</div>
      </div>
      <style jsx>{`
        .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 80; }
        .modal {
          position: fixed; inset: 0; margin: auto; max-width: 640px; width: calc(100% - 16px);
          background: rgba(20,22,28,.9); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 10px; z-index: 81;
          box-shadow: 0 30px 80px rgba(0,0,0,.55);
          max-height: 90vh; overflow: auto;
        }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        h3 { margin: 0; color: #e5e7eb; }
        .x { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #cbd5e1; }
        .body { padding-top: 8px; }

        @media (max-width: 480px) {
          .modal {
            inset: 0; margin: 0; width: 100vw; height: 100dvh; max-height: none; border-radius: 0;
            padding: 12px calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
          }
          .x { width: 36px; height: 36px; }
          .body { padding-bottom: 8px; }
        }
      `}</style>
    </>
  );
}

function Spinner({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div className="spinnerWrap" role="status" aria-live="polite">
      <div className="spinner" />
      <div className="spinnerLabel">{label}</div>
      <style jsx>{`
        .spinnerWrap { display: grid; justify-items: center; gap: 10px; color: #cbd5e1; }
        .spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid rgba(255,255,255,.15); border-top-color: #22c55e; animation: spin 0.9s linear infinite; }
        .spinnerLabel { font-size: .95rem; color: #9ca3af; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* Icons */
function EditIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 21h4l11-11-4-4L4 17v4z" stroke="currentColor" strokeWidth="1.6"/></svg>); }
function TrashIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6h18M8 6l1-2h6l1 2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" stroke="currentColor" strokeWidth="1.6"/></svg>); }
function EyeIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/></svg>); }