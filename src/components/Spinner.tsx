// src/components/Spinner.tsx
'use client';

type SpinnerProps = { size?: number; label?: string };

export const Spinner = ({ size = 24, label }: SpinnerProps) => {
  return (
    <div style={{ display: 'inline-grid', placeItems: 'center', gap: 8, color: '#9ca3af' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor">
        <g fill="none" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9.5" strokeOpacity=".3" />
          <path d="M12 2.5a9.5 9.5 0 0 1 0 19z">
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="0.9s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </svg>
      {label ? <span style={{ fontSize: 13 }}>{label}</span> : null}
    </div>
  );
};

export function FullscreenSpinner({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Spinner size={26} label={label} />
    </div>
  );
}

export default Spinner;