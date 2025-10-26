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

type KeluargaInput = {
  noKk: string;
  kepala: { nama: string; nik: string; tglLahir: string };
  istri?: { nama: string; nik: string; tglLahir: string };
  anak: Array<{ nama: string; nik: string; tglLahir: string }>;
};

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; title?: string; message: string };

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

export default function WargaPageClient() {
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
  const [notice, setNotice] = useState<Notice | null>(null);

  const showError = (message: string, title = 'Gagal') => setNotice({ type: 'error', title, message });
  const showSuccess = (message: string, title = 'Berhasil') => setNotice({ type: 'success', title, message });
  const showInfo = (message: string, title = 'Info') => setNotice({ type: 'info', title, message });

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
    if (!input.nama.trim()) return showError('Nama wajib diisi.');
    if (!validateNik(input.nik)) return showError('NIK harus 16 digit angka.');
    if (!validateNoKk(input.noKk)) return showError('No KK harus 16 digit angka.');
    if (!validateDate(input.tglLahir)) return showError('Tanggal lahir tidak valid.');
    const birth = parseYmd(input.tglLahir)!;
    if (birth > new Date()) return showError('Tanggal lahir tidak boleh di masa depan.');

    // Cegah NIK duplikat (cek di state realtime)
    const nikExists = data.some((x) => x.nik === input.nik && x.id !== editingId);
    if (nikExists) return showError('NIK sudah terdaftar.');

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
      showSuccess('Data warga berhasil disimpan.');
    } catch (e: any) {
      showError('Gagal menyimpan: ' + (e?.message || e));
    }
  }

  // Buat keluarga (KK) sekaligus
  async function createKeluarga(input: KeluargaInput) {
    const { noKk, kepala } = input;
    let istri = input.istri;
    let anak = Array.isArray(input.anak) ? input.anak : [];

    if (!validateNoKk(noKk)) return showError('No KK harus 16 digit angka.');

    if (!kepala.nama.trim()) return showError('Nama Kepala Keluarga wajib diisi.');
    if (!validateNik(kepala.nik)) return showError('NIK Kepala Keluarga harus 16 digit angka.');
    if (!validateDate(kepala.tglLahir)) return showError('Tanggal lahir Kepala Keluarga tidak valid.');
    const ktgl = parseYmd(kepala.tglLahir)!;
    if (ktgl > new Date()) return showError('Tanggal lahir Kepala Keluarga tidak boleh di masa depan.');

    const istriFilled = !!istri && (istri.nama.trim() !== '' || istri.nik.trim() !== '' || istri.tglLahir !== '');
    if (istriFilled) {
      if (!istri!.nama.trim()) return showError('Nama Istri wajib diisi jika mengisi data istri.');
      if (!validateNik(istri!.nik)) return showError('NIK Istri harus 16 digit angka.');
      if (!validateDate(istri!.tglLahir)) return showError('Tanggal lahir Istri tidak valid.');
      const itgl = parseYmd(istri!.tglLahir)!;
      if (itgl > new Date()) return showError('Tanggal lahir Istri tidak boleh di masa depan.');
    } else {
      istri = undefined;
    }

    const anakClean = anak
      .filter(a => (a.nama?.trim() || a.nik?.trim() || a.tglLahir))
      .map(a => ({ nama: a.nama?.trim() ?? '', nik: a.nik ?? '', tglLahir: a.tglLahir ?? '' }));

    for (const [i, a] of anakClean.entries()) {
      if (!a.nama) return showError(`Nama Anak #${i + 1} wajib diisi.`);
      if (!validateNik(a.nik)) return showError(`NIK Anak #${i + 1} harus 16 digit angka.`);
      if (!validateDate(a.tglLahir)) return showError(`Tanggal lahir Anak #${i + 1} tidak valid.`);
      const bt = parseYmd(a.tglLahir)!;
      if (bt > new Date()) return showError(`Tanggal lahir Anak #${i + 1} tidak boleh di masa depan.`);
    }

    const newNikList = [kepala.nik, ...(istri ? [istri.nik] : []), ...anakClean.map(a => a.nik)];
    const dupLocal = findDuplicate(newNikList);
    if (dupLocal) return showError(`NIK duplikat di dalam input: ${dupLocal}`);

    const existingNiks = new Set(data.map(d => d.nik));
    const conflict = newNikList.find(n => existingNiks.has(n));
    if (conflict) return showError(`NIK sudah terdaftar: ${conflict}`);

    const docs: Array<Omit<Warga, 'id'>> = [];
    docs.push({
      nama: kepala.nama.trim(),
      nik: kepala.nik,
      noKk,
      tglLahir: kepala.tglLahir,
      peran: 'Kepala Keluarga',
      status: 'Menikah',
    });
    if (istri) {
      docs.push({
        nama: istri.nama.trim(),
        nik: istri.nik,
        noKk,
        tglLahir: istri.tglLahir,
        peran: 'Istri',
        status: 'Menikah',
      });
    }
    for (const a of anakClean) {
      docs.push({
        nama: a.nama.trim(),
        nik: a.nik,
        noKk,
        tglLahir: a.tglLahir,
        peran: 'Anak',
        status: 'Lajang',
      });
    }

    try {
      await Promise.all(
        docs.map(async (payload) => {
          const ref = await addDoc(collection(db, 'warga'), { ...payload, createdAt: serverTimestamp() });
          await logTransaksi('create', { ...payload, id: ref.id });
        })
      );
      setShowForm(false);
      showSuccess('Keluarga berhasil ditambahkan.');
    } catch (e: any) {
      showError('Gagal menyimpan keluarga: ' + (e?.message || e));
    }
  }

  async function addAnakToKK(noKk: string, child: { nama: string; nik: string; tglLahir: string }) {
    if (!validateNoKk(noKk)) return showError('No KK tidak valid.');
    if (!child.nama.trim()) return showError('Nama Anak wajib diisi.');
    if (!validateNik(child.nik)) return showError('NIK Anak harus 16 digit angka.');
    if (!validateDate(child.tglLahir)) return showError('Tanggal lahir Anak tidak valid.');
    const bt = parseYmd(child.tglLahir)!;
    if (bt > new Date()) return showError('Tanggal lahir Anak tidak boleh di masa depan.');

    const nikExists = data.some((x) => x.nik === child.nik);
    if (nikExists) return showError('NIK Anak sudah terdaftar.');

    try {
      const payload: Omit<Warga, 'id'> = {
        nama: child.nama.trim(),
        nik: child.nik,
        noKk,
        tglLahir: child.tglLahir,
        peran: 'Anak',
        status: 'Lajang',
      };
      const ref = await addDoc(collection(db, 'warga'), { ...payload, createdAt: serverTimestamp() });
      await logTransaksi('create', { ...payload, id: ref.id });
      showSuccess('Anak berhasil ditambahkan ke KK.');
    } catch (e: any) {
      showError('Gagal menambah anak: ' + (e?.message || e));
    }
  }

  async function removeWarga(row: Warga) {
    try {
      await deleteDoc(doc(db, 'warga', row.id));
      await logTransaksi('delete', row);
      setConfirmDelete(null);
      showSuccess('Warga berhasil dihapus.');
    } catch (e: any) {
      showError('Gagal menghapus: ' + (e?.message || e));
    }
  }

  function findDuplicate(arr: string[]) {
    const s = new Set<string>();
    for (const v of arr) {
      if (s.has(v)) return v;
      s.add(v);
    }
    return null;
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
          <h1>Daftar Warga</h1>
          <p className="sub">Berikut adalah tabel data warga Kp. Cikadu</p>
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
        editing ? (
          <WargaFormModal
            initial={editing ?? undefined}
            onClose={() => setShowForm(false)}
            onSubmit={(payload) => upsertWarga(payload, editing?.id)}
            onQuickAddChild={(child) => addAnakToKK(editing!.noKk, child)}
          />
        ) : (
          <KeluargaFormModal
            onClose={() => setShowForm(false)}
            onSubmit={(payload) => createKeluarga(payload)}
          />
        )
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

      {notice && (
        <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      )}

      <style jsx>{`
        .wrap { padding: 18px; display: grid; gap: 16px; }
        @media (max-width: 640px) { .wrap { padding: 12px; } }

        /* Header */
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

        .tableWrap { overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; }
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

function StatusBar({ label, value, total, color = '#3b82f6' }: { label: string; value: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <div className="barWrap">
      <div className="barLab">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="barTrack">
        <div className="barFill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <style jsx>{`
        .barWrap { display: grid; gap: 4px; }
        .barLab { display: flex; justify-content: space-between; align-items: center; color: #e5e7eb; font-size: .85rem; }
        .barTrack { width: 100%; height: 6px; background: rgba(255,255,255,.1); border-radius: 99px; overflow: hidden; }
        .barFill { height: 100%; transition: width .3s; }
      `}</style>
    </div>
  );
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; }) {
  return (
    <div className="pag">
      <div className="pagInfo">Hal {page} dari {totalPages} ({total} item)</div>
      <div className="pagBtns">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1}>«</button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}>»</button>
      </div>
      <style jsx>{`
        .pag { display: flex; align-items: center; justify-content: space-between; padding: 10px 6px 0; }
        .pagInfo { color: #9ca3af; font-size: .9rem; }
        .pagBtns { display: flex; gap: 6px; }
        .pagBtns button {
          width: 32px; height: 32px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
          color: #e5e7eb; border-radius: 8px;
        }
        .pagBtns button:disabled { opacity: .4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="spinWrap">
      <svg width="24" height="24" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" strokeWidth="1.6"><circle cx="12" cy="12" r="9.5" strokeOpacity=".3"/><path d="M12 2.5a9.5 9.5 0 0 1 0 19z"/></g>
      </svg>
      {label && <span>{label}</span>}
      <style jsx>{`
        .spinWrap { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #9ca3af; }
        svg { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* Icons */
const EyeIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const EditIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const TrashIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;

/* ================================================================================================
  MODAL COMPONENTS
================================================================================================ */

/* Base Modal */
function Modal({ children, onClose, title = 'Modal', width = 540 }: { children: React.ReactNode; onClose: () => void; title: string; width?: number; }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
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
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
          display: grid; place-items: center;
          padding: 16px;
          animation: fadeIn .15s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal {
          width: 100%;
          background: #1f2229; /* Slightly lighter than page bg */
          color: #e5e7eb;
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
          max-height: calc(90vh - 60px); /* 90vh - header height */
          overflow: auto;
        }
      `}</style>
    </div>
  );
}

/* Modal Detail */
function DetailModal({ warga, all, onClose, onEdit }: { warga: Warga; all: Warga[]; onClose: () => void; onEdit: () => void; }) {
  const { nama, nik, noKk, tglLahir, peran, status } = warga;
  const age = getAge(tglLahir);
  const kat = getKategoriUmur(age);

  const keluarga = useMemo(() => {
    const kk = all.find((w) => w.noKk === noKk && w.peran === 'Kepala Keluarga');
    const istri = all.find((w) => w.noKk === noKk && w.peran === 'Istri');
    const anak = all.filter((w) => w.noKk === noKk && w.peran === 'Anak').sort((a, b) => (parseYmd(a.tglLahir) as Date).getTime() - (parseYmd(b.tglLahir) as Date).getTime());
    return { kk, istri, anak };
  }, [all, noKk]);

  const stats = [
    { label: 'Nama', value: nama },
    { label: 'NIK', value: <code>{nik}</code> },
    { label: 'No KK', value: <code>{noKk}</code> },
    { label: 'Tanggal Lahir', value: tglLahir },
    { label: 'Umur', value: `${age} tahun` },
    { label: 'Kategori Umur', value: <Badge tone="violet">{kat}</Badge> },
    { label: 'Peran', value: <Badge>{peran}</Badge> },
    { label: 'Status', value: <Badge tone={status === 'Menikah' ? 'green' : status === 'Cerai' ? 'amber' : 'blue'}>{status}</Badge> },
  ];

  const total = (keluarga.kk ? 1 : 0) + (keluarga.istri ? 1 : 0) + keluarga.anak.length;

  return (
    <Modal onClose={onClose} title="Detail Warga">
      <div className="detailGrid">
        {stats.map(s => (
          <div key={s.label} className="stat">
            <span className="lbl">{s.label}</span>
            <span className="val">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="kkSection">
        <h3 className="subHead">Kartu Keluarga</h3>
        <div className="kkList">
          <div className="kkRow">
            <span className="lbl">Kepala Keluarga</span>
            <span className="val">{keluarga.kk ? (`${keluarga.kk.nama} ${keluarga.kk.nik}`) : '-'}</span>
          </div>
          <div className="kkRow">
            <span className="lbl">Istri</span>
            <span className="val">{keluarga.istri ? (`${keluarga.istri.nama} ${keluarga.istri.nik}`) : '-'}</span>
          </div>
          <div className="kkRow">
            <span className="lbl">Anak</span>
            <span className="val">{
              keluarga.anak.length === 0 ? '-' :
              keluarga.anak.map(a => `${a.nama} ${a.nik}`).join(', ')
            }</span>
          </div>
        </div>

        <div className="summaryBar">
          <div className="dots">
            <span title="Kepala (1)" style={{ background: '#22c55e' }} />
            <span title="Istri (1)" style={{ background: '#ec4899' }} />
            <span title={`Anak (${keluarga.anak.length})`} style={{ background: '#3b82f6' }} />
          </div>
          <div className="kkTot">Total: {total} orang</div>
        </div>

        <div className="members">
          {keluarga.kk && <button className="chip" onClick={onClose}>{keluarga.kk.nama} • Kepala Keluarga</button>}
          {keluarga.istri && <button className="chip" onClick={onClose}>{keluarga.istri.nama} • Istri</button>}
          {keluarga.anak.map(a => (
            <button key={a.id} className="chip" onClick={onClose}>{a.nama} • Anak</button>
          ))}
        </div>
      </div>

      <footer className="modalFoot">
        <button className="btn" onClick={onClose}>Tutup</button>
        <button className="btn primary" onClick={onEdit}>Edit Warga Ini</button>
      </footer>
      <style jsx>{`
        .detailGrid { display: grid; grid-template-columns: 140px 1fr; gap: 10px; }
        .stat { display: contents; } /* Make children align to grid */
        .stat .lbl { color: #9ca3af; }
        .stat .val { color: #e5e7eb; font-weight: 500; }
        .stat .val code { background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; }

        .kkSection {
          margin-top: 20px;
          border-top: 1px solid rgba(255,255,255,.12);
          padding-top: 16px;
        }
        .subHead { margin: 0 0 12px; font-size: 1rem; color: #a7f3d0; }
        
        .kkList { display: grid; gap: 8px; }
        .kkRow { display: grid; grid-template-columns: 140px 1fr; gap: 10px; }
        .kkRow .lbl { color: #9ca3af; }
        .kkRow .val { color: #e5e7eb; word-break: break-all; }

        .summaryBar { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
        .dots { display: flex; align-items: center; gap: 4px; }
        .dots span { width: 10px; height: 10px; border-radius: 99px; }
        .kkTot { color: #9ca3af; font-size: .9rem; }

        .members { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .chip {
          border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
          color: #e5e7eb; padding: 6px 10px; border-radius: 999px;
          cursor: default;
        }

        .modalFoot {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,.12);
          display: flex; justify-content: flex-end; gap: 10px;
        }
        .btn {
          background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
        .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
      `}</style>
    </Modal>
  );
}

/* Modal Form Warga (Edit) */
function WargaFormModal(
  { initial, onClose, onSubmit, onQuickAddChild }:
  { initial?: Warga; onClose: () => void; onSubmit: (w: Omit<Warga, 'id'>) => void; onQuickAddChild: (c: { nama: string; nik: string; tglLahir: string }) => void; }
) {
  const [w, setW] = useState(() => initial ? { ...initial } : {
    nama: '', nik: '', noKk: '', tglLahir: '', peran: 'Anak' as Peran, status: 'Lajang' as Status,
  });

  const [showAddAnak, setShowAddAnak] = useState(false);
  const [anak, setAnak] = useState({ nama: '', nik: '', tglLahir: '' });

  function setField<K extends keyof Warga>(field: K, value: Warga[K]) {
    setW(curr => ({ ...curr, [field]: value }));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(w);
  };
  
  const handleAddAnak = (e: React.FormEvent) => {
    e.preventDefault();
    onQuickAddChild(anak);
    setAnak({ nama: '', nik: '', tglLahir: '' }); // Reset form
    setShowAddAnak(false); // Sembunyikan form
  };

  const title = initial ? 'Edit Warga' : 'Tambah Warga';

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="formGrid">
        <div className="group full">
          <h4>Info Utama</h4>
          <div className="field">
            <label htmlFor="nama">Nama Lengkap</label>
            <input id="nama" value={w.nama} onChange={(e) => setField('nama', e.target.value)} placeholder="Nama" />
          </div>
          <div className="field">
            <label htmlFor="nik">NIK (16 digit)</label>
            <input id="nik" value={w.nik} onChange={(e) => setField('nik', e.target.value)} placeholder="320..." maxLength={16} />
          </div>
          <div className="field">
            <label htmlFor="noKk">No KK (16 digit)</label>
            <input id="noKk" value={w.noKk} onChange={(e) => setField('noKk', e.target.value)} placeholder="320..." maxLength={16} />
          </div>
          <div className="field">
            <label htmlFor="tglLahir">Tanggal Lahir</label>
            <input id="tglLahir" type="date" value={w.tglLahir} onChange={(e) => setField('tglLahir', e.target.value)} />
          </div>
        </div>

        <div className="group full">
          <h4>Status</h4>
          <div className="field">
            <label htmlFor="peran">Peran Keluarga</label>
            <select id="peran" value={w.peran} onChange={(e) => setField('peran', e.target.value as Peran)}>
              <option value="Kepala Keluarga">Kepala Keluarga</option>
              <option value="Istri">Istri</option>
              <option value="Anak">Anak</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status Pernikahan</label>
            <select id="status" value={w.status} onChange={(e) => setField('status', e.target.value as Status)}>
              <option value="Menikah">Menikah</option>
              <option value="Cerai">Cerai</option>
              <option value="Lajang">Lajang</option>
            </select>
          </div>
        </div>

        <footer className="modalFoot full">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary">Simpan</button>
        </footer>
      </form>
      
      {/* Quick Add Anak (hanya muncul jika mengedit KK/Istri) */}
      {initial && (w.peran === 'Kepala Keluarga' || w.peran === 'Istri') && (
        <div className="quickAdd">
          <button className="btn" onClick={() => setShowAddAnak(s => !s)}>
            {showAddAnak ? 'Batal Tambah Anak' : `+ Tambah Anak ke KK ${w.noKk}`}
          </button>
          
          {showAddAnak && (
            <form onSubmit={handleAddAnak} className="formGrid">
              <div className="field">
                <label htmlFor="anakNama">Nama Anak</label>
                <input id="anakNama" value={anak.nama} onChange={(e) => setAnak(a => ({...a, nama: e.target.value}))} placeholder="Nama" />
              </div>
              <div className="field">
                <label htmlFor="anakNik">NIK Anak (16 digit)</label>
                <input id="anakNik" value={anak.nik} onChange={(e) => setAnak(a => ({...a, nik: e.target.value}))} placeholder="320..." maxLength={16} />
              </div>
              <div className="field">
                <label htmlFor="anakTgl">Tgl Lahir Anak</label>
                <input id="anakTgl" type="date" value={anak.tglLahir} onChange={(e) => setAnak(a => ({...a, tglLahir: e.target.value}))} />
              </div>
              <footer className="modalFoot full">
                <button type="submit" className="btn primary">Simpan Anak</button>
              </footer>
            </form>
          )}
        </div>
      )}

      <style jsx>{`
        .formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; }
        .group { display: grid; gap: 10px; align-content: start; }
        .group h4 { margin: 0 0 4px; color: #a7f3d0; font-size: .9rem; }
        .full { grid-column: 1 / -1; }
        
        .field { display: grid; gap: 4px; }
        .field label { color: #9ca3af; font-size: .85rem; }
        .field input, .field select {
          background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 10px; border-radius: 8px;
        }

        .modalFoot {
          margin-top: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,.12);
          display: flex; justify-content: flex-end; gap: 10px;
        }
        .btn {
          background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
        .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
        
        .quickAdd {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px dashed rgba(255,255,255,.2);
          display: grid; gap: 12px;
        }
        .quickAdd .btn { background: #3b82f6; color: #fff; border: none; }
      `}</style>
    </Modal>
  );
}

/* Modal Form Keluarga (Create) */
function KeluargaFormModal(
  { onClose, onSubmit }:
  { onClose: () => void; onSubmit: (k: KeluargaInput) => void; }
) {
  const [noKk, setNoKk] = useState('');
  const [kepala, setKepala] = useState({ nama: '', nik: '', tglLahir: '' });
  const [istri, setIstri] = useState({ nama: '', nik: '', tglLahir: '' });
  const [anak, setAnak] = useState<Array<{ nama: string; nik: string; tglLahir: string }>>([]);

  const setK = (f: 'nama'|'nik'|'tglLahir', v: string) => setKepala(c => ({...c, [f]: v}));
  const setI = (f: 'nama'|'nik'|'tglLahir', v: string) => setIstri(c => ({...c, [f]: v}));
  const setA = (idx: number, f: 'nama'|'nik'|'tglLahir', v: string) => {
    setAnak(curr => curr.map((a, i) => i === idx ? {...a, [f]: v} : a));
  };
  const addAnak = () => setAnak(curr => [...curr, { nama: '', nik: '', tglLahir: '' }]);
  const removeAnak = (idx: number) => setAnak(curr => curr.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ noKk, kepala, istri, anak });
  };

  return (
    <Modal onClose={onClose} title="Tambah Keluarga Baru (KK)" width={720}>
      <form onSubmit={handleSubmit} className="formGrid">
        <div className="field full">
          <label htmlFor="noKk">No KK (16 digit)</label>
          <input id="noKk" value={noKk} onChange={(e) => setNoKk(e.target.value)} placeholder="320..." maxLength={16} />
        </div>
        
        {/* Kepala Keluarga */}
        <div className="group full head">
          <h4>Kepala Keluarga (Wajib)</h4>
          <div className="field">
            <label>Nama</label><input value={kepala.nama} onChange={e => setK('nama', e.target.value)} />
          </div>
          <div className="field">
            <label>NIK</label><input value={kepala.nik} onChange={e => setK('nik', e.target.value)} maxLength={16} />
          </div>
          <div className="field">
            <label>Tgl Lahir</label><input type="date" value={kepala.tglLahir} onChange={e => setK('tglLahir', e.target.value)} />
          </div>
        </div>
        
        {/* Istri */}
        <div className="group full">
          <h4>Istri (Opsional)</h4>
          <div className="field">
            <label>Nama</label><input value={istri.nama} onChange={e => setI('nama', e.target.value)} />
          </div>
          <div className="field">
            <label>NIK</label><input value={istri.nik} onChange={e => setI('nik', e.target.value)} maxLength={16} />
          </div>
          <div className="field">
            <label>Tgl Lahir</label><input type="date" value={istri.tglLahir} onChange={e => setI('tglLahir', e.target.value)} />
          </div>
        </div>
        
        {/* Anak */}
        <div className="group full">
          <h4>Anak (Opsional)</h4>
          {anak.map((a, idx) => (
            <div key={idx} className="group head">
              <div className="field">
                <label>Nama Anak #{idx + 1}</label><input value={a.nama} onChange={e => setA(idx, 'nama', e.target.value)} />
              </div>
              <div className="field">
                <label>NIK</label><input value={a.nik} onChange={e => setA(idx, 'nik', e.target.value)} maxLength={16} />
              </div>
              <div className="field">
                <label>Tgl Lahir</label><input type="date" value={a.tglLahir} onChange={e => setA(idx, 'tglLahir', e.target.value)} />
              </div>
              <button type="button" className="btn danger sm" onClick={() => removeAnak(idx)} title="Hapus anak"><TrashIcon /></button>
            </div>
          ))}
          <button type="button" className="btn" onClick={addAnak}>+ Tambah Anak</button>
        </div>

        <footer className="modalFoot full">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary">Simpan Keluarga</button>
        </footer>
      </form>
      <style jsx>{`
        .formGrid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .group { display: grid; gap: 10px; align-content: start; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); padding: 10px; }
        .group.head {
          display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end;
          background: rgba(255,255,255,.02);
        }
        .group h4 { margin: 0; color: #a7f3d0; font-size: .9rem; grid-column: 1 / -1; }
        .full { grid-column: 1 / -1; }
        
        .field { display: grid; gap: 4px; }
        .field label { color: #9ca3af; font-size: .85rem; }
        .field input, .field select {
          background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 10px; border-radius: 8px;
        }

        .modalFoot {
          margin-top: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,.12);
          display: flex; justify-content: flex-end; gap: 10px;
        }
        .btn {
          background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
        .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
        .btn.danger.sm {
          width: 36px; height: 36px; padding: 0; display: grid; place-items: center;
          border-color: rgba(239,68,68,.35); color: #fecaca;
        }
      `}</style>
    </Modal>
  );
}

/* Modal Konfirmasi Hapus */
function ConfirmModal(
  { title, message, onCancel, onConfirm }:
  { title: string; message: string; onCancel: () => void; onConfirm: () => void; }
) {
  return (
    <Modal onClose={onCancel} title={title} width={420}>
      <p style={{ margin: 0, color: '#e5e7eb', lineHeight: 1.6 }}>{message}</p>
      <footer className="modalFoot">
        <button type="button" className="btn" onClick={onCancel}>Batal</button>
        <button type="button" className="btn danger" onClick={onConfirm}>Ya, Hapus</button>
      </footer>
      <style jsx>{`
        .modalFoot {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,.12);
          display: flex; justify-content: flex-end; gap: 10px;
        }
        .btn {
          background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
        .btn.danger { background: #ef4444; color: #fff; border: none; font-weight: 700; }
      `}</style>
    </Modal>
  );
}

/* Modal Notifikasi */
function NoticeModal({ notice, onClose }: { notice: Notice; onClose: () => void; }) {
  const colors = {
    success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b',
  };
  const color = colors[notice.type] ?? colors.info;

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="notice" style={{ borderLeftColor: color }} onClick={onClose}>
      <strong className="noticeTitle" style={{ color }}>{notice.title ?? 'Notifikasi'}</strong>
      <p className="noticeMsg">{notice.message}</p>
      <button className="closeBtn" onClick={onClose}>×</button>
      <style jsx>{`
        .notice {
          position: fixed; top: 16px; right: 16px; z-index: 99;
          background: #1f2229; color: #e5e7eb;
          border: 1px solid rgba(255,255,255,.12);
          border-left-width: 4px;
          border-radius: 8px;
          padding: 12px 16px;
          width: 90%; max-width: 340px;
          box-shadow: 0 4px 12px rgba(0,0,0,.2);
          animation: slideIn .2s ease-out;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .noticeTitle { display: block; margin-bottom: 4px; font-size: 1rem; }
        .noticeMsg { margin: 0; font-size: .9rem; }
        .closeBtn {
          position: absolute; top: 4px; right: 4px;
          background: transparent; border: none; color: #9ca3af;
          font-size: 1.4rem; line-height: 1; width: 28px; height: 28px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}