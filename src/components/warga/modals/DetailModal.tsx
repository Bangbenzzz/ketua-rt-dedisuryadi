// src/components/warga/modals/DetailModal.tsx
'use client';
import React from 'react';
import Modal from '@/components/common/Modal';
import Badge from '@/components/common/Badge';
import { formatAlamatLengkap } from '@/utils/address';
import type { Warga } from '@/types/warga';

export default function DetailModal({ warga, onClose, onEdit }: { warga: Warga; onClose: () => void; onEdit: () => void; }) {
  const stats = [
    { label: 'Nama', value: warga.nama }, { label: 'NIK', value: <code>{warga.nik}</code> },
    { label: 'Jenis Kelamin', value: warga.jenisKelamin }, { label: 'Tempat, Tgl Lahir', value: `${warga.tempatLahir}, ${warga.tglLahir}` },
    { label: 'Agama', value: warga.agama }, { label: 'Pendidikan', value: warga.pendidikan }, { label: 'Pekerjaan', value: warga.pekerjaan },
    { label: 'No KK', value: <code>{warga.noKk}</code> }, { label: 'Alamat', value: formatAlamatLengkap(warga.alamat, warga.rt, warga.rw) },
    { label: 'Status', value: <Badge>{warga.status}</Badge> }, { label: 'Peran', value: <Badge>{warga.peran}</Badge> },
  ];
  return (
    <Modal onClose={onClose} title="Detail Warga">
      <div className="detailGrid">{stats.map(s => (<React.Fragment key={s.label}><span className="lbl">{s.label}</span><span className="val">{s.value}</span></React.Fragment>))}</div>
      <footer className="modalFoot"><button className="btn" onClick={onClose}>Tutup</button><button className="btn primary" onClick={onEdit}>Edit</button></footer>
      <style jsx>{`.detailGrid { display: grid; grid-template-columns: 140px 1fr; gap: 12px; } .lbl { color: #9ca3af; } .val { word-break: break-all; } .modalFoot { margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.1); display: flex; justify-content: flex-end; gap: 10px; }`}</style>
    </Modal>
  );
}