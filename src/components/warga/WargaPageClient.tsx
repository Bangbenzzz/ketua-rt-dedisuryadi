// src/components/warga/WargaPageClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, setDoc, doc, deleteDoc, serverTimestamp, query as fq, orderBy } from 'firebase/firestore';

// Types, Hooks, & Utils
import type { Warga, WargaInput, KeluargaInput, Peran, Status, KategoriUmur } from '@/types/warga';
import { parseYmd, getAge, getKategoriUmur, validateNik, validateNoKk, validateDate } from '@/utils/date';
import { pad2, formatAlamatLengkap } from '@/utils/address';
import usePagination from '@/hooks/usePagination';
import useDebounce from '@/hooks/useDebounce';

// Common Components
import Badge from '@/components/common/Badge';
import StatusBar from '@/components/common/StatusBar';
import Pagination from '@/components/common/Pagination';
import { Spinner } from '@/components/Spinner';
import { EyeIcon, EditIcon, TrashIcon } from '@/components/common/Icons';

// Modal Components
import PasswordGate from '@/components/warga/PasswordGate';
const DetailModal = dynamic(() => import('@/components/warga/modals/DetailModal'), { ssr: false });
const AddChoiceModal = dynamic(() => import('@/components/warga/modals/AddChoiceModal'), { ssr: false });
const ConfirmModal = dynamic(() => import('@/components/warga/modals/ConfirmModal'), { ssr: false });
const NoticeModal = dynamic(() => import('@/components/warga/modals/NoticeModal'), { ssr: false });
const WargaFormModal = dynamic(() => import('@/components/warga/modals/WargaFormModal'), { ssr: false, loading: () => <p>Memuat form...</p> });
const KeluargaFormModal = dynamic(() => import('@/components/warga/modals/KeluargaFormModal'), { ssr: false, loading: () => <p>Memuat form...</p> });

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; title?: string; message: string };

