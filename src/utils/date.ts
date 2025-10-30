// utils/date.ts
import type { KategoriUmur } from '../types/warga';

export function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function getAge(ymd: string, now = new Date()) {
  const birth = parseYmd(ymd);
  if (!birth) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return Math.max(0, age);
}

export function getKategoriUmur(age: number): KategoriUmur {
  if (age <= 5) return 'Balita';
  if (age <= 12) return 'Anak-anak';
  if (age <= 17) return 'Remaja';
  if (age <= 59) return 'Dewasa';
  return 'Lansia';
}

export function validateNik(nik: string) { return /^\d{16}$/.test(nik); }
export function validateNoKk(noKk: string) { return /^\d{16}$/.test(noKk); }
export function validateDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !!parseYmd(s); }