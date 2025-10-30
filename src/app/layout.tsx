// File: src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css"; // CSS global Anda

export const metadata: Metadata = {
  title: "Ketua RT. 02 Dedi Suryadi",
  description: "Aplikasi pencatatan pemasukan dan pengeluaran Kp. Cikadu.",
  
  // --- INI ADALAH KUNCI UTAMANYA ---
  // Mengaktifkan "safe area" di perangkat mobile
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}