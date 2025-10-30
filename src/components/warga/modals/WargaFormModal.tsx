// src/components/warga/modals/WargaFormModal.tsx
'use client';

import React, { useState, useMemo } from 'react';
import Modal from '../../common/Modal';
import { formatAlamatLengkap, pad2 } from '../../../utils/address';
import type { Warga, WargaInput, Peran, Status, JenisKelamin, Agama, Pendidikan } from '../../../types/warga';
import { TrashIcon } from '../../common/Icons'; // Asumsi ikon ada di file terpisah

export default function WargaFormModal({
  initial,
  onClose,
  onSubmit,
  onQuickAddChild,
}: {
  initial?: Warga;
  onClose: () => void;
  onSubmit: (w: WargaInput) => void;
  onQuickAddChild: (c: Omit<WargaInput, 'id' | 'noKk' | 'alamat' | 'rt' | 'rw' | 'peran' | 'status'>) => void;
}) {
  const [w, setW] = useState<WargaInput>(() =>
    initial
      ? { ...initial } // Jika edit, ambil semua data yang ada
      : {
          // Default untuk data baru
          nama: '', nik: '', noKk: '', tglLahir: '', peran: 'Anak', status: 'Lajang',
          alamat: 'Kp. Cikadu', rt: '02', rw: '19', pekerjaan: '',
          // Default untuk field baru
          jenisKelamin: 'Laki-laki', tempatLahir: '', agama: 'Islam', pendidikan: 'SMA/Sederajat',
        }
  );

  const [showAddAnak, setShowAddAnak] = useState(false);
  const [anak, setAnak] = useState({
    nama: '', nik: '', tglLahir: '', pekerjaan: '', tempatLahir: '',
    jenisKelamin: 'Laki-laki' as JenisKelamin, agama: 'Islam' as Agama, pendidikan: 'SMA/Sederajat' as Pendidikan,
  });

  const alamatLengkap = useMemo(() => formatAlamatLengkap(w.alamat, w.rt, w.rw), [w.alamat, w.rt, w.rw]);
  
  function setField<K extends keyof WargaInput>(field: K, value: WargaInput[K]) {
    setW(curr => ({ ...curr, [field]: value }));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...w, rt: pad2(w.rt), rw: pad2(w.rw) });
  };

  const handleAddAnak = (e: React.FormEvent) => {
    e.preventDefault();
    // Kirim semua field anak yang baru
    onQuickAddChild(anak); 
    // Reset form anak
    setAnak({ nama: '', nik: '', tglLahir: '', pekerjaan: '', tempatLahir: '', jenisKelamin: 'Laki-laki', agama: 'Islam', pendidikan: 'SMA/Sederajat' });
    setShowAddAnak(false);
  };

  const title = initial ? 'Edit Warga' : 'Tambah Warga Perorangan';

  return (
    <Modal onClose={onClose} title={title} width={720}>
      <form onSubmit={handleSubmit} className="formGrid">
        
        {/* Grup Info Pribadi */}
        <div className="group full">
          <h4>Info Pribadi</h4>
          <div className="field">
            <label>Nama Lengkap</label>
            <input value={w.nama} onChange={(e) => setField('nama', e.target.value)} required />
          </div>
          <div className="field">
            <label>NIK (16 digit)</label>
            <input value={w.nik} onChange={(e) => setField('nik', e.target.value)} maxLength={16} required />
          </div>
          <div className="field">
            <label>Jenis Kelamin</label>
            <select value={w.jenisKelamin} onChange={(e) => setField('jenisKelamin', e.target.value as JenisKelamin)}>
              <option>Laki-laki</option>
              <option>Perempuan</option>
            </select>
          </div>
          <div className="field">
            <label>Tempat Lahir</label>
            <input value={w.tempatLahir} onChange={(e) => setField('tempatLahir', e.target.value)} required />
          </div>
          <div className="field full">
            <label>Tanggal Lahir</label>
            <input type="date" value={w.tglLahir} onChange={(e) => setField('tglLahir', e.target.value)} required />
          </div>
        </div>

        {/* Grup Info Tambahan */}
        <div className="group full">
          <h4>Info Tambahan</h4>
          <div className="field">
            <label>Agama</label>
            <select value={w.agama} onChange={(e) => setField('agama', e.target.value as Agama)}>
              <option>Islam</option><option>Kristen Protestan</option><option>Kristen Katolik</option><option>Hindu</option><option>Buddha</option><option>Khonghucu</option>
            </select>
          </div>
          <div className="field">
            <label>Pendidikan Terakhir</label>
            <select value={w.pendidikan} onChange={(e) => setField('pendidikan', e.target.value as Pendidikan)}>
              <option>Tidak Sekolah</option><option>SD/Sederajat</option><option>SMP/Sederajat</option><option>SMA/Sederajat</option><option>Diploma</option><option>S1/Sederajat</option><option>S2/Sederajat</option><option>S3/Sederajat</option>
            </select>
          </div>
          <div className="field full">
            <label>Pekerjaan</label>
            <input value={w.pekerjaan} onChange={(e) => setField('pekerjaan', e.target.value)} required />
          </div>
        </div>

        {/* Grup Info Keluarga & Alamat */}
        <div className="group full">
          <h4>Info Keluarga & Alamat</h4>
          <div className="field">
            <label>No KK (16 digit)</label>
            <input value={w.noKk} onChange={(e) => setField('noKk', e.target.value)} maxLength={16} required />
          </div>
          <div className="field">
            <label>Alamat</label>
            <input value={w.alamat} onChange={(e) => setField('alamat', e.target.value)} />
          </div>
          <div className="field"><label>RT</label><input value={w.rt} onChange={(e) => setField('rt', pad2(e.target.value))} /></div>
          <div className="field"><label>RW</label><input value={w.rw} onChange={(e) => setField('rw', pad2(e.target.value))} /></div>
          <div className="field full"><label>Alamat Lengkap (Auto)</label><input value={alamatLengkap} readOnly /></div>
          <div className="field">
            <label>Peran Keluarga</label>
            <select value={w.peran} onChange={(e) => setField('peran', e.target.value as Peran)}><option>Kepala Keluarga</option><option>Istri</option><option>Anak</option></select>
          </div>
          <div className="field">
            <label>Status Pernikahan</label>
            <select value={w.status} onChange={(e) => setField('status', e.target.value as Status)}><option>Lajang</option><option>Menikah</option><option>Cerai</option></select>
          </div>
        </div>

        <footer className="modalFoot full">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary">Simpan</button>
        </footer>
      </form>

      {/* Quick Add Anak (hanya muncul jika mengedit KK/Istri) */}
      {initial && (w.peran === 'Kepala Keluarga' || w.peran === 'Istri') && (
        <div className="quickAdd">
          <button className="btn" onClick={() => setShowAddAnak(s => !s)}>
            {showAddAnak ? 'Batal Tambah Anak' : `+ Tambah Anak ke KK ${w.noKk}`}
          </button>
          {showAddAnak && (
             <form onSubmit={handleAddAnak} className="formGrid">
                {/* Form quick add anak juga perlu diupdate dengan field baru jika diperlukan */}
                <p>Fitur ini akan ditambahkan nanti.</p>
                <button type="submit" className="btn primary">Simpan Anak</button>
             </form>
          )}
        </div>
      )}

      <style jsx>{`
        .formGrid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .group { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; align-content: start; border: 1px solid rgba(255,255,255,.1); padding: 12px; border-radius: 12px; }
        .group h4 { margin: 0 0 8px; color: #a7f3d0; font-size: 1rem; grid-column: 1 / -1; border-bottom: 1px solid rgba(255,255,255,.1); padding-bottom: 8px; }
        .full, .field.full { grid-column: 1 / -1; }
        .field { display: grid; gap: 4px; }
        label { color: #9ca3af; font-size: .85rem; }
        input, select { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 8px 10px; border-radius: 8px; width: 100%; }
        input:read-only { background: rgba(0,0,0,.2); cursor: not-allowed; }
        
        .modalFoot { margin-top: 12px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.12); display: flex; justify-content: flex-end; gap: 10px; }
        .btn { background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 8px 12px; border-radius: 8px; font-weight: 500; }
        .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
        
        .quickAdd { margin-top: 16px; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,.2); display: grid; gap: 12px; }
        .quickAdd .btn { background: #3b82f6; color: #fff; border: none; }
        
        @media (max-width: 640px) {
          .group { grid-template-columns: 1fr; }
        }
      `}</style>
    </Modal>
  );
}