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

// Zona WIB helpers
function getNowJKT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}
function monthKeyJKT(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }); // YYYY-MM
}
function longDateIDJKT(d: Date) {
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
// Label chip: tanggal-bulan(tiga huruf)-tahun
function dateDMYChip() {
  const now = getNowJKT();
  const day = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric' });
  const mon = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', month: 'short' }).replace('.', '');
  const year = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric' });
  return `${day} ${mon} ${year}`;
}

type RangeKey = 7 | 14 | 30 | 'BULAN';

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

  // Rentang hari grafik (+ Bulan)
  const [range, setRange] = useState<RangeKey>(14);

  // Label tanggal berjalan untuk topbar
  const nowLongLabel = useMemo(() => longDateIDJKT(getNowJKT()), []);

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

  // Ringkasan Bulan Ini
  const { pemasukanBulan, pengeluaranBulan, sisaBulan } = useMemo(() => {
    const nowKey = monthKeyJKT(getNowJKT());
    let masuk = 0, keluar = 0;
    for (const t of data) {
      const d = new Date(t.tanggal);
      if (monthKeyJKT(d) === nowKey) {
        if (t.jenis === 'Pemasukan') masuk += t.nominal || 0;
        else keluar += t.nominal || 0;
      }
    }
    return { pemasukanBulan: masuk, pengeluaranBulan: keluar, sisaBulan: masuk - keluar };
  }, [data]);

  // Data untuk grafik: jika "BULAN", filter data ke bulan ini
  const chartData = useMemo(() => {
    if (range !== 'BULAN') return data;
    const nowKey = monthKeyJKT(getNowJKT());
    return data.filter((t) => monthKeyJKT(new Date(t.tanggal)) === nowKey);
  }, [data, range]);

  // Range numerik untuk komponen chart (DualLineTicker tetap 7|14|30)
  const rangeForChart = (range === 'BULAN' ? 30 : range) as 7 | 14 | 30;

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

      const title = 'Riwayat Transaksi Keuangan Kp. Cikadu RT. 02';
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

      doc.save(`riwayat-transaksi_Kp-Cikadu-RT02_${fileTimestampWIB()}_WIB.pdf`);
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
      XLSX.writeFile(wb, `riwayat-transaksi_Kp-Cikadu-RT02_${fileTimestampWIB()}_WIB.xlsx`);
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
        <div className="brand">
          <span className="dot" aria-hidden />
         Dedi Suryadi
        </div>
        <button className="btn btn--delete" onClick={() => setShowLogoutConfirm(true)}>Keluar</button>
      </header>

      <section className="container">
        {/* Ringkasan */}
        <div className="gridStats">
          <div className="card"><div className="cardTitle">Pemasukan</div><div className="amount green" title={formatIDR(pemasukan)}>{formatIDRCompact(pemasukan)}</div></div>
          <div className="card"><div className="cardTitle">Pengeluaran</div><div className="amount red" title={formatIDR(pengeluaran)}>{formatIDRCompact(pengeluaran)}</div></div>
          <div className="card"><div className="cardTitle">Sisa Saldo</div><div className="amount" title={formatIDR(sisa)}>{sisa === 0 ? 'Rp 0' : formatIDRCompact(sisa)}</div></div>
          <div className="card">
            <div className="cardTitle">Bulan Ini</div>
            <div
              className="amount"
              title={`Pemasukan: ${formatIDR(pemasukanBulan)} • Pengeluaran: ${formatIDR(pengeluaranBulan)}`}
            >
              {sisaBulan === 0 ? 'Rp 0' : formatIDRCompact(sisaBulan)}
            </div>
          </div>
        </div>

        {/* Grafik dua garis */}
        <div className="card chartCard">
          <div className="chartHead">
            <div className="cardTitle">Grafik Pemasukan vs Pengeluaran</div>
            <div className="rangeChips" role="tablist" aria-label="Rentang data">
              {[
                { key: 7 as RangeKey, label: '7H', title: '7 Hari terakhir' },
                { key: 14 as RangeKey, label: '14H', title: '14 Hari terakhir' },
                { key: 30 as RangeKey, label: '30H', title: '30 Hari terakhir' },
              ].map(({ key, label, title }) => (
                <button
                  key={String(key)}
                  role="tab"
                  aria-selected={range === key}
                  className={`chip ${range === key ? 'active' : ''}`}
                  onClick={() => setRange(key)}
                  title={title}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loadingData ? (
            <div className="center"><Spinner size={28} /></div>
          ) : (
            <DualLineTicker data={chartData} range={rangeForChart} height={240} loopMs={8000} />
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
        .page {
          --sbw: 248px;
          min-height: 100svh;
          color: #e5e7eb;
          padding: clamp(8px, 3vw, 24px);
          overflow-x: hidden;
          /* Tambahan agar konten tidak tertutup header fixed */
          padding-top: calc(clamp(8px, 3vw, 24px) + 64px);
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(99,102,241,0.15), transparent 40%),
            radial-gradient(900px circle at 90% 110%, rgba(236,72,153,0.12), transparent 40%),
            linear-gradient(180deg, #0b0f17, #0a0d14 60%, #080b11);
        }
        @media (min-width: 900px) {
          .page { padding-left: calc(clamp(8px, 3vw, 24px) + var(--sbw)); }
        }

        .bgDecor {
          position: fixed; inset: -40% -10% -10% -10%;
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 18px 18px; pointer-events: none;
        }

        /* Header tetap fixed (freeze di atas) */
.topbar {
  width: min(100% - clamp(16px, 6vw, 48px), 1040px);
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40; /* tetap di atas konten, di bawah modal */

  padding: clamp(6px, 1.8vw, 10px) clamp(8px, 2vw, 12px);
  display: flex; align-items: center; justify-content: space-between; gap: clamp(6px, 2vw, 8px);
  flex-wrap: wrap; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
  background: rgba(20,22,28,0.6);
  backdrop-filter: blur(10px);
}

/* Tambahan: di layar lebar, geser header ke area konten (kanan dari sidebar),
    jadi tidak ketiban sidebar yang fixed di kiri */
@media (min-width: 900px) {
  .topbar {
    left: calc(var(--sbw) + clamp(8px, 3vw, 24px)); /* start setelah sidebar + padding halaman */
    right: clamp(8px, 3vw, 24px);                 /* beri jarak kanan */
    transform: none;                                /* tidak perlu center transform */
    width: auto;                                    /* isi area konten */
    max-width: none;                                /* biar fleksibel mengikuti area konten */
  }
}
        }
        .brand { font-weight: 600; letter-spacing: .2px; display: inline-flex; align-items: center; gap: 8px; font-size: clamp(.9rem, 2.6vw, 1rem); flex: 1; }
        .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; background: #22c55e;
          margin-right: 8px; /* <-- INI YANG SAYA TAMBAHKAN UNTUK JARAK */
          animation: dotCycle 2.4s steps(1, end) infinite; }
        @keyframes dotCycle {
          0% { background: #22c55e; }
          20% { background: #ef4444; }
          40% { background: #f59e0b; }
          60% { background: #3b82f6; }
          80% { background: #f59e0b; }
          100% { background: #22c55e; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dot { animation: none; }
        }
        .dateNow { margin-left: 10px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.12);
          color: #cbd5e1; font-weight: 500; font-size: clamp(.72rem, 2.2vw, .9rem); white-space: nowrap; }

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

        .pagination {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 10px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);
        }
        .pages { color: #94a3b8; font-size: clamp(.8rem, 2.4vw, .9rem); }
        .onlyNarrow { display: none; }
        @media (max-width: 360px) {
          .onlyWide { display: none; }
          .onlyNarrow { display: inline; }
        }

        .muted { text-align: center; color: #94a3b8; padding: 12px; }
        .cardHeader { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .exportBtns { display: flex; gap: 6px; }

        .btn {
          padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 500;
          border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #e5e7eb;
          transition: background .15s;
        }
        .btn:not(:disabled):hover { background: rgba(255,255,255,0.1); }
        .btn:disabled { opacity: .5; cursor: not-allowed; }

        .btn--icon { padding: 8px; display: grid; place-items: center; }
        .btn--add { background: #10b981; border: none; color: #fff; font-weight: 600; }
        .btn--add:hover { background: #10a370; }
        .btn--delete { background: #ef4444; border: none; color: #fff; font-weight: 600; }
        .btn--delete:hover { background: #dc2626; }
        .btn--ghost { background: transparent; border: none; color: #cbd5e1; }
        .btn--ghost:hover { background: rgba(255,255,255,0.1); }
        .btn--edit { border-color: rgba(59,130,246,0.5); background: rgba(59,130,246,0.12); color: #bfdbfe; }
        .btn--edit:hover { background: rgba(59,130,246,0.2); }
        
        .btn--mini { padding: 6px 10px; font-size: 13px; border-radius: 8px; }
        .btn--excel { border-color: rgba(34,197,94,0.5); background: rgba(34,197,94,0.12); color: #bbf7d0; display: inline-flex; align-items: center; gap: 6px; }
        .btn--excel:hover { background: rgba(34,197,94,0.2); }
        .btn--pdf { border-color: rgba(245,158,11,0.5); background: rgba(245,158,11,0.12); color: #fde68a; display: inline-flex; align-items: center; gap: 6px; }
        .btn--pdf:hover { background: rgba(245,158,11,0.2); }

        .errorBox {
          padding: 12px; border-radius: 10px; background: rgba(239,68,68,0.1); color: #fecaca;
          border: 1px solid rgba(239,68,68,0.3);
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }

        /* Modal */
        .modalBackdrop {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
          display: grid; place-items: center; padding: 16px;
          animation: fadeIn .15s ease;
        }
        .modal {
          width: 100%; max-width: 420px;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
          background: #0d1017; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          padding: 20px;
          animation: zoomIn .15s ease-out;
        }
        .modalHeader { display: flex; align-items: center; gap: 10px; }
        .modalTitle { margin: 0; font-size: 1.1rem; }
        .warnIcon { color: #f59e0b; }
        .modalDesc { margin: 12px 0 0; color: #cbd5e1; font-size: .95rem; }
        .modalActions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </main>
  );
}