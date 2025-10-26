// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const year = new Date().getFullYear();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      const fb = err as FirebaseError;
      console.error('Login error:', fb.code, fb.message);

      let base = 'Terjadi kesalahan. Coba lagi.';
      switch (fb.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          base = 'Email atau kata sandi salah.';
          break;
        case 'auth/invalid-email':
          base = 'Format email tidak valid.';
          break;
        case 'auth/user-disabled':
          base = 'Akun dinonaktifkan. Hubungi admin.';
          break;
        case 'auth/too-many-requests':
          base = 'Terlalu banyak percobaan. Coba lagi nanti.';
          break;
        case 'auth/network-request-failed':
          base = 'Gagal terhubung ke jaringan. Periksa koneksi internet Anda.';
          break;
        case 'auth/operation-not-allowed':
          base = 'Metode Email/Password belum diaktifkan di Firebase Console.';
          break;
        case 'auth/invalid-api-key':
        case 'auth/configuration-not-found':
          base = 'Konfigurasi Firebase tidak valid. Cek .env dan Project Settings.';
          break;
      }

      // Saat dev, tampilkan kode error untuk diagnosa cepat
      const showCode = process.env.NODE_ENV !== 'production' && fb.code ? ` [${fb.code}]` : '';
      setErrorMsg(base + showCode);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.bgDecor} aria-hidden />
      <section className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logoWrap}>
            <Image
              src="/logo.svg"
              alt="Logo"
              width={100}
              height={100}
              priority
              className={styles.logoImg}
              draggable={false}
            />
          </div>
          <h1 className={styles.title}>Selamat Datang!</h1>
          <p className={styles.sub}>Website Resmi Kp. Cikadu RT. 02</p>
        </div>

        <form onSubmit={onSubmit} className={styles.form} autoComplete="off" noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Masukan Email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Kata sandi</label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Masukan Password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.eye}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.6 10.7A3 3 0 0013.3 13.4" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M9.9 5.1A9.9 9.9 0 0121 12s-3.6 6.5-9 6.9M6.3 6.3A9.9 9.9 0 003 12s3.6 6.5 9 6.9" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {errorMsg && <p className={styles.err} role="alert">{errorMsg}</p>}

          <button
            className={`${styles.btn} ${styles.primary}`}
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p className={styles.footer}>© {year} Kp. Cikadu RT. 02 All Rights Reserved. Inc</p>
      </section>
    </main>
  );
}