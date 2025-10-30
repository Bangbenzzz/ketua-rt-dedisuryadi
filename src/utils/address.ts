// src/utils/address.ts

/**
 * Membuat nilai 2 digit (contoh: '2' -> '02', '9' -> '09').
 * Hanya menyisakan angka dan memotong ke 2 digit pertama.
 */
export function pad2(v: string | number) {
    const clean = String(v ?? '').replace(/\D/g, '').slice(0, 2);
    return clean.padStart(2, '0');
  }
  
  /**
   * Format alamat lengkap sesuai kebutuhan aplikasi.
   * Contoh hasil:
   * "Kp. Cikadu, RT. 02 RW. 19 Desa Dayeuh Kecamatan Cileungsi Kab. Bogor"
   */
  export function formatAlamatLengkap(alamat: string, rt: string, rw: string) {
    return `${alamat}, RT. ${pad2(rt)} RW. ${pad2(rw)} Desa Dayeuh Kecamatan Cileungsi Kab. Bogor`;
  }