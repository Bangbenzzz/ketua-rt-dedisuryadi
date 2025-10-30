// src/components/warga/modals/AddChoiceModal.tsx
'use client';
import React from 'react';
import Modal from '@/components/common/Modal';
import { UserIcon, UsersIcon } from '@/components/common/Icons';

export default function AddChoiceModal({ onClose, onSelectSingle, onSelectFamily }: { onClose: () => void; onSelectSingle: () => void; onSelectFamily: () => void; }) {
  return (
    <Modal onClose={onClose} title="Pilih Jenis Penambahan" width={480}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 16px', color: '#cbd5e1' }}>Anda ingin menambahkan warga perorangan atau satu keluarga baru?</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button className="btn" onClick={onSelectSingle}><UserIcon /><span>Tambah Perorangan</span></button>
          <button className="btn primary" onClick={onSelectFamily}><UsersIcon /><span>Tambah Keluarga</span></button>
        </div>
      </div>
      <style jsx>{`.btn { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; font-size: 1rem; }`}</style>
    </Modal>
  );
}