/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // in-portal PDF viewer (pdf.js) — served as JavaScript modules
        source: '/pdfjs/:file(.*\\.mjs)',
        headers: [
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
    ];
  },
};

export default nextConfig;
