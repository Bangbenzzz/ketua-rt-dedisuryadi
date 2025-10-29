import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.benzzzz.rtcikadu',
  appName: 'Admin RT Cikadu',
  webDir: 'out',
  server: {
    // === UBAH BAGIAN INI ===
    url: 'https://admin-rt-kp-cikadu.vercel.app', // GANTI DENGAN URL VERCEL-MU
    cleartext: false
  }
};

export default config;
