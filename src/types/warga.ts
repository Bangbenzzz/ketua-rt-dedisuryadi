// src/types/warga.ts

export type Peran = 'Kepala Keluarga' | 'Istri' | 'Anak';
export type Status = 'Menikah' | 'Cerai' | 'Lajang';
export type JenisKelamin = 'Laki-laki' | 'Perempuan';
export type Agama = 'Islam' | 'Kristen Protestan' | 'Kristen Katolik' | 'Hindu' | 'Buddha' | 'Khonghucu';
export type Pendidikan = 'Tidak Sekolah' | 'SD/Sederajat' | 'SMP/Sederajat' | 'SMA/Sederajat' | 'Diploma' | 'S1/Sederajat' | 'S2/Sederajat' | 'S3/Sederajat';
export type KategoriUmur = 'Balita' | 'Anak-anak' | 'Remaja' | 'Dewasa' | 'Lansia';

export type Warga = {
  id: string;
  nama: string;
  nik: string;
  noKk: string;
  tglLahir: string;
  peran: Peran;
  status: Status;
  alamat: string;
  rt: string;
  rw: string;
  pekerjaan: string;

  // Field baru
  jenisKelamin: JenisKelamin;
  tempatLahir: string;
  agama: Agama;
  pendidikan: Pendidikan;
};

export type WargaInput = Omit<Warga, 'id'>;

export type KeluargaInput = {
  noKk: string;
  alamat: string;
  rt: string;
  rw: string;
  kepala: Omit<Warga, 'id' | 'noKk' | 'alamat' | 'rt' | 'rw' | 'peran' | 'status'>;
  istri?: Omit<Warga, 'id' | 'noKk' | 'alamat'| 'rt'| 'rw'| 'peran'| 'status'>;
  anak: Array<Omit<Warga, 'id'| 'noKk'| 'alamat'| 'rt'| 'rw'| 'peran'| 'status'>>;
};