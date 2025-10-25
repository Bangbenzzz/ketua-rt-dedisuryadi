// src/components/Spinner.tsx
'use client';

import React from 'react';

type SpinnerProps = {
  size?: number;      // px
  thickness?: number; // px
  color?: string;     // CSS color
};

export function Spinner({ size = 32, thickness = 3, color = '#22c55e' }: SpinnerProps) {
  return (
    <>
      <div
        className="spinner"
        style={
          {
            '--size': `${size}px`,
            '--thick': `${thickness}px`,
            '--color': color,
          } as React.CSSProperties
        }
        aria-label="Loading"
      />
      <style jsx>{`
        .spinner {
          width: var(--size);
          height: var(--size);
          border-radius: 999px;
          border: var(--thick) solid rgba(255, 255, 255, 0.15);
          border-top-color: var(--color);
          animation: spin 0.9s linear infinite;
          box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.06);
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

export function FullscreenSpinner({ color = '#22c55e' }: { color?: string }) {
  return (
    <>
      <div className="fs">
        <div className="box">
          <Spinner size={46} thickness={4} color={color} />
        </div>
      </div>
      <style jsx>{`
        .fs {
          position: fixed; inset: 0;
          display: grid; place-items: center;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(4px);
          z-index: 60;
        }
        .box {
          padding: 14px; border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(20, 22, 28, 0.6);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
        }
      `}</style>
    </>
  );
}