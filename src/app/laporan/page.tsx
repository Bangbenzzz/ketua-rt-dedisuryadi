'use client';

export default function LaporanPage() {
  return (
    <main className="page">
      <div className="bgDecor" aria-hidden />
      <section className="container">
        <div className="card">
          <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Laporan</h1>
          <p style={{ color: '#9ca3af' }}>Halaman laporan- - WEB ENGINEER NIKI (coming soon).</p>
        </div>
      </section>

      <style jsx>{`
        .page { min-height: 100svh; color: #e5e7eb; padding: clamp(8px,3vw,24px); overflow-x: hidden;
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(99,102,241,0.15), transparent 40%),
            radial-gradient(900px circle at 90% 110%, rgba(236,72,153,0.12), transparent 40%),
            linear-gradient(180deg, #0b0f17, #0a0d14 60%, #080b11); }
        .bgDecor { position: fixed; inset: -40% -10% -10% -10%; background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 18px 18px; pointer-events: none; }
        .container { max-width: 1040px; margin: 0 auto; padding-inline: clamp(8px,3vw,20px); }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: rgba(20,22,28,0.6); backdrop-filter: blur(14px); padding: 16px; }
      `}</style>
    </main>
  );
}