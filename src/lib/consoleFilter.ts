// src/lib/consoleFilter.ts
declare global {
    interface Window {
      __consoleFilterInstalled?: boolean;
    }
  }
  
  // Saring log yang berisi potongan source/rules yang mengganggu saat dev
  export function installConsoleFilter() {
    if (typeof window === 'undefined') return;
    if (window.__consoleFilterInstalled) return;
    window.__consoleFilterInstalled = true;
  
    const orig = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      info: console.info,
    };
  
    const patterns: RegExp[] = [
      /rules_version\b/i,
      /service cloud\.firestore\b/i,
      /match\s+\/transaksi\b/i,
      /match\s+\/warga\b/i,
      /Koleksi transaksi/i,
      /src\/app\/layout\.tsx/i,
      /export default function RootLayout/i,
      /import type \{ Metadata/i,
      /Download the React DevTools/i, // hilangkan pesan devtools juga kalau mau
    ];
  
    const shouldSkip = (args: unknown[]) => {
      try {
        const s = args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' ');
        return patterns.some((re) => re.test(s));
      } catch {
        return false;
      }
    };
  
    console.log = (...args) => { if (!shouldSkip(args)) orig.log(...args); };
    console.warn = (...args) => { if (!shouldSkip(args)) orig.warn(...args); };
    console.debug = (...args) => { if (!shouldSkip(args)) orig.debug(...args); };
    console.info = (...args) => { if (!shouldSkip(args)) orig.info(...args); };
    // Untuk error sebaiknya tetap tampil, tapi kalau mau disaring juga:
    // console.error = (...args) => { if (!shouldSkip(args)) orig.error(...args); };
  }