export default function WargaPageClient() {
  const [data, setData] = useState<Warga[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(false);
  const handleAuthSuccess = () => setAuthed(true);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
  const [kategoriFilter, setKategoriFilter] = useState<'All' | KategoriUmur>('All');
  const [pageSize, setPageSize] = useState(10);
  const debouncedQuery = useDebounce(query, 400);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Warga | null>(null);
  const [showDetail, setShowDetail] = useState<Warga | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Warga | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showAddChoiceModal, setShowAddChoiceModal] = useState(false);
  const [addMode, setAddMode] = useState<'family' | 'single'>('family');
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  
  const [selectedFamily, setSelectedFamily] = useState<Warga[] | null>(null);

  const showError = (message: string, title = 'Gagal') => setNotice({ type: 'error', title, message });
  const showSuccess = (message: string, title = 'Berhasil') => setNotice({ type: 'success', title, message });

  useEffect(() => {
    const qCol = fq(collection(db, 'warga'), orderBy('nama'));
    const unsub = onSnapshot(qCol, (snap) => {
      const arr: Warga[] = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: d.id,
          nama: v.nama ?? '', nik: v.nik ?? '', noKk: v.noKk ?? '', tglLahir: v.tglLahir ?? '2000-01-01',
          peran: v.peran ?? 'Anak', status: v.status ?? 'Lajang', alamat: v.alamat ?? 'Kp. Cikadu',
          rt: pad2(v.rt ?? '02'), rw: pad2(v.rw ?? '19'), pekerjaan: v.pekerjaan ?? '',
          jenisKelamin: v.jenisKelamin ?? 'Laki-laki', tempatLahir: v.tempatLahir ?? '',
          agama: v.agama ?? 'Islam', pendidikan: v.pendidikan ?? 'SMA/Sederajat',
        };
      });
      setData(arr);
      setLoaded(true);
    }, (err) => { console.error('Gagal subscribe warga:', err); setLoaded(true); });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (/^\d{16}$/.test(q)) {
      const family = data.filter(w => w.noKk === q);
      if (family.length > 0) {
        family.sort((a, b) => {
            const peranOrder: Record<string, number> = { "Kepala Keluarga": 1, "Istri": 2, "Anak": 3 };
            return (peranOrder[a.peran] || 4) - (peranOrder[b.peran] || 4);
        });
        setSelectedFamily(family);
        return [];
      }
    }
    setSelectedFamily(null);
    return data.filter((w) => {
      const qMatch = q === '' || w.nama.toLowerCase().includes(q) || w.nik.includes(q);
      const stMatch = statusFilter === 'All' || w.status === statusFilter;
      const age = getAge(w.tglLahir);
      const kat = getKategoriUmur(age);
      const katMatch = kategoriFilter === 'All' || kat === kategoriFilter;
      return qMatch && stMatch && katMatch;
    });
  }, [data, debouncedQuery, statusFilter, kategoriFilter]);
  
  const familyChartData = useMemo(() => {
    if (!selectedFamily) return null;
    const composition: { [key in Peran]?: number } = { 'Kepala Keluarga': 0, 'Istri': 0, 'Anak': 0 };
    selectedFamily.forEach(member => {
      if (composition.hasOwnProperty(member.peran)) {
        composition[member.peran]!++;
      }
    });
    return composition;
  }, [selectedFamily]);

  const { page, setPage, total, totalPages, pageItems } = usePagination(filtered, pageSize);

  async function upsertWarga(input: WargaInput, editingId?: string) {
    if (!input.nama.trim() || !input.pekerjaan.trim() || !input.tempatLahir.trim()) return showError('Nama, Pekerjaan, dan Tempat Lahir wajib diisi.');
    if (!validateNik(input.nik) || !validateNoKk(input.noKk)) return showError('NIK dan No KK harus 16 digit angka.');
    if (!validateDate(input.tglLahir)) return showError('Tanggal lahir tidak valid.');
    const nikExists = data.some((x) => x.nik === input.nik && x.id !== editingId);
    if (nikExists) return showError('NIK sudah terdaftar.');
    
    const payload: WargaInput = { ...input, rt: pad2(input.rt), rw: pad2(input.rw) };
    try {
      if (editingId) {
        await setDoc(doc(db, 'warga', editingId), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        await addDoc(collection(db, 'warga'), { ...payload, createdAt: serverTimestamp() });
      }
      setShowForm(false); setEditing(null);
      showSuccess('Data warga berhasil disimpan.');
    } catch (e: any) { showError('Gagal menyimpan: ' + (e?.message || e)); }
  }

  async function createKeluarga(input: KeluargaInput) {
    const { noKk, alamat, rt, rw, kepala, istri, anak } = input;
    if (!validateNoKk(noKk)) return showError('No. KK harus 16 digit.');
    if (!kepala.nama || !kepala.nik || !kepala.tempatLahir || !kepala.pekerjaan) return showError('Data Kepala Keluarga tidak lengkap.');

    const allMembers = [kepala, ...(istri && istri.nama ? [istri] : []), ...anak];
    const allNiks = allMembers.map(m => m.nik).filter(Boolean);

    if (new Set(allNiks).size !== allNiks.length) return showError('Ada NIK duplikat di dalam form.');
    
    const nikExists = data.some(w => allNiks.includes(w.nik));
    if (nikExists) return showError('Satu atau lebih NIK sudah terdaftar.');

    try {
      const batch: Promise<any>[] = [];

      const payloadKepala: WargaInput = { ...kepala, noKk, alamat, rt, rw, peran: 'Kepala Keluarga', status: 'Menikah' };
      batch.push(addDoc(collection(db, 'warga'), { ...payloadKepala, createdAt: serverTimestamp() }));
      
      if (istri && istri.nama) {
        const payloadIstri: WargaInput = { ...istri, noKk, alamat, rt, rw, peran: 'Istri', status: 'Menikah' };
        batch.push(addDoc(collection(db, 'warga'), { ...payloadIstri, createdAt: serverTimestamp() }));
      }

      anak.forEach(a => {
        if (a.nama) {
          const payloadAnak: WargaInput = { ...a, noKk, alamat, rt, rw, peran: 'Anak', status: 'Lajang' };
          batch.push(addDoc(collection(db, 'warga'), { ...payloadAnak, createdAt: serverTimestamp() }));
        }
      });

      await Promise.all(batch);
      setShowForm(false);
      showSuccess('Keluarga baru berhasil ditambahkan.');
    } catch (e: any) {
      showError('Gagal menyimpan keluarga: ' + (e?.message || e));
    }
  }

  async function removeWarga(warga: Warga) {
    try {
      await deleteDoc(doc(db, 'warga', warga.id));
      setConfirmDelete(null);
      showSuccess('Data warga berhasil dihapus.');
    } catch (e: any) { showError('Gagal menghapus: ' + (e?.message || e)); }
  }

  if (!loaded) return <div className="pageLoader"><Spinner label="Memuat data..." /></div>;
  if (!authed) return <PasswordGate onSuccess={handleAuthSuccess} />;

  return (
    <div className="wrap">
      <header className="head">
        <div className="title"><h2>DATA WARGA KP. CIKADU</h2><p className="sub">Pencarian, filter, dan manajemen data warga</p></div>
        <div className="headActions">
          <a className="btn dashboard" href="/dashboard">← Dashboard</a>
          <button className="btn primary" onClick={() => setShowAddChoiceModal(true)}>+ Tambah Warga</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="left">
          <div className="search"><input placeholder="Cari Nama / NIK / No. KK" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="filter">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}><option value="All">Semua</option><option value="Menikah">Menikah</option><option value="Cerai">Cerai</option><option value="Lajang">Lajang</option></select>
          </div>
          <div className="filter">
            <label>Usia</label>
            <select value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value as any)}><option value="All">Semua</option><option value="Balita">Balita</option><option value="Anak-anak">Anak</option><option value="Remaja">Remaja</option><option value="Dewasa">Dewasa</option><option value="Lansia">Lansia</option></select>
          </div>
        </div>
        <div className="right">
          <label>Tampil</label>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
        </div>
      </section>

      {selectedFamily ? (
        <div className="card">
          <div className="cardHeader">Detail Keluarga - No. KK: <code>{selectedFamily[0].noKk}</code></div>
          <div className="family-detail-grid">
            <div className="family-chart">
              <h4>Komposisi Keluarga</h4>
              {familyChartData && (
                <div className="chart-bars">
                  {Object.entries(familyChartData).map(([peran, jumlah]) => (
                    <div className="bar-item" key={peran}>
                      <div className="bar-label">{peran}</div>
                      <div className="bar-wrapper">
                        <div className={`bar-fill ${peran.toLowerCase().replace(/ /g, '-')}`} style={{ width: `${Math.max(5, (jumlah || 0) * 25)}%` }}>
                          <span>{jumlah}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="family-members">
              <h4>Anggota Keluarga ({selectedFamily.length} orang)</h4>
              <ul>
                {selectedFamily.map(member => (
                  <li key={member.id}>
                    <div className="member-info"><span className="member-name">{member.nama}</span><span className="member-role">{member.peran}</span></div>
                    <code className="member-nik">NIK: {member.nik}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="cardHeader">Menampilkan {pageItems.length} dari {total} total warga</div>
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr><th>No</th><th>Nama Lengkap</th><th>NIK</th><th>Jenis Kelamin</th><th>Tempat, Tgl Lahir</th><th>Agama</th><th>Pendidikan</th><th>Pekerjaan</th><th className="actionsCol">Aksi</th></tr>
              </thead>
              <tbody>
                {pageItems.map((w, index) => (
                  <tr key={w.id}>
                    <td data-label="No">{(page - 1) * pageSize + index + 1}</td>
                    <td data-label="Nama"><button className="link" onClick={() => setShowDetail(w)}>{w.nama}</button></td>
                    <td data-label="NIK"><code>{w.nik}</code></td>
                    <td data-label="Jenis Kelamin">{w.jenisKelamin}</td>
                    <td data-label="Lahir">{w.tempatLahir}, {new Date(w.tglLahir).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                    <td data-label="Agama">{w.agama}</td>
                    <td data-label="Pendidikan">{w.pendidikan}</td>
                    <td data-label="Pekerjaan">{w.pekerjaan}</td>
                    <td data-label="Aksi" className="actionsCol">
                      <div className="rowActions">
                        <button className="btn sm" onClick={() => setShowDetail(w)}><EyeIcon /></button>
                        <button className="btn sm" onClick={() => { setEditing(w); setShowForm(true); }}><EditIcon /></button>
                        <button className="btn sm danger" onClick={() => setConfirmDelete(w)}><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pageItems.length === 0 && (<tr><td colSpan={9} className="empty">Tidak ada data warga.</td></tr>)}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      )}

      {showForm && (addMode === 'family' ? 
        <KeluargaFormModal onClose={() => setShowForm(false)} onSubmit={(payload) => createKeluarga(payload)} />
        :
        <WargaFormModal initial={editing ?? undefined} onClose={() => { setShowForm(false); setEditing(null); }} onSubmit={(payload) => upsertWarga(payload, editing?.id)} onQuickAddChild={() => {}} />
      )}
      {showAddChoiceModal && <AddChoiceModal onClose={() => setShowAddChoiceModal(false)} onSelectSingle={() => { setAddMode('single'); setEditing(null); setShowForm(true); setShowAddChoiceModal(false); }} onSelectFamily={() => { setAddMode('family'); setEditing(null); setShowForm(true); setShowAddChoiceModal(false); }} />}
      {showDetail && <DetailModal warga={showDetail} onClose={() => setShowDetail(null)} onEdit={() => { setEditing(showDetail); setShowForm(true); setShowDetail(null); }} />}
      {confirmDelete && <ConfirmModal title="Hapus Warga" message={`Yakin ingin menghapus data ${confirmDelete.nama}?`} onCancel={() => setConfirmDelete(null)} onConfirm={() => removeWarga(confirmDelete)} />}
      {isMounted && notice && createPortal(<NoticeModal notice={notice} onClose={() => setNotice(null)} />, document.body)}

      <style jsx>{`
        .wrap { max-width: 1240px; margin: 0 auto; padding: 24px; display: grid; gap: 24px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
        .title h2 { margin: 0; font-size: 1.5rem; color: #e5e7eb; } .title .sub { margin: 4px 0 0; color: #9ca3af; }
        .headActions { display: flex; gap: 10px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 16px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn.dashboard { background-color: #3b82f6; color: white; } .btn.primary { background-color: #22c55e; color: white; }
        .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 12px; border-radius: 12px; background: rgba(255,255,255, 0.03); border: 1px solid rgba(255,255,255, 0.1); }
        .toolbar .left, .toolbar .right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .search, .filter { display: flex; align-items: center; gap: 8px; flex-grow: 1; }
        .search input, .filter select { background: rgba(255,255,255, 0.05); border: 1px solid rgba(255,255,255, 0.15); border-radius: 8px; padding: 8px 12px; color: #e5e7eb; width: 100%; }
        .filter label { color: #9ca3af; font-size: 0.875rem; white-space: nowrap; }
        .card { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(255,255,255, 0.03); overflow: hidden; }
        .cardHeader { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.12); font-size: 0.9rem; color: #9ca3af; }
        .tableWrap { overflow-x: auto; }
        table.tbl { width: 100%; border-collapse: collapse; }
        .tbl th, .tbl td { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255, 0.08); text-align: left; white-space: nowrap; font-size: 0.875rem; }
        .tbl tr:last-child td { border-bottom: none; }
        .tbl th { color: #a7f3d0; text-transform: uppercase; font-size: 0.75rem; position: sticky; top: 0; background: #111827; }
        .actionsCol { width: 150px; }
        .rowActions { display: flex; gap: 8px; justify-content: flex-end; }
        .btn.sm { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; background: rgba(255,255,255, 0.08); border: 1px solid rgba(255,255,255, 0.15); color: #d1d5db; border-radius: 8px; }
        .btn.sm.danger { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5; }
        .empty { text-align: center; padding: 32px; color: #9ca3af; }
        .link { background: none; border: none; color: #93c5fd; cursor: pointer; padding: 0; font-weight: 500; }
        .family-detail-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 24px; padding: 16px; }
        .family-chart h4, .family-members h4 { margin: 0 0 16px 0; color: #e5e7eb; font-size: 1.1rem; }
        .chart-bars { display: grid; gap: 12px; }
        .bar-item { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 12px; }
        .bar-label { font-size: 0.9rem; color: #cbd5e1; }
        .bar-wrapper { width: 100%; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
        .bar-fill { height: 28px; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; color: white; font-weight: 600; border-radius: 4px; transition: width 0.5s ease-out; }
        .bar-fill span { font-size: 0.8rem; }
        .bar-fill.kepala-keluarga { background-color: #22c55e; } .bar-fill.istri { background-color: #ec4899; } .bar-fill.anak { background-color: #3b82f6; }
        .family-members ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
        .family-members li { background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border-left: 3px solid #3b82f6; }
        .member-info { display: flex; justify-content: space-between; align-items: center; }
        .member-name { font-weight: 600; } .member-role { font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 99px; }
        .member-nik { display: block; margin-top: 8px; font-size: 0.8rem; color: #9ca3af; }
        @media (max-width: 900px) {
          .tableWrap { overflow: visible; } .tbl, .tbl tbody, .tbl tr { display: block; width: 100%; } .tbl thead { display: none; }
          .tbl tr { border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; margin-bottom: 1rem; padding: 1rem; }
          .tbl td { display: grid; grid-template-columns: 110px 1fr; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); text-align: left; white-space: normal; }
          .tbl tr td:last-child { border-bottom: none; }
          .tbl td::before { content: attr(data-label); font-weight: 600; color: #9ca3af; }
          .tbl td.actionsCol { grid-template-columns: 1fr; } .tbl td.actionsCol::before { display: none; }
          .rowActions { justify-content: flex-start; }
          .family-detail-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .wrap { padding: 16px; } .head { flex-direction: column; align-items: stretch; text-align: center; }
        }
      `}</style>
    </div>
  );
}