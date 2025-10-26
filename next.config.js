// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    // Hilangkan semua console di production kecuali error
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
};

module.exports = nextConfig;