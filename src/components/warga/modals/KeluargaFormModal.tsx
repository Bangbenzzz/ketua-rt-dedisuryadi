// src/components/warga/modals/KeluargaFormModal.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Modal from '../../common/Modal';
import { formatAlamatLengkap, pad2 } from '../../../utils/address';
import type { KeluargaInput, JenisKelamin, Agama, Pendidikan } from '../../../types/warga';
import { TrashIcon } from '../../common/Icons';

// Tipe data lokal untuk state form, agar lebih mudah dikelola
type AnggotaForm = {
  nama: string;
  nik: string;
  jenisKelamin: JenisKelamin;
  tempatLahir: string;
  tglLahir: string;
  agama: Agama;
  pendidikan: Pendidikan;
  pekerjaan: string;
};

const initialAnggotaState: AnggotaForm = {
  nama: '', nik: '', jenisKelamin: 'Laki-laki', tempatLahir: '', tglLahir: '',
  agama: 'Islam', pendidikan: 'SMA/Sederajat', pekerjaan: '',
};

export default function KeluargaFormModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (k: KeluargaInput) => void; }) {
  const [noKk, setNoKk] = useState('');
  const [alamat, setAlamat] = useState('Kp. Cikadu');
  const [rt, setRt] = useState('02');
  const [rw, setRw] = useState('19');

  const [kepala, setKepala] = useState<AnggotaForm>({ ...initialAnggotaState });
  const [istri, setIstri] = useState<AnggotaForm>({ ...initialAnggotaState, jenisKelamin: 'Perempuan' });
  const [anak, setAnak] = useState<AnggotaForm[]>([]);

  const alamatLengkap = useMemo(() => formatAlamatLengkap(alamat, rt, rw), [alamat, rt, rw]);

  const setK = <K extends keyof AnggotaForm>(field: K, value: AnggotaForm[K]) => setKepala(c => ({ ...c, [field]: value }));
  const setI = <K extends keyof AnggotaForm>(field: K, value: AnggotaForm[K]) => setIstri(c => ({ ...c, [field]: value }));
  const setA = <K extends keyof AnggotaForm>(idx: number, field: K, value: AnggotaForm[K]) => {
    setAnak(curr => curr.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };
  const addAnak = () => setAnak(curr => [...curr, { ...initialAnggotaState }]);
  const removeAnak = (idx: number) => setAnak(curr => curr.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      noKk,
      alamat: alamat.trim() || 'Kp. Cikadu',
      rt: pad2(rt),
      rw: pad2(rw),
      kepala,
      istri: istri.nama || istri.nik ? istri : undefined, // Kirim istri jika ada nama/NIK
      anak,
    });
  };

  return (
    <Modal onClose={onClose} title="Tambah Keluarga Baru (KK)" width={900}>
      <form onSubmit={handleSubmit} className="formGrid">
        {/* Info KK */}
        <div className="group full">
          <h4>Info Kartu Keluarga</h4>
          <div className="field"><label>No KK (16 digit)</label><input value={noKk} onChange={(e) => setNoKk(e.target.value)} maxLength={16} required/></div>
          <div className="field"><label>Alamat</label><input value={alamat} onChange={(e) => setAlamat(e.target.value)} /></div>
          <div className="field"><label>RT</label><input value={rt} onChange={(e) => setRt(pad2(e.target.value))} /></div>
          <div className="field"><label>RW</label><input value={rw} onChange={(e) => setRw(pad2(e.target.value))} /></div>
          <div className="field full"><label>Alamat Lengkap (Auto)</label><input value={alamatLengkap} readOnly /></div>
        </div>

        {/* Kepala Keluarga */}
        <div className="group full">
          <h4>Kepala Keluarga (Wajib)</h4>
          <div className="field"><label>Nama</label><input value={kepala.nama} onChange={e => setK('nama', e.target.value)} required /></div>
          <div className="field"><label>NIK</label><input value={kepala.nik} onChange={e => setK('nik', e.target.value)} maxLength={16} required /></div>
          <div className="field"><label>Tempat Lahir</label><input value={kepala.tempatLahir} onChange={e => setK('tempatLahir', e.target.value)} required /></div>
          <div className="field"><label>Tgl Lahir</label><input type="date" value={kepala.tglLahir} onChange={e => setK('tglLahir', e.target.value)} required /></div>
          <div className="field"><label>Pekerjaan</label><input value={kepala.pekerjaan} onChange={e => setK('pekerjaan', e.target.value)} required /></div>
        </div>
        
        {/* Istri */}
        <div className="group full">
          <h4>Istri (Opsional)</h4>
          <div className="field"><label>Nama</label><input value={istri.nama} onChange={e => setI('nama', e.target.value)} /></div>
          <div className="field"><label>NIK</label><input value={istri.nik} onChange={e => setI('nik', e.target.value)} maxLength={16} /></div>
          <div className="field"><label>Tempat Lahir</label><input value={istri.tempatLahir} onChange={e => setI('tempatLahir', e.target.value)} /></div>
          <div className="field"><label>Tgl Lahir</label><input type="date" value={istri.tglLahir} onChange={e => setI('tglLahir', e.target.value)} /></div>
          <div className="field"><label>Pekerjaan</label><input value={istri.pekerjaan} onChange={e => setI('pekerjaan', e.target.value)} /></div>
        </div>

        {/* Anak */}
        <div className="group full">
          <h4>Anak-anak (Opsional)</h4>
          {anak.map((a, idx) => (
            <div key={idx} className="anak-row">
              <span className="anak-no">#{idx + 1}</span>
              <div className="field"><label>Nama</label><input value={a.nama} onChange={e => setA(idx, 'nama', e.target.value)} /></div>
              <div className="field"><label>NIK</label><input value={a.nik} onChange={e => setA(idx, 'nik', e.target.value)} maxLength={16} /></div>
              <div className="field"><label>Tempat Lahir</label><input value={a.tempatLahir} onChange={e => setA(idx, 'tempatLahir', e.target.value)} /></div>
              <div className="field"><label>Tgl Lahir</label><input type="date" value={a.tglLahir} onChange={e => setA(idx, 'tglLahir', e.target.value)} /></div>
              <div className="field"><label>Pekerjaan</label><input value={a.pekerjaan} onChange={e => setA(idx, 'pekerjaan', e.target.value)} /></div>
              <button type="button" className="btn danger sm" onClick={() => removeAnak(idx)} title="Hapus anak"><TrashIcon /></button>
            </div>
          ))}
          <button type="button" className="btn" onClick={addAnak} style={{ justifySelf: 'start' }}>+ Tambah Anak</button>
        </div>

        <footer className="modalFoot full">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary">Simpan Keluarga</button>
        </footer>
      </form>
      <style jsx>{`
        .formGrid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .group { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 12px; align-content: start; border: 1px solid rgba(255,255,255,.1); padding: 12px; border-radius: 12px; }
        .group h4 { margin: 0 0 8px; color: #a7f3d0; font-size: 1rem; grid-column: 1 / -1; border-bottom: 1px solid rgba(255,255,255,.1); padding-bottom: 8px; }
        .full, .field.full { grid-column: 1 / -1; }
        .field { display: grid; gap: 4px; }
        label { color: #9ca3af; font-size: .85rem; }
        input, select { background: rgba(255,255,255,.04); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 8px 10px; border-radius: 8px; width: 100%; }
        input:read-only { background: rgba(0,0,0,.2); cursor: not-allowed; }
        .anak-row { display: grid; grid-template-columns: 30px repeat(5, 1fr) auto; gap: 10px; align-items: end; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,.05); }
        .anak-no { align-self: center; color: #9ca3af; }
        .modalFoot { margin-top: 12px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.12); display: flex; justify-content: flex-end; gap: 10px; }
        .btn { background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12); padding: 8px 12px; border-radius: 8px; font-weight: 500; cursor: pointer; }
        .btn.primary { background: #22c55e; color: #fff; border: none; font-weight: 700; }
        .btn.danger.sm { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; background: rgba(239,68,68, .2); color: #fca5a5; }
      `}</style>
    </Modal>
  );
}