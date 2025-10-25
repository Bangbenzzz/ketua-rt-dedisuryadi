// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  // opsional
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Debug ringan di browser: pastikan nyambung ke project yang benar
if (typeof window !== 'undefined') {
  // Tidak menampilkan apiKey
  // @ts-ignore
  console.info('[Firebase] projectId:', app.options?.projectId, '| authDomain:', app.options?.authDomain);
}

// Opsi emulator (aktifkan dengan set NEXT_PUBLIC_FIREBASE_EMULATOR=1 di .env.local)
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.info('[Firebase] menggunakan Emulator (Auth=9099, Firestore=8080)');
  } catch {}
}