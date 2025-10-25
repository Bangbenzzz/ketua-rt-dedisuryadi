'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import Link from 'next/link';
import type { FirebaseError } from 'firebase/app';
import { Spinner, FullscreenSpinner } from '@/components/Spinner';
import Sidebar from '@/components/Sidebar';

type Transaksi = {
  id: string;
  uid: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  nominal: number;
  keterangan: string;
  tanggal: string;
  createdAt?: string;
};

const ITEMS_PER_PAGE = 10;

function formatIDR(n: number) {
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}
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
  const y = jkt.getFullYear();
  const m = p(jkt.getMonth() + 1);
  const d = p(jkt.getDate());
  const hh = p(jkt.getHours());
  const mm = p(jkt.getMinutes());
  const ss = p(jkt.getSeconds());
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}
// Label angka pendek untuk chart (biar muat di layar sempit)
function formatShort(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1).replace(/\.0$/, '')}T`;
  if (a >= 1e9)  return `${sign}${(a / 1e9).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e6)  return `${sign}${(a / 1e6).toFixed(1).replace(/\.0$/, '')}jt`;
  if (a >= 1e3)  return `${sign}${(a / 1e3).toFixed(0)}rb`;
  return `${sign}${a}`;
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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Status export
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);

  // Lebar container chart (untuk responsivitas label tanggal)
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(0);
  useEffect(() => {
    if (!chartContainerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setChartW(e.contentRect.width);
      }
    });
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, []);

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

  // Chart: Bar chart per hari (Pemasukan, Pengeluaran, Sisa) + label nominal di dalam chart
  const chart = useMemo(() => {
    const days = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Kumpulkan per hari: in, out
    const grouped = new Map<string, { in: number; out: number }>();
    data.forEach((t) => {
      const d = new Date(t.tanggal);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const curr = grouped.get(key) || { in: 0, out: 0 };
      if (t.jenis === 'Pemasukan') curr.in += t.nominal;
      else curr.out += t.nominal;
      grouped.set(key, curr);
    });

    const points: {
      i: number;
      date: Date;
      label: string;
      in: number;
      out: number;
      net: number;
      key: string;
    }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const g = grouped.get(key) || { in: 0, out: 0 };
      points.push({
        i: days - 1 - i,
        date: d,
        label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        in: g.in,
        out: g.out,
        net: g.in - g.out,
        key,
      });
    }

    // ViewBox tetap, tapi skala CSS membuat responsif
    const width = 360;
    const height = 180;
    const padX = 22;
    const padY = 18;
    const innerW = width - 2 * padX;
    const innerH = height - 2 * padY;

    const maxAbs = Math.max(1, ...points.map((p) => Math.max(p.in, p.out, Math.abs(p.net))));
    const maxY = maxAbs * 1.15; // headroom 15%

    const zeroY = padY + innerH / 2;
    const step = innerW / points.length;
    const gap = 2;
    const barW = Math.max(4, (step - gap * 4) / 3); // 3 bar per grup

    // Tinggi bar + clamp biar gak nabrak tepi
    const maxHalfH = innerH / 2 - 4; // padding 4px dari tepi
    const valToH = (val: number) => Math.min(maxHalfH, (Math.abs(val) / maxY) * maxHalfH);

    return { width, height, padX, padY, innerW, innerH, zeroY, step, gap, barW, maxY, points, days, valToH };
  }, [data]);

  // Kepadatan label tanggal responsif berdasarkan lebar container chart
  const labelEvery = useMemo(() => {
    if (chartW >= 640) return 1;
    if (chartW >= 480) return 2;
    if (chartW >= 360) return 3;
    return 4; // layar sangat sempit
  }, [chartW]);

  const totalPages = Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE));
  const paged = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return data.slice(start, start + ITEMS_PER_PAGE);
  }, [data, page]);

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
      await deleteDoc(doc(db, 'transaksi', id));
      setData((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus transaksi.');
    }
  };

  const closeLogoutConfirm = () => { if (!loggingOut) setShowLogoutConfirm(false); };
  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try { await signOut(auth); router.replace('/login'); }
    catch (e) { console.error(e); alert('Gagal logout. Coba lagi.'); }
    finally { setLoggingOut(false); setShowLogoutConfirm(false); }
  };

  const handleExportPDF = useCallback(async () => {
    try {
      if (data.length === 0) {
        alert('Belum ada data untuk diekspor.');
        return;
      }
      setExporting('pdf');
  
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = autoTableModule.default;
  
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  
      const margin = 40;
      const pageSize: any = doc.internal.pageSize;
      const pageWidth =
        (pageSize?.getWidth?.() as number) ??
        (pageSize?.width as number) ?? 595;
      const pageHeight =
        (pageSize?.getHeight?.() as number) ??
        (pageSize?.height as number) ?? 842;
  
      // Header
      const title = 'Riwayat Transaksi Keuangan Kp. Cikadu RT. 06';
      const tglExp = `Tanggal ekspor: ${formatWIBTimestamp()} WIB`;
  
      // Border header
      doc.setDrawColor(16, 163, 74);
      doc.rect(margin, margin, pageWidth - margin * 2, 54);
  
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(16, 163, 74);
      doc.text(title, pageWidth / 2, margin + 22, { align: 'center' });
  
      // Export date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text(tglExp, pageWidth / 2, margin + 40, { align: 'center' });
  
      // Data rows
      const rows = data.map((t, i) => ([
        String(i + 1),
        formatDateLong(t.tanggal),
        t.jenis,
        t.keterangan || '-',
        `${t.jenis === 'Pemasukan' ? '+' : '-'} ${formatIDR(t.nominal)}`,
      ]));
  
      autoTable(doc, {
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
          doc.setFontSize(9);
          doc.setTextColor(150);
          doc.text(
            `Halaman ${ctx.pageNumber} / ${totalPages}`,
            pageWidth - margin,
            pageHeight - 16,
            { align: 'right' }
          );
        },
      });
  
      // Ringkasan Sisa Saldo
      const finalY = (doc as any).lastAutoTable?.finalY ?? (margin + 70);
      const boxY = finalY + 14;
      const boxH = 36;
      const boxW = pageWidth - margin * 2;
  
      doc.setDrawColor(16, 163, 74);
      doc.setFillColor(220, 252, 231); // #DCFCE7
      doc.rect(margin, boxY, boxW, boxH, 'DF');
  
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(13, 148, 136);
      doc.text('Sisa Saldo', margin + 12, boxY + 22);
  
      const sisaStr = sisa >= 0 ? formatIDR(sisa) : `- ${formatIDR(Math.abs(sisa))}`;
      const valColor = sisa < 0 ? [239, 68, 68] : [34, 197, 94];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(valColor[0], valColor[1], valColor[2]);
      doc.text(sisaStr, margin + boxW - 12, boxY + 22, { align: 'right' });
  
      // Save
      const fname = `riwayat-transaksi_Kp-Cikadu-RT06_${fileTimestampWIB()}_WIB.pdf`;
      doc.save(fname);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor PDF. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

  const handleExportExcel = useCallback(async () => {
    try {
      if (data.length === 0) {
        alert('Belum ada data untuk diekspor.');
        return;
      }
      setExporting('excel');

      const ExcelJS = (await import('exceljs')).default;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Dedi Suryadi';
      wb.created = new Date();

      const ws = wb.addWorksheet('Riwayat');

      // Set kolom + lebar
      ws.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Tanggal', key: 'tanggal', width: 18 },
        { header: 'Jenis', key: 'jenis', width: 15 },
        { header: 'Keterangan', key: 'keterangan', width: 50 },
        { header: 'Nominal', key: 'nominal', width: 20 },
      ];

      // Header halaman
      ws.mergeCells('A1:E1');
      const titleCell = ws.getCell('A1');
      titleCell.value = 'Riwayat Transaksi Keuangan Kp. Cikadu RT. 06';
      titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } }; // hijau
      titleCell.border = {
        top: { style: 'thin', color: { argb: 'FF16A34A' } },
        left: { style: 'thin', color: { argb: 'FF16A34A' } },
        bottom: { style: 'thin', color: { argb: 'FF16A34A' } },
        right: { style: 'thin', color: { argb: 'FF16A34A' } },
      };
      ws.getRow(1).height = 24;

      ws.mergeCells('A2:E2');
      const dateCell = ws.getCell('A2');
      dateCell.value = `Tanggal ekspor: ${formatWIBTimestamp()} WIB`;
      dateCell.font = { color: { argb: 'FF065F46' }, size: 11 };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // hijau muda
      ws.getRow(2).height = 20;

      // Header tabel
      const headerRow = ws.addRow(['No', 'Tanggal', 'Jenis', 'Keterangan', 'Nominal']);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
          left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
          bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
          right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
        };
      });
      ws.getRow(3).height = 20;
      ws.views = [{ state: 'frozen', ySplit: 3 }];

      // Data
      data.forEach((t, i) => {
        const nominalSigned = t.jenis === 'Pemasukan' ? t.nominal : -t.nominal;
        const row = ws.addRow([
          i + 1,
          formatDateLong(t.tanggal),
          t.jenis,
          t.keterangan || '-',
          nominalSigned,
        ]);
        row.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
          if (colNum === 1) cell.alignment = { horizontal: 'center' };
          if (colNum === 3) cell.alignment = { horizontal: 'center' };
          if (colNum === 4) cell.alignment = { wrapText: true };
          if (colNum === 5) {
            cell.alignment = { horizontal: 'right' };
            cell.numFmt = '"Rp" #,##0;[Red]-"Rp" #,##0';
          }
        });
      });

      // Ringkasan Sisa Saldo
      ws.addRow([]); // spasi
      const sumRow = ws.addRow(['', '', '', 'Sisa Saldo', sisa]);
      ws.mergeCells(`A${sumRow.number}:D${sumRow.number}`);
      const labelCell = ws.getCell(`A${sumRow.number}`);
      const valueCell = ws.getCell(`E${sumRow.number}`);

      labelCell.font = { bold: true, color: { argb: 'FF065F46' } };
      labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      labelCell.border = {
        top: { style: 'thin', color: { argb: 'FF16A34A' } },
        left: { style: 'thin', color: { argb: 'FF16A34A' } },
        bottom: { style: 'thin', color: { argb: 'FF16A34A' } },
        right: { style: 'thin', color: { argb: 'FF16A34A' } },
      };

      valueCell.font = { bold: true };
      valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
      valueCell.numFmt = '"Rp" #,##0;[Red]-"Rp" #,##0';
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      valueCell.border = {
        top: { style: 'thin', color: { argb: 'FF16A34A' } },
        left: { style: 'thin', color: { argb: 'FF16A34A' } },
        bottom: { style: 'thin', color: { argb: 'FF16A34A' } },
        right: { style: 'thin', color: { argb: 'FF16A34A' } },
      };
      ws.getRow(sumRow.number).height = 22;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `riwayat-transaksi_Kp-Cikadu-RT06_${fileTimestampWIB()}_WIB.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor Excel. Coba lagi.');
    } finally {
      setExporting(null);
    }
  }, [data, sisa]);

  if (loadingAuth) return <FullscreenSpinner />;

  return (
    <main className="page">
      <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} />
      <div className="bgDecor" aria-hidden />

      {/* Topbar */}
      <header className="topbar">
        <button className="btn btn--icon hamburger" aria-label="Buka menu" onClick={() => setSbOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <div className="brand"><span className="dot" />Dedi Suryadi</div>
        <button className="btn btn--delete" onClick={() => setShowLogoutConfirm(true)}>Keluar</button>
      </header>

      <section className="container">
        {/* Ringkasan */}
        <div className="gridStats">
          <div className="card"><div className="cardTitle">Pemasukan</div><div className="amount green">{formatIDR(pemasukan)}</div></div>
          <div className="card"><div className="cardTitle">Pengeluaran</div><div className="amount red">{formatIDR(pengeluaran)}</div></div>
          <div className="card"><div className="cardTitle">Sisa Saldo</div><div className="amount">{formatIDR(sisa)}</div></div>
        </div>

        {/* Chart */}
        <div className="card chartCard" ref={chartContainerRef}>
          <div className="cardTitle">Tren 14 Hari Terakhir</div>
          {loadingData ? (
            <div className="center"><Spinner size={28} /></div>
          ) : (
            <>
              <div className="chartWrap">
                <div className="ratioFix" aria-hidden />
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="chart"
                  role="img"
                  aria-label="Bar chart pemasukan, pengeluaran, dan sisa 14 hari terakhir"
                >
                  <defs>
                    <clipPath id="clipChartArea">
                      <rect
                        x={chart.padX}
                        y={chart.padY}
                        width={chart.innerW}
                        height={chart.innerH}
                        rx="4"
                        ry="4"
                      />
                    </clipPath>
                  </defs>

                  {/* Grid halus */}
                  <g opacity="0.06">
                    <rect x={chart.padX} y={chart.padY} width={chart.innerW} height={chart.innerH} fill="white" />
                  </g>

                  {/* Baseline 0 */}
                  <line
                    x1={chart.padX}
                    x2={chart.padX + chart.innerW}
                    y1={chart.zeroY}
                    y2={chart.zeroY}
                    stroke="rgba(255,255,255,0.25)"
                    strokeDasharray="4 6"
                  />

                  {/* Bars + Labels (clip agar tidak keluar chart) */}
                  <g clipPath="url(#clipChartArea)">
                    {chart.points.map((p) => {
                      const stepX = chart.padX + p.i * chart.step;
                      const barInX = stepX + chart.gap;
                      const barOutX = barInX + chart.barW + chart.gap;
                      const barNetX = barOutX + chart.barW + chart.gap;
                      const cxIn = barInX + chart.barW / 2;
                      const cxOut = barOutX + chart.barW / 2;
                      const cxNet = barNetX + chart.barW / 2;

                      const hIn = chart.valToH(p.in);
                      const yIn = chart.zeroY - hIn;

                      const hOut = chart.valToH(p.out);
                      const yOut = chart.zeroY;

                      const hNet = chart.valToH(p.net);
                      const yNet = p.net >= 0 ? chart.zeroY - hNet : chart.zeroY;

                      const clampY = (y: number) => Math.max(chart.padY + 9, Math.min(chart.padY + chart.innerH - 4, y));

                      return (
                        <g key={p.key}>
                          {/* Pemasukan */}
                          <rect
                            x={barInX}
                            y={yIn}
                            width={chart.barW}
                            height={hIn}
                            fill="#22c55e"
                            opacity="0.9"
                            rx="2"
                          >
                            <title>{`${p.label} — Pemasukan: ${formatIDR(p.in)}`}</title>
                          </rect>
                          {hIn >= 12 && p.in > 0 && (
                            <text x={cxIn} y={clampY(yIn + 10)} textAnchor="middle" fontSize="9" fill="#0b0f17" fontWeight={700}>
                              {formatShort(p.in)}
                            </text>
                          )}

                          {/* Pengeluaran */}
                          <rect
                            x={barOutX}
                            y={yOut}
                            width={chart.barW}
                            height={hOut}
                            fill="#ef4444"
                            opacity="0.85"
                            rx="2"
                          >
                            <title>{`${p.label} — Pengeluaran: ${formatIDR(p.out)}`}</title>
                          </rect>
                          {hOut >= 12 && p.out > 0 && (
                            <text x={cxOut} y={clampY(yOut + hOut - 4)} textAnchor="middle" fontSize="9" fill="#0b0f17" fontWeight={700}>
                              {formatShort(p.out)}
                            </text>
                          )}

                          {/* Sisa */}
                          <rect
                            x={barNetX}
                            y={yNet}
                            width={chart.barW}
                            height={hNet}
                            fill="#14b8a6"
                            opacity="0.9"
                            rx="2"
                          >
                            <title>{`${p.label} — Sisa: ${formatIDR(p.net)}`}</title>
                          </rect>
                          {hNet >= 12 && p.net !== 0 && (
                            <text
                              x={cxNet}
                              y={clampY(p.net >= 0 ? yNet + 10 : yNet + hNet - 4)}
                              textAnchor="middle"
                              fontSize="9"
                              fill="#0b0f17"
                              fontWeight={700}
                            >
                              {formatShort(p.net)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* Label tanggal di bawah (jarangin saat layar sempit) */}
                  <g fontSize="9" fill="rgba(203,213,225,0.9)">
                    {chart.points.map((p) => {
                      if (p.i % labelEvery !== 0) return null;
                      const stepX = chart.padX + p.i * chart.step;
                      const mid = stepX + chart.step / 2;
                      return (
                        <text key={`lbl-${p.key}`} x={mid} y={chart.padY + chart.innerH + 12} textAnchor="middle">
                          {p.label}
                        </text>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {/* Legend */}
              <div className="legend">
                <div className="legendItem"><span className="legendDot legendIn" /> Pemasukan</div>
                <div className="legendItem"><span className="legendDot legendOut" /> Pengeluaran</div>
                <div className="legendItem"><span className="legendDot legendNet" /> Sisa</div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="actions">
          <Link href="/dashboard/transaksi/tambah" className="btn btn--add">+ Tambah Transaksi</Link>
        </div>

        {/* Riwayat */}
        <div className="card">
          {/* Header Riwayat + Tombol Export */}
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
                          <button className="btn btn--mini btn--delete" onClick={() => handleDelete(t.id)}>Hapus</button>
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
                      <button className="btn btn--mini btn--delete" onClick={() => handleDelete(t.id)}>Hapus</button>
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

        .amount { font-size: clamp(.95rem, 3.2vw, 1.4rem); font-weight: 700; letter-spacing: .3px; }
        .green { color: #86efac; } .red { color: #fca5a5; }

        .chartCard { display: grid; }
        .chartWrap { position: relative; width: 100%; aspect-ratio: 3/1; min-height: clamp(80px, 22vw, 220px); overflow: hidden; }
        .ratioFix { display: none; }
        @supports not (aspect-ratio: 1) { .chartWrap { height: auto; } .ratioFix { display: block; padding-top: 33.333%; } .chart { position: absolute; inset: 0; } }
        .chart { width: 100%; height: 100%; display: block; }

        .legend { display: flex; gap: 12px; align-items: center; margin-top: 8px; color: #cbd5e1; font-size: 12px; flex-wrap: wrap; }
        .legendItem { display: inline-flex; align-items: center; gap: 6px; }
        .legendDot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
        .legendIn { background: #22c55e; box-shadow: 0 0 0 1px rgba(34,197,94,.5) inset; }
        .legendOut { background: #ef4444; box-shadow: 0 0 0 1px rgba(239,68,68,.5) inset; }
        .legendNet { background: #14b8a6; box-shadow: 0 0 0 1px rgba(20,184,166,.5) inset; }

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

        /* Header Riwayat + Export Buttons */
        .cardHeader { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; row-gap: 8px; }
        .cardHeader .cardTitle { flex: 1; min-width: 180px; }
        .exportBtns { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .btn.btn--mini .icon { margin-right: 6px; display: inline-flex; vertical-align: middle; }

        .btn--excel { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.4); color: #bbf7d0; }
        .btn--excel:hover { background: rgba(34,197,94,0.2); }
        .btn--pdf { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); color: #fecaca; }
        .btn--pdf:hover { background: rgba(239,68,68,0.2); }
        .btn--excel[disabled],
        .btn--pdf[disabled] { opacity: .6; cursor: not-allowed; }
      `}</style>
    </main>
  );
}