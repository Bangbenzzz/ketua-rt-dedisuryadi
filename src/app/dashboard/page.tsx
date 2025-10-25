// src/app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import type { FirebaseError } from 'firebase/app';
import { Spinner, FullscreenSpinner } from '@/components/Spinner';
import Sidebar from '@/components/Sidebar';
import DualLineTicker from '@/components/DualLineTicker';

type Transaksi = {
  id: string;
  uid: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  nominal: number;
  keterangan: string;
  tanggal: string; // ISO
  createdAt?: string;
};

const ITEMS_PER_PAGE = 10;

// Format Rupiah penuh (tooltip/export)
function formatIDR(n: number) {
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}
// Format pendek (rb, jt, M, T, P, E)
function formatShort(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const fmt = (v: number, s: string) => {
    const num = v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '');
    return `${sign}${num}${s}`;
  };
  if (a >= 1e18) return fmt(a / 1e18, 'E');
  if (a >= 1e15) return fmt(a / 1e15, 'P');
  if (a >= 1e12) return fmt(a / 1e12, 'T');
  if (a >= 1e9)  return fmt(a / 1e9, 'M');
  if (a >= 1e6)  return fmt(a / 1e6, 'jt');
  if (a >= 1e3)  return `${sign}${Math.round(a / 1e3)}rb`;
  return `${sign}${a}`;
}
function formatIDRCompact(n: number) { return `Rp ${formatShort(n)}`; }
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateLong(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatWIBTimestamp() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
function fileTimestampWIB() {
  const now = new Date();
  const jkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${jkt.getFullYear()}${p(jkt.getMonth()+1)}${p(jkt.getDate())}_${p(jkt.getHours())}${p(jkt.getMinutes())}${p(jkt.getSeconds())}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [sbOpen, setSbOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Transaksi[]>([]);
  const [page, setPage] = useState(1);

  // Modal logout
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Modal hapus
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Export status
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);

  // Rentang hari grafik
  const [range, setRange] = useState<7 | 14 | 30>(14);

  // Auth gate
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace('/login');
      else setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  const loadTransaksi = useCallback(async (u: User) => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const q = query(collection(db, 'transaksi'), where('uid', '==', u.uid));
      const snap = await getDocs(q);
      const list: Transaksi[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaksi, 'id'>) }));
      list.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
      setData(list);
      setPage(1);
    } catch (err) {
      console.error('Fetch transaksi error:', err);
      const e = err as Partial<FirebaseError> & { code?: string };
      if (e?.code === 'permission-denied') setLoadError('Akses ditolak oleh aturan Firestore.');
      else if (e?.code === 'failed-precondition') setLoadError('Firestore belum diaktifkan.');
      else if (e?.code === 'unavailable') setLoadError('Layanan Firestore tidak tersedia. Coba lagi.');
      else setLoadError(`Gagal memuat data transaksi${e?.code ? ` (${e.code})` : ''}.`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { if (user) loadTransaksi(user); }, [user, loadTransaksi]);

  const { pemasukan, pengeluaran, sisa } = useMemo(() => {
    const masuk = data.filter((x) => x.jenis === 'Pemasukan').reduce((a, b) => a + (b.nominal || 0), 0);
    const keluar = data.filter((x) => x.jenis === 'Pengeluaran').reduce((a, b) => a + (b.nominal || 0), 0);
    return { pemasukan: masuk, pengeluaran: keluar, sisa: masuk - keluar };
  }, [data]);

  const totalPages = Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE));
  const paged = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return data.slice(start, start + ITEMS_PER_PAGE);
  }, [data, page]);

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    try {
      if (data.length === 0) { alert('Belum ada data untuk diekspor.'); return; }
      setExporting('pdf');

      const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const autoTable = (autoTableModule as any).default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      const margin = 40;
      const pageSize: any = (doc as any).internal.pageSize;
      const pageWidth = (pageSize?.getWidth?.() as number) ?? (pageSize?.width as number) ?? 595;
      const pageHeight = (pageSize?.getHeight?.() as number) ?? (pageSize?.height as number) ?? 842;

      const title = 'Riwayat Transaksi Keuangan Kp. Cikadu RT. 06';
      const tglExp = `Tanggal ekspor: ${formatWIBTimestamp()} WIB`;

      doc.setDrawColor(16, 163, 74);
      doc.rect(margin, margin, pageWidth - margin * 2, 54);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(16, 163, 74);
      doc.text(title, pageWidth / 2, margin + 22, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(55, 65, 81);
      doc.text(tglExp, pageWidth / 2, margin + 40, { align: 'center' });

      const rows = data.map((t, i) => ([
        String(i + 1),
        formatDateLong(t.tanggal),
        t.jenis,
        t.keterangan || '-',
        `${t.jenis === 'Pemasukan' ? '+' : '-'} ${formatIDR(t.nominal)}`,
      ]));

      autoTable(doc as any, {
        startY: margin + 70,
        head: [['No', 'Tanggal', 'Jenis', 'Keterangan', 'Nominal']],
        body: rows,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [220, 220, 220] },
        headStyles: { fillColor: [16, 163, 74], textColor: [255, 255, 255], halign: 'center' },
        columnStyles: {
          0: { cellWidth: 30, halign: 'center' },
          1: { cellWidth: 110 },
          2: { cellWidth: 90, halign: 'center' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 110, halign: 'right' },
        },
        didDrawPage: (ctx: any) => {
          const totalPages = (doc as any).getNumberOfPages?.() ?? 1;
          doc.setFontSize(9); doc.setTextColor(150);
          doc.text(`Halaman ${ctx.pageNumber} / ${totalPages}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? (margin + 70);
      const boxY = finalY + 14; const boxH = 36; const boxW = pageWidth - margin * 2;

      doc.setDrawColor(16, 163, 74); doc.setFillColor(220, 252, 231);
      doc.rect(margin, boxY, boxW, boxH, 'DF');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(13, 148, 136);
      doc.text('Sisa Saldo', margin + 12, boxY + 22);

      const sisaStr = sisa >= 0 ? formatIDR(sisa) : `- ${formatIDR(Math.abs(sisa))}`;
      const valColor = sisa < 0 ? [239, 68, 68] : [34, 197, 94];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(valColor[0], valColor[1], valColor[2]);
      doc.text(sisaStr, margin + boxW - 12, boxY + 22, { align: 'right' });

      doc.save(`riwayat-transaksi_Kp-Cikadu-RT06_${fileTimestampWIB()}_WIB.pdf`);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor PDF. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

  // Export Excel
  const handleExportExcel = useCallback(async () => {
    try {
      if (data.length === 0) { alert('Belum ada data untuk diekspor.'); return; }
      setExporting('excel');

      const XLSXMod = await import('xlsx');
      const XLSX: any = (XLSXMod as any).default || XLSXMod;

      const rows = data.map((t, i) => ([
        i + 1,
        formatDateLong(t.tanggal),
        t.jenis,
        t.keterangan || '-',
        t.jenis === 'Pemasukan' ? t.nominal : -t.nominal,
      ]));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['No', 'Tanggal', 'Jenis', 'Keterangan', 'Nominal'],
        ...rows,
        [],
        ['', '', '', 'Sisa Saldo', sisa],
      ]);

      ws['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 15 },
        { wch: 50 },
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Riwayat');
      XLSX.writeFile(wb, `riwayat-transaksi_Kp-Cikadu-RT06_${fileTimestampWIB()}_WIB.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor Excel. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

  // Early return SETELAH semua hooks
  if (loadingAuth) return <FullscreenSpinner />;

  // Non-hook handlers
  const openDeleteConfirm = (id: string) => setDeleteId(id);
  const closeDeleteConfirm = () => { if (!deleting) setDeleteId(null); };
  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'transaksi', deleteId));
      setData((prev) => prev.filter((t) => t.id !== deleteId));
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus transaksi.');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };
  const closeLogoutConfirm = () => { if (!loggingOut) setShowLogoutConfirm(false); };
  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try { await signOut(auth); router.replace('/login'); }
    catch (e) { console.error(e); alert('Gagal logout. Coba lagi.'); }
    finally { setLoggingOut(false); setShowLogoutConfirm(false); }
  };

  return (
    <main className="page">
      <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} />
      <div className="bgDecor" aria-hidden />

      {/* Topbar */}
      <header className="topbar">
        <button className="btn btn--icon hamburger" aria-label="Buka menu" onClick={() => setSbOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
        <div className="brand"><span className="dot" />Dedi Suryadi</div>
        <button className="btn btn--delete" onClick={() => setShowLogoutConfirm(true)}>Keluar</button>
      </header>

      <section className="container">
        {/* Ringkasan */}
        <div className="gridStats">
          <div className="card"><div className="cardTitle">Pemasukan</div><div className="amount green" title={formatIDR(pemasukan)}>{formatIDRCompact(pemasukan)}</div></div>
          <div className="card"><div className="cardTitle">Pengeluaran</div><div className="amount red" title={formatIDR(pengeluaran)}>{formatIDRCompact(pengeluaran)}</div></div>
          <div className="card"><div className="cardTitle">Sisa Saldo</div><div className="amount" title={formatIDR(sisa)}>{sisa === 0 ? 'Rp 0' : formatIDRCompact(sisa)}</div></div>
        </div>

        {/* Grafik dua garis (smooth, saling silang) */}
        <div className="card chartCard">
          <div className="chartHead">
            <div className="cardTitle">Grafik Pemasukan vs Pengeluaran (bergerak)</div>
            <div className="rangeChips" role="tablist" aria-label="Rentang data">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={range === d}
                  className={`chip ${range === d ? 'active' : ''}`}
                  onClick={() => setRange(d as 7 | 14 | 30)}
                >
                  {d}H
                </button>
              ))}
            </div>
          </div>
          {loadingData ? (
            <div className="center"><Spinner size={28} /></div>
          ) : (
            <DualLineTicker data={data} range={range} height={240} loopMs={8000} />
          )}
          <div className="legend">
            <div className="legendItem"><span className="legendDot legendIn" /> Pemasukan</div>
            <div className="legendItem"><span className="legendDot legendOut" /> Pengeluaran</div>
          </div>
        </div>

        {/* Actions */}
        <div className="actions">
          <Link href="/dashboard/transaksi/tambah" className="btn btn--add">+ Tambah Transaksi</Link>
        </div>

        {/* Riwayat */}
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">Riwayat Transaksi</div>
            <div className="exportBtns">
              <button
                className="btn btn--mini btn--excel"
                onClick={handleExportExcel}
                disabled={loadingData || data.length === 0 || exporting === 'excel' || exporting === 'pdf'}
                aria-label="Export Excel"
                title="Export Excel"
              >
                <span className="icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 2H8a2 2 0 0 0-2 2v3H5a2 2 0 0 0-2 2v9.5A3.5 3.5 0 0 0 6.5 22H19a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-4.6 14.2l-1.7-2.6l-1.7 2.6H8.2l2.5-3.7L8.4 9h2l1.3 2l1.3-2h2l-2.3 3.5l2.5 3.7zM6.5 20A1.5 1.5 0 0 1 5 18.5V9h1v9a2 2 0 0 0 2 2z"/></svg>
                </span>
                {exporting === 'excel' ? 'Mengekspor…' : 'Excel'}
              </button>
              <button
                className="btn btn--mini btn--pdf"
                onClick={handleExportPDF}
                disabled={loadingData || data.length === 0 || exporting === 'excel' || exporting === 'pdf'}
                aria-label="Export PDF"
                title="Export PDF"
              >
                <span className="icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v14.5A3.5 3.5 0 0 0 7.5 22H18a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM9 13H7v5H5v-7h4zm2-2h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1v2h-2zm2 3h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1z"/></svg>
                </span>
                {exporting === 'pdf' ? 'Mengekspor…' : 'PDF'}
              </button>
            </div>
          </div>

          {loadError && (
            <div className="errorBox">
              <div>{loadError}</div>
              <button className="btn btn--mini btn--edit" onClick={() => user && loadTransaksi(user)}>Coba lagi</button>
            </div>
          )}

          {loadingData ? (
            <div className="center" style={{ padding: 14 }}><Spinner /></div>
          ) : (
            <>
              {/* Desktop */}
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Jenis</th>
                      <th>Keterangan</th>
                      <th>Nominal</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((t) => (
                      <tr key={t.id}>
                        <td>{formatDate(t.tanggal)}</td>
                        <td><span className={`pill ${t.jenis === 'Pemasukan' ? 'pillGreen' : 'pillRed'}`}>{t.jenis}</span></td>
                        <td className="truncate">{t.keterangan}</td>
                        <td className={t.jenis === 'Pemasukan' ? 'green' : 'red'}>
                          {t.jenis === 'Pemasukan' ? '+' : '-'} {formatIDR(t.nominal)}
                        </td>
                        <td className="actionsCell">
                          <Link href={`/dashboard/transaksi/edit/${t.id}`} className="btn btn--mini btn--edit">Edit</Link>
                          <button className="btn btn--mini btn--delete" onClick={() => openDeleteConfirm(t.id)}>Hapus</button>
                        </td>
                      </tr>
                    ))}
                    {paged.length === 0 && (<tr><td colSpan={5} className="muted">Belum ada transaksi.</td></tr>)}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="listMobile">
                {paged.map((t) => (
                  <div key={t.id} className="mItem">
                    <div className="mRow"><span className="mLabel">Tanggal</span><span className="mVal">{formatDate(t.tanggal)}</span></div>
                    <div className="mRow"><span className="mLabel">Jenis</span><span className={`mVal pill ${t.jenis === 'Pemasukan' ? 'pillGreen' : 'pillRed'}`}>{t.jenis}</span></div>
                    <div className="mRow"><span className="mLabel">Keterangan</span><span className="mVal">{t.keterangan || '-'}</span></div>
                    <div className="mRow"><span className="mLabel">Nominal</span><span className={`mVal ${t.jenis === 'Pemasukan' ? 'green' : 'red'}`}>{t.jenis === 'Pemasukan' ? '+' : '-'} {formatIDR(t.nominal)}</span></div>
                    <div className="mActions">
                      <Link href={`/dashboard/transaksi/edit/${t.id}`} className="btn btn--mini btn--edit">Edit</Link>
                      <button className="btn btn--mini btn--delete" onClick={() => openDeleteConfirm(t.id)}>Hapus</button>
                    </div>
                  </div>
                ))}
                {paged.length === 0 && <div className="muted">Belum ada transaksi.</div>}
              </div>

              {/* Pagination */}
              <div className="pagination">
                <button className="btn btn--mini btn--edit" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <span className="onlyWide">‹ Sebelumnya</span><span className="onlyNarrow">‹</span>
                </button>
                <div className="pages">Halaman {page} dari {totalPages}</div>
                <button className="btn btn--mini btn--edit" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <span className="onlyWide">Berikutnya ›</span><span className="onlyNarrow">›</span>
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Modal Logout */}
      {showLogoutConfirm && (
        <div className="modalBackdrop" onClick={(e) => { if (e.currentTarget === e.target) closeLogoutConfirm(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-desc">
            <div className="modalHeader">
              <div className="warnIcon" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                  <path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </div>
              <h3 id="logout-title" className="modalTitle">Keluar dari akun?</h3>
            </div>
            <p id="logout-desc" className="modalDesc">Anda yakin ingin keluar? Anda akan kembali ke halaman login.</p>
            <div className="modalActions">
              <button className="btn btn--ghost" onClick={closeLogoutConfirm} disabled={loggingOut}>Batal</button>
              <button className="btn btn--delete" onClick={handleConfirmLogout} disabled={loggingOut}>
                {loggingOut ? 'Keluar…' : 'Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hapus */}
      {deleteId && (
        <div className="modalBackdrop" onClick={(e) => { if (e.currentTarget === e.target) closeDeleteConfirm(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc">
            <div className="modalHeader">
              <div className="warnIcon" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                  <path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </div>
              <h3 id="del-title" className="modalTitle">Hapus transaksi?</h3>
            </div>
            <p id="del-desc" className="modalDesc">Tindakan ini tidak dapat dibatalkan. Data akan dihapus permanen.</p>
            <div className="modalActions">
              <button className="btn btn--ghost" onClick={closeDeleteConfirm} disabled={deleting}>Batal</button>
              <button className="btn btn--delete" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { --sbw: 248px; min-height: 100svh; color: #e5e7eb; padding: clamp(8px, 3vw, 24px); overflow-x: hidden;
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(99,102,241,0.15), transparent 40%),
            radial-gradient(900px circle at 90% 110%, rgba(236,72,153,0.12), transparent 40%),
            linear-gradient(180deg, #0b0f17, #0a0d14 60%, #080b11); }
        @media (min-width: 900px) { .page { padding-left: calc(clamp(8px, 3vw, 24px) + var(--sbw)); } }

        .bgDecor { position: fixed; inset: -40% -10% -10% -10%; background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 18px 18px; pointer-events: none; }

        .topbar { width: 100%; max-width: 1040px; margin: 0 auto clamp(8px, 2vw, 12px);
          padding: clamp(6px, 1.8vw, 10px) clamp(8px, 2vw, 12px);
          display: flex; align-items: center; justify-content: space-between; gap: clamp(6px, 2vw, 8px);
          flex-wrap: wrap; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(20,22,28,0.6);
          backdrop-filter: blur(10px); }
        .brand { font-weight: 600; letter-spacing: .2px; display: inline-flex; align-items: center; gap: 8px; font-size: clamp(.9rem, 2.6vw, 1rem); }
        .dot { width: 8px; height: 8px; border-radius: 999px; background: #22c55e; display: inline-block; }
        .hamburger { display: inline-flex; } @media (min-width: 900px) { .hamburger { display: none; } }

        .container { width: 100%; max-width: 1040px; margin: 0 auto; padding-inline: clamp(8px, 3vw, 20px); display: grid; gap: clamp(10px, 2.2vw, 16px); }

        .gridStats { display: grid; gap: clamp(8px, 2vw, 12px); grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); }
        .card { width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: rgba(20,22,28,0.6);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45); backdrop-filter: blur(14px); padding: clamp(10px, 2vw, 16px); }
        .cardTitle { color: #cbd5e1; font-size: clamp(.85rem, 2.2vw, .95rem); }

        .amount { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-size: clamp(.95rem, 3.2vw, 1.4rem); font-weight: 700; letter-spacing: .3px; }
        .green { color: #86efac; } .red { color: #fca5a5; }

        .chartCard { display: grid; }
        .chartHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 10px; }
        .rangeChips { display: inline-flex; gap: 6px; }
        .chip { padding: 4px 10px; border-radius: 999px; font-size: 12px; color: #cbd5e1;
          border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); transition: .15s; }
        .chip:hover { background: rgba(255,255,255,0.08); }
        .chip.active { color: #eafff3; border-color: rgba(34,197,94,0.45); background: linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.12)); }

        .legend { display: flex; gap: 12px; align-items: center; margin-top: 8px; color: #cbd5e1; font-size: 12px; flex-wrap: wrap; }
        .legendItem { display: inline-flex; align-items: center; gap: 6px; }
        .legendDot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
        .legendIn { background: #22c55e; box-shadow: 0 0 0 1px rgba(34,197,94,.5) inset; }
        .legendOut { background: #ef4444; box-shadow: 0 0 0 1px rgba(239,68,68,.5) inset; }

        .center { display: grid; place-items: center; min-height: 80px; }
        .actions { display: flex; justify-content: flex-end; }

        .tableWrap { overflow: auto; border-radius: 12px; margin-top: 10px; }
        .table { width: 100%; border-collapse: collapse; min-width: 720px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .truncate { max-width: 380px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .pill { padding: 4px 10px; border-radius: 999px; font-size: clamp(.72rem, 2.2vw, .8rem); border: 1px solid rgba(255,255,255,0.12); }
        .pillGreen { background: rgba(34,197,94,0.12); color: #bbf7d0; border-color: rgba(34,197,94,0.3); }
        .pillRed { background: rgba(239,68,68,0.12); color: #fecaca; border-color: rgba(239,68,68,0.3); }

        .listMobile { display: none; }
        @media (max-width: 768px) {
          .tableWrap { display: none; }
          .listMobile { display: grid; gap: 10px; }
          .mItem { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: clamp(8px, 2.4vw, 10px); background: rgba(20,22,28,0.5); }
          .mRow { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; }
          .mLabel { color: #94a3b8; font-size: clamp(.78rem, 2.4vw, .88rem); }
          .mVal { color: #e5e7eb; font-size: clamp(.85rem, 2.6vw, .95rem); }
          .mActions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
        }

        .pagination { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; gap: 8px; }
        .pages { color: #cbd5e1; font-size: clamp(.72rem, 2.4vw, .92rem); }
        @media (max-width: 320px) { .pages { display: none; } }

        .onlyNarrow { display: none; }
        @media (max-width: 280px) { .onlyWide { display: none; } .onlyNarrow { display: inline; } }

        .muted { color: #9ca3af; padding: 10px 0; }
        .errorBox { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 10px; margin: 8px 0 12px;
          color: #fecaca; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); }

        .modalBackdrop { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); z-index: 50; padding: 16px; }
        .modal { width: 100%; max-width: 420px; border-radius: 16px; padding: clamp(12px, 2.5vw, 16px); border: 1px solid rgba(255,255,255,0.12);
          background: rgba(20,22,28,0.7); box-shadow: 0 20px 60px rgba(0,0,0,0.55); backdrop-filter: blur(14px); }
        .modalHeader { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .warnIcon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: #fecaca; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); }
        .modalTitle { margin: 0; font-size: clamp(1rem, 2.6vw, 1.05rem); color: #f3f4f6; }
        .modalDesc { margin: 8px 0 12px; color: #cbd5e1; font-size: clamp(.86rem, 2.4vw, .95rem); }
        .modalActions { display: flex; justify-content: flex-end; gap: 10px; }
      `}</style>
    </main>
  );
}