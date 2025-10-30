'use client';

import React, { useEffect, useMemo, useRef } from 'react';

type Transaksi = {
  jenis: 'Pemasukan' | 'Pengeluaran';
  nominal: number;
  tanggal: string; // ISO
};

type Props = {
  data: Transaksi[];
  range: 7 | 14 | 30;
  height?: number;
  loopMs?: number; // tidak dipakai
};

// Helpers zona WIB
function getNowJKT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}
function dayKeyJKT(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
}
function buildDays(range: 7 | 14 | 30) {
  const now = getNowJKT();
  const days: { key: string; bd: { year: number; month: number; day: number } }[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      key: dayKeyJKT(d),
      bd: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    });
  }
  return days;
}

// EMA sederhana
function buildEMA(values: number[], period: number) {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[0] : values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export default function DualLineTicker({ data, range, height = 260 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);

  // Olah data ke candle + garis EMA (garis tren hijau kebiruan)
  const { candles, emaLine, buyMarkers } = useMemo(() => {
    const days = buildDays(range);
    const firstKey = days[0]?.key;

    // saldo awal sebelum range
    let saldoAwal = 0;
    for (const t of data) {
      const k = dayKeyJKT(new Date(t.tanggal));
      if (k < firstKey) {
        saldoAwal += (t.jenis === 'Pemasukan' ? 1 : -1) * (t.nominal || 0);
      }
    }

    // sum pemasukan/pengeluaran per hari dalam range
    const sumIn: Record<string, number> = {};
    const sumOut: Record<string, number> = {};
    for (const t of data) {
      const k = dayKeyJKT(new Date(t.tanggal));
      if (!days.find((d) => d.key === k)) continue;
      if (t.jenis === 'Pemasukan') sumIn[k] = (sumIn[k] || 0) + (t.nominal || 0);
      else sumOut[k] = (sumOut[k] || 0) + (t.nominal || 0);
    }

    // bentuk candle dari saldo harian
    let open = saldoAwal;
    const candleArr: Array<{ time: any; open: number; high: number; low: number; close: number }> = [];
    const closes: number[] = [];

    for (const d of days) {
      const pemasukan = sumIn[d.key] || 0;
      const pengeluaran = sumOut[d.key] || 0;
      const close = open + pemasukan - pengeluaran;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      candleArr.push({ time: d.bd, open, high, low, close });
      closes.push(close);
      open = close;
    }

    // EMA periode proporsional dengan range (biar smooth)
    const period = Math.max(3, Math.round(range / 2));
    const emaVals = buildEMA(closes, period);
    const emaLine = emaVals.map((v, i) => ({ time: days[i].bd, value: v }));

    // BUY marker ketika close menembus EMA dari bawah ke atas
    const buyMarkers: Array<{ time: any; position: 'belowBar' | 'aboveBar'; color: string; shape: any; text: string; size?: number }> = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] <= emaVals[i - 1] && closes[i] > emaVals[i]) {
        buyMarkers.push({
          time: days[i].bd,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp', // bawaan library
          text: '',
          size: 2,
        } as any);
      }
    }

    return { candles: candleArr, emaLine, buyMarkers };
  }, [data, range]);

  // Inisialisasi chart
  useEffect(() => {
    let disposed = false;
    let lib: any;
    let ro: ResizeObserver | null = null;

    const init = async () => {
      lib = await import('lightweight-charts');
      if (!containerRef.current || disposed) return;

      const width = Math.max(240, containerRef.current.getBoundingClientRect().width || 0);

      const chart = lib.createChart(containerRef.current, {
        width,
        height,
        layout: {
          background: { color: 'transparent' },
          textColor: '#cbd5e1',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.08)' },
          horzLines: { color: 'rgba(255,255,255,0.08)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.12)',
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.12)',
          rightOffset: 0,
          barSpacing: Math.max(6, Math.floor(width / (range * 3))),
          fixLeftEdge: true,
          fixRightEdge: false,
        },
        crosshair: {
          mode: 0,
        },
        localization: {
          priceFormatter: (p: number) => {
            const a = Math.abs(p);
            const sign = p < 0 ? '-' : '';
            const fmt = (v: number, s: string) => {
              const num = v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '');
              return `${sign}Rp ${num}${s}`;
            };
            if (a >= 1e12) return fmt(a / 1e12, 'T');
            if (a >= 1e9) return fmt(a / 1e9, 'M');
            if (a >= 1e6) return fmt(a / 1e6, 'jt');
            if (a >= 1e3) return `${sign}Rp ${Math.round(a / 1e3)}rb`;
            return `${sign}Rp ${a}`;
          },
        },
      });

      const candle = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        borderVisible: false,
      });

      const line = chart.addLineSeries({
        color: '#2dd4bf', // hijau kebiruan
        lineWidth: 2,
        priceLineVisible: false,
        // gunakan curved line jika tersedia (versi lib baru)
        ...(lib.LineType ? { lineType: lib.LineType.Curved } : {}),
      } as any);

      candle.setData(candles);
      line.setData(emaLine);
      candle.setMarkers(buyMarkers as any);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      candleSeriesRef.current = candle;
      lineSeriesRef.current = line;

      // Responsif
      ro = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        const w = Math.max(240, entries[0].contentRect.width);
        chartRef.current.applyOptions({ width: w, height });
      });
      if (wrapRef.current) ro.observe(wrapRef.current);
    };

    init();

    return () => {
      disposed = true;
      try { ro?.disconnect(); } catch {}
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
        candleSeriesRef.current = null;
        lineSeriesRef.current = null;
      }
    };
  }, [height, range, candles, emaLine, buyMarkers]);

  // Update data saat berubah
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !lineSeriesRef.current) return;
    candleSeriesRef.current.setData(candles);
    lineSeriesRef.current.setData(emaLine);
    candleSeriesRef.current.setMarkers(buyMarkers as any);
    chartRef.current.timeScale().fitContent();
  }, [candles, emaLine, buyMarkers]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: '100%',
        // Background ala gambar: grid halus + dunia samar (opsional: ganti URL peta)
        background:
          'radial-gradient(1000px 600px at 50% -20%, rgba(45,212,191,0.12), transparent 60%), linear-gradient(180deg, rgba(10,12,16,0.9), rgba(10,12,16,0.9))',
        borderRadius: 12,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          // bisa tambahkan backgroundImage peta dunia custom di sini:
          // backgroundImage: 'url(/world-map-lite.png)',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
    </div>
  );
}