import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body ?? {};
  const correct = process.env.WARGA_PASSWORD;

  // Jika password belum diset di env, izinkan (fallback dev)
  if (!correct) {
    return res.status(200).json({ ok: true, note: 'WARGA_PASSWORD kosong (fallback diizinkan)' });
  }

  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ ok: false, message: 'Password tidak boleh kosong.' });
  }

  if (password === correct) {
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ ok: false, message: 'Password salah.' });
}