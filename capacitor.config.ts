import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.benzzzz.rtcikadu',
  appName: 'Admin RT Cikadu',
  webDir: 'out',
  server: {
    // INI YANG DIUBAH
    url: 'https://slangiest-collinearly-lukas.ngrok-free.dev',
    cleartext: false
  }
};

export default config;