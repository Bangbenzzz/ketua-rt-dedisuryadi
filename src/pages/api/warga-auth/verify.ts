// src/pages/api/warga-auth/verify.ts
import type { NextApiRequest, NextApiResponse } from 'next';

// Tipe data untuk respons JSON
type ResponseData = {
  ok: boolean;
  message?: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // Pastikan method-nya adalah POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    // 1. Ambil password dari body request
    const { password } = req.body;

    // 2. Ambil password yang benar dari environment variable
    const correctPassword = process.env.WARGA_PASSWORD;

    // --- BAGIAN DEBUGGING ---
    console.log("===================================");
    console.log("API /warga-auth/verify dipanggil (PAGES ROUTER)");
    console.log("Password dari Client:", `"${password}"`);
    console.log("Password dari .env.local:", `"${correctPassword}"`);
    console.log("Apakah sama?:", password === correctPassword);
    console.log("===================================");
    // ------------------------

    // 3. Validasi
    if (!correctPassword) {
      console.error("ERROR: Variabel WARGA_PASSWORD tidak ditemukan di .env.local!");
      return res.status(500).json({ ok: false, message: 'Kesalahan konfigurasi server.' });
    }
    
    // 4. Bandingkan password
    if (password === correctPassword) {
      // Jika cocok
      return res.status(200).json({ ok: true });
    } else {
      // Jika tidak cocok
      return res.status(401).json({ ok: false, message: 'Password salah.' });
    }

  } catch (error) {
    console.error("API Verify Error:", error);
    return res.status(500).json({ ok: false, message: 'Terjadi kesalahan pada server.' });
  }
}