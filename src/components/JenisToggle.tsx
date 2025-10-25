'use client';

import { useId } from 'react';

type Props = {
  name: string;
  defaultValue?: 'Pemasukan' | 'Pengeluaran';
  required?: boolean;
  className?: string;
};

export default function JenisToggle({ name, defaultValue = 'Pemasukan', required, className }: Props) {
  const uid = useId();
  const idIn = `in-${uid}`;
  const idOut = `out-${uid}`;

  return (
    <>
      <div className={`seg ${className || ''}`} role="radiogroup" aria-label="Jenis Transaksi">
        <input
          id={idIn}
          type="radio"
          name={name}
          value="Pemasukan"
          defaultChecked={defaultValue === 'Pemasukan'}
          required={required}
          className="radio"
        />
        <label htmlFor={idIn} className="opt optIn">
          <span className="dot dotIn" aria-hidden />
          Pemasukan
        </label>

        <input
          id={idOut}
          type="radio"
          name={name}
          value="Pengeluaran"
          defaultChecked={defaultValue === 'Pengeluaran'}
          required={required}
          className="radio"
        />
        <label htmlFor={idOut} className="opt optOut">
          <span className="dot dotOut" aria-hidden />
          Pengeluaran
        </label>
      </div>

      <style jsx>{`
        .seg {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 6px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }
        .radio {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .opt {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 44px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: #e5e7eb;
          font-weight: 700;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: all 0.18s ease;
          user-select: none;
          font-size: clamp(0.85rem, 2.4vw, 0.95rem);
        }
        .opt:hover {
          background: rgba(255, 255, 255, 0.07);
          transform: translateY(-1px);
        }
        /* Fokus keyboard pada input mem-”ring” label */
        .radio:focus-visible + .opt {
          outline: none;
          box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.15);
        }
        /* Pemasukan terpilih */
        #${idIn}:checked + .optIn {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-color: rgba(34, 197, 94, 0.5);
          color: #fff;
          box-shadow: 0 10px 30px rgba(34, 197, 94, 0.35);
        }
        /* Pengeluaran terpilih */
        #${idOut}:checked + .optOut {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fff;
          box-shadow: 0 10px 30px rgba(239, 68, 68, 0.35);
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
        }
        .dotIn { background: #86efac; }
        .dotOut { background: #fca5a5; }
      `}</style>
    </>
  );
}