// src/lib/consoleFilter.ts
export function installConsoleFilter() {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
  
    console.error = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      // sembunyikan noise umum saat dev
      if (
        msg.includes('Did not expect server HTML') ||
        msg.includes('Expected server HTML') ||
        msg.includes('useLayoutEffect does nothing on the server')
      ) return;
      origError(...args);
    };
  
    console.warn = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      if (msg.includes('Deprecated')) return;
      origWarn(...args);
    };
  
    // fungsi restore (opsional)
    return () => {
      console.error = origError;
      console.warn = origWarn;
    };
  }