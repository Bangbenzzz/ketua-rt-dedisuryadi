// src/components/DualLineTicker.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Tx = {
  jenis: 'Pemasukan' | 'Pengeluaran';
  nominal: number;
  tanggal: string; // ISO
};

export default function DualLineTicker({
  data,
  range = 14,
  height = 240,
  loopMs = 8000, // durasi 1 loop penuh (semakin kecil semakin cepat)
}: {
  data: Tx[];
  range?: 7 | 14 | 30;
  height?: number;
  loopMs?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  const [progress, setProgress] = useState(0); // 0..1

  // Hitung total per hari (pemasukan dan pengeluaran) agar bisa saling silang
  const series = useMemo(() => {
    const byDay = new Map<string, { in: number; out: number }>();
    data.forEach((t) => {
      const d = new Date(t.tanggal);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key) || { in: 0, out: 0 };
      if (t.jenis === 'Pemasukan') v.in += t.nominal;
      else v.out += t.nominal;
      byDay.set(key, v);
    });

    // Siapkan N hari terakhir
    const days: { key: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = range - 1; i >= 0; i--) {
      const dd = new Date(today);
      dd.setDate(today.getDate() - i);
      const key = dd.toISOString().slice(0, 10);
      const label = dd.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      days.push({ key, label });
    }

    // Deret nilai per hari (bukan kumulatif) agar dua garis bisa crossing
    const arrIn: number[] = [];
    const arrOut: number[] = [];
    const labels: string[] = [];
    for (const d of days) {
      const v = byDay.get(d.key) || { in: 0, out: 0 };
      arrIn.push(v.in);
      arrOut.push(v.out);
      labels.push(d.label);
    }
    return { arrIn, arrOut, labels };
  }, [data, range]);

  // Resize responsif
  useEffect(() => {
    if (!wrapRef.current) return;
    setW(wrapRef.current.clientWidth || 600);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Reset animasi jika data/range berubah
  useEffect(() => { setProgress(0); }, [series, range]);

  // Animasi smooth (requestAnimationFrame)
  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const p = (elapsed % loopMs) / loopMs; // 0..1 loop
      setProgress(p);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [loopMs]);

  // Build path
  const padX = 28;
  const padY = 16;
  const width = Math.max(280, w);
  const innerW = width - padX * 2;
  const heightPx = Math.max(160, height);
  const innerH = heightPx - padY * 2;

  const n = Math.max(series.arrIn.length, series.arrOut.length);
  const maxVal = Math.max(1, ...series.arrIn, ...series.arrOut);
  const minVal = 0; // baseline nol
  const span = Math.max(1, maxVal - minVal);

  // Buat posisi titik (x,y) untuk kedua garis
  const ptsIn = Array.from({ length: n }, (_, i) => {
    const x = padX + (innerW * i) / Math.max(1, n - 1);
    const y = padY + innerH - ((series.arrIn[i] - minVal) / span) * innerH;
    return { x, y, label: series.labels[i], v: series.arrIn[i] };
  });
  const ptsOut = Array.from({ length: n }, (_, i) => {
    const x = padX + (innerW * i) / Math.max(1, n - 1);
    const y = padY + innerH - ((series.arrOut[i] - minVal) / span) * innerH;
    return { x, y, label: series.labels[i], v: series.arrOut[i] };
  });

  // Progress -> posisi segmen (0..n-1)
  const segTotal = Math.max(1, n - 1);
  const pos = progress * segTotal;
  const idx = Math.floor(pos);
  const t = Math.min(1, Math.max(0, pos - idx)); // 0..1

  // Interpolasi titik terakhir
  const interp = (a: { x: number; y: number }, b: { x: number; y: number }, tt: number) => ({
    x: a.x + (b.x - a.x) * tt,
    y: a.y + (b.y - a.y) * tt,
  });

  function buildPartialPath(pts: { x: number; y: number }[]) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    const upto = Math.min(idx + 1, pts.length - 1);
    const head = interp(pts[upto], pts[upto + 1] ?? pts[upto], t);
    const pathPts = pts.slice(0, upto + 1).concat(head);
    return pathPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const pathIn = buildPartialPath(ptsIn);
  const pathOut = buildPartialPath(ptsOut);

  const headIn = (() => {
    if (ptsIn.length === 0) return null;
    const upto = Math.min(idx + 1, ptsIn.length - 1);
    return interp(ptsIn[upto], ptsIn[upto + 1] ?? ptsIn[upto], t);
  })();

  const headOut = (() => {
    if (ptsOut.length === 0) return null;
    const upto = Math.min(idx + 1, ptsOut.length - 1);
    return interp(ptsOut[upto], ptsOut[upto + 1] ?? ptsOut[upto], t);
  })();

  // Label X jarangin sesuai lebar
  const every = width >= 720 ? 1 : width >= 560 ? 2 : width >= 420 ? 3 : 4;

  // Format Rp ringkas untuk title
  const fmtRp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${heightPx}`} preserveAspectRatio="none" width="100%" height={heightPx}>
        <defs>
          <linearGradient id="lg-green" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="lg-red" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>

        {/* Panel */}
        <rect
          x={padX}
          y={padY}
          width={innerW}
          height={innerH}
          rx="10"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
        />

        {/* Grid halus */}
        <g opacity="0.12">
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={padX + innerW}
              y1={padY + innerH * t}
              y2={padY + innerH * t}
              stroke="rgba(255,255,255,0.20)"
              strokeDasharray="2 6"
            />
          ))}
        </g>

        {/* Garis Pemasukan (hijau) */}
        {pathIn && (
          <path
            d={pathIn}
            fill="none"
            stroke="url(#lg-green)"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Garis Pengeluaran (merah) */}
        {pathOut && (
          <path
            d={pathOut}
            fill="none"
            stroke="url(#lg-red)"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.95"
          />
        )}

        {/* Head dots */}
        {headIn && (
          <circle cx={headIn.x} cy={headIn.y} r="3.5" fill="#22c55e" stroke="#052e16" strokeWidth="1.2">
            <title>Pemasukan — {fmtRp(series.arrIn[Math.min(idx + 1, n - 1)])}</title>
          </circle>
        )}
        {headOut && (
          <circle cx={headOut.x} cy={headOut.y} r="3.5" fill="#ef4444" stroke="#450a0a" strokeWidth="1.2">
            <title>Pengeluaran — {fmtRp(series.arrOut[Math.min(idx + 1, n - 1)])}</title>
          </circle>
        )}

        {/* Label tanggal */}
        <g fontSize="9" fill="rgba(203,213,225,0.9)">
          {ptsIn.map((p, i) => {
            if (i % every !== 0) return null;
            return (
              <text key={`lbl-${i}`} x={p.x} y={padY + innerH + 12} textAnchor="middle">
                {series.labels[i]}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}