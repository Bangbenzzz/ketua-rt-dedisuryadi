import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const correct = process.env.WARGA_PASSWORD;

    // Jika password belum diset di env, izinkan (fallback dev)
    if (!correct) {
      return NextResponse.json({ ok: true, note: 'WARGA_PASSWORD kosong (fallback diizinkan)' }, { status: 200 });
    }

    if (typeof password !== 'string' || password.length === 0) {
      return NextResponse.json({ ok: false, message: 'Password tidak boleh kosong.' }, { status: 400 });
    }

    if (password === correct) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: false, message: 'Password salah.' }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  }
}