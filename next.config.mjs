/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone нужен для компактного Docker-образа: server/Dockerfile.
  output: 'standalone',
  images: { unoptimized: true },
  serverExternalPackages: ['pg'],
  async rewrites() {
    return [
      // Шрифты для веб-клиента идут через наш сервер, а не напрямую из
      // браузера в Google: так адрес посетителя не уходит третьей стороне.
      { source: '/webclient/gfonts/:path*', destination: 'https://fonts.gstatic.com/:path*' },
    ]
  },
}

export default nextConfig
