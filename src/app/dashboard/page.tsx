'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { FirebaseError } from 'firebase/app';
import { Spinner, FullscreenSpinner } from '@/components/Spinner';
import DualLineTicker from '@/components/DualLineTicker';
import { isOperatorUser } from '@/lib/roles';

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

function formatIDR(n: number) {
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}
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
function formatDateLong(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Zona WIB helpers
function getNowJKT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}
function monthKeyJKT(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }); // YYYY-MM
}
// Tambahan: key bulan sebelumnya (WIB)
function prevMonthKeyJKT(d: Date) {
  const p = new Date(d);
  p.setDate(1);
  p.setMonth(p.getMonth() - 1);
  return p.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' });
}

type RangeKey = 7 | 14 | 30 | 'BULAN';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Transaksi[]>([]);
  const [page, setPage] = useState(1);

  // Modal hapus
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Export status
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);

  // Rentang hari grafik
  const [range, setRange] = useState<RangeKey>(14);

  // Auth gate (tetap sama)
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
      const operator = isOperatorUser(u);
      const baseRef = collection(db, 'transaksi');
      const qRef = operator
        ? query(baseRef, orderBy('tanggal', 'desc'))
        : query(baseRef, where('uid', '==', u.uid));

      const snap = await getDocs(qRef);
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

  // Tambahan: sisa bulan lalu dan tren
  const { sisaBulanPrev } = useMemo(() => {
    const prevKey = prevMonthKeyJKT(getNowJKT());
    let masuk = 0, keluar = 0;
    for (const t of data) {
      const d = new Date(t.tanggal);
      if (monthKeyJKT(d) === prevKey) {
        if (t.jenis === 'Pemasukan') masuk += t.nominal || 0;
        else keluar += t.nominal || 0;
      }
    }
    return { sisaBulanPrev: masuk - keluar };
  }, [data]);
  const deltaSisaBulan = sisaBulan - sisaBulanPrev;
  const pctSisaBulan = sisaBulanPrev === 0 ? null : Math.round((deltaSisaBulan / Math.abs(sisaBulanPrev)) * 100);

  const chartData = useMemo(() => {
    if (range !== 'BULAN') return data;
    const nowKey = monthKeyJKT(getNowJKT());
    return data.filter((t) => monthKeyJKT(new Date(t.tanggal)) === nowKey);
  }, [data, range]);

  const rangeForChart = (range === 'BULAN' ? 30 : range) as 7 | 14 | 30;

  const totalPages = useMemo(() => Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE)), [data.length]);
  const paged = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return data.slice(start, start + ITEMS_PER_PAGE);
  }, [data, page]);

  const handleExportPDF = useCallback(async () => {
    try {
      if (data.length === 0) { alert('Belum ada data untuk diekspor.'); return; }
      setExporting('pdf');
      const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const autoTable = (autoTableModule as any).default;
      const docPDF = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      const margin = 40;
      const pageSize: any = (docPDF as any).internal.pageSize;
      const pageWidth = (pageSize?.getWidth?.() as number) ?? (pageSize?.width as number) ?? 595;
      const pageHeight = (pageSize?.getHeight?.() as number) ?? (pageSize?.height as number) ?? 842;

      const title = 'Riwayat Transaksi Keuangan Kp. Cikadu RT. 02';
      const tglExp = `Tanggal ekspor: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;

      (docPDF as any).setDrawColor(16, 163, 74);
      docPDF.rect(margin, margin, pageWidth - margin * 2, 54);
      docPDF.setFont('helvetica', 'bold'); docPDF.setFontSize(14); docPDF.setTextColor(16, 163, 74);
      docPDF.text(title, pageWidth / 2, margin + 22, { align: 'center' });
      docPDF.setFont('helvetica', 'normal'); docPDF.setFontSize(10); docPDF.setTextColor(55, 65, 81);
      docPDF.text(tglExp, pageWidth / 2, margin + 40, { align: 'center' });

      const rows = data.map((t, i) => ([
        String(i + 1),
        formatDateLong(t.tanggal),
        t.jenis,
        t.keterangan || '-',
        `${t.jenis === 'Pemasukan' ? '+' : '-'} ${formatIDR(t.nominal)}`,
      ]));

      autoTable(docPDF as any, {
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
          const total = (docPDF as any).getNumberOfPages?.() ?? 1;
          docPDF.setFontSize(9); docPDF.setTextColor(150);
          docPDF.text(`Halaman ${ctx.pageNumber} / ${total}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
        },
      });

      const finalY = (docPDF as any).lastAutoTable?.finalY ?? (margin + 70);
      const boxY = finalY + 14; const boxH = 36; const boxW = pageWidth - margin * 2;

      docPDF.setDrawColor(16, 163, 74); docPDF.setFillColor(220, 252, 231);
      docPDF.rect(margin, boxY, boxW, boxH, 'DF');
      docPDF.setFont('helvetica', 'bold'); docPDF.setFontSize(12); docPDF.setTextColor(13, 148, 136);
      docPDF.text('Sisa Saldo', margin + 12, boxY + 22);

      const sisaStr = sisa >= 0 ? formatIDR(sisa) : `- ${formatIDR(Math.abs(sisa))}`;
      const valColor = sisa < 0 ? [239, 68, 68] : [34, 197, 94];
      docPDF.setFont('helvetica', 'bold'); docPDF.setFontSize(13); docPDF.setTextColor(valColor[0], valColor[1], valColor[2]);
      docPDF.text(sisaStr, margin + boxW - 12, boxY + 22, { align: 'right' });

      docPDF.save(`riwayat-transaksi_${Date.now()}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor PDF. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

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
      XLSX.writeFile(wb, `riwayat-transaksi_${Date.now()}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor Excel. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

  if (loadingAuth) return <FullscreenSpinner />;

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

  return (
    <>
      <section className="container">
        {/* Ringkasan */}
        <div className="gridStats">
          <div className="card">
            <div className="cardTitle">Pemasukan</div>
            <div className="amount amount--tight green" title={formatIDR(pemasukan)}>{formatIDR(pemasukan)}</div>
          </div>
          <div className="card">
            <div className="cardTitle">Pengeluaran</div>
            <div className="amount amount--tight red" title={formatIDR(pengeluaran)}>{formatIDR(pengeluaran)}</div>
          </div>
          <div className="card">
            <div className="cardTitle">Sisa Saldo</div>
            <div className="amount amount--tight" title={formatIDR(sisa)}>{formatIDR(sisa)}</div>
          </div>
          <div className="card">
            <div className="cardTitle">Bulan Ini</div>
            <div
              className="amount amount--tight"
              title={`Pemasukan: ${formatIDR(pemasukanBulan)} • Pengeluaran: ${formatIDR(pengeluaranBulan)}`}
            >
              {formatIDR(sisaBulan)}
            </div>
            <div className="trend">
              {pctSisaBulan === null ? (
                <span className="mutedSm">—</span>
              ) : (
                <span className={`delta ${deltaSisaBulan >= 0 ? 'up' : 'down'}`}>
                  {deltaSisaBulan >= 0 ? '▲' : '▼'} {Math.abs(pctSisaBulan)}%
                </span>
              )}
              <span className="mutedSm"> dibanding bln lalu</span>
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
                Excel
              </button>
              <button
                className="btn btn--mini btn--pdf"
                onClick={handleExportPDF}
                disabled={loadingData || data.length === 0 || exporting === 'excel' || exporting === 'pdf'}
                aria-label="Export PDF"
                title="Export PDF"
              >
                PDF
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
                        <td>{new Date(t.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
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
                    <div className="mRow"><span className="mLabel">Tanggal</span><span className="mVal">{new Date(t.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>
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

      {/* Modal Hapus (tetap seperti semula) */}
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
        .container { width: 100%; max-width: 1040px; margin: 0 auto; padding-inline: clamp(8px, 3vw, 20px); display: grid; gap: clamp(10px, 2.2vw, 16px); }

        .gridStats { display: grid; gap: clamp(8px, 2vw, 12px); grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); }
        .card { width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: rgba(20,22,28,0.6);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45); backdrop-filter: blur(14px); padding: clamp(10px, 2vw, 16px); }
        .cardTitle { color: #cbd5e1; font-size: clamp(.85rem, 2.2vw, .95rem); }

        .amount { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: clamp(.95rem, 3.2vw, 1.4rem); font-weight: 700; letter-spacing: .3px; }
        .amount--tight { text-align: right; font-variant-numeric: tabular-nums; word-break: keep-all; }
        .green { color: #86efac; } .red { color: #fca5a5; }

        .trend { margin-top: 4px; font-size: 12px; display: flex; gap: 6px; justify-content: flex-end; align-items: baseline; }
        .delta { font-weight: 600; }
        .delta.up { color: #86efac; }
        .delta.down { color: #fca5a5; }
        .mutedSm { color: #94a3b8; }

        .chartCard { display: grid; }
        .chartHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 10px; }
        .rangeChips { display: inline-flex; gap: 6px; }
        .chip { padding: 4px 10px; border-radius: 999px; font-size: 12px; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); transition: .15s; }
        .chip:hover { background: rgba(255,255,255,0.08); }
        .chip.active { color: #eafff3; border-color: rgba(34,197,94,0.45); background: linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.12)); }

        /* Sembunyikan label sumbu (angka tanggal) di SVG chart tanpa mengubah komponen chart */
        .chartCard :global(svg text[font-size="10"]) { display: none; }

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

        .btn--add { background: #10b981; border: none; color: #fff; font-weight: 600; }
        .btn--add:hover { background: #10a370; }
        .btn--delete { background: #ef4444; border: none; color: #fff; font-weight: 600; }
        .btn--delete:hover { background: #dc2626; }
        .btn--ghost { background: transparent; border: none; color: #cbd5e1; }
        .btn--ghost:hover { background: rgba(255,255,255,0.1); }
        .btn--edit { border-color: rgba(59,130,246,0.5); background: rgba(59,130,246,0.12); color: #bfdbfe; }
        .btn--edit:hover { background: rgba(59,130,246,0.2); }

        .btn--mini { padding: 6px 10px; font-size: 13px; border-radius: 8px; }
        .btn--excel { border-color: rgba(34,197,94,0.5); background: rgba(34,197,94,0.12); color: #bbf7d0; }
        .btn--excel:hover { background: rgba(34,197,94,0.2); }
        .btn--pdf { border-color: rgba(245,158,11,0.5); background: rgba(245,158,11,0.12); color: #fde68a; }
        .btn--pdf:hover { background: rgba(245,158,11,0.2); }

        .errorBox {
          padding: 12px; border-radius: 10px; background: rgba(239,68,68,0.1); color: #fecaca;
          border: 1px solid rgba(239,68,68,0.3);
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }

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
          padding: 20px; animation: zoomIn .15s ease-out;
        }
        .modalHeader { display: flex; align-items: center; gap: 10px; }
        .modalTitle { margin: 0; font-size: 1.1rem; }
        .warnIcon { color: #f59e0b; }
        .modalDesc { margin: 12px 0 0; color: #cbd5e1; font-size: .95rem; }
        .modalActions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </>
  );
}