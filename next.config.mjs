/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone нужен для компактного Docker-образа: server/Dockerfile.
  output: 'standalone',
  images: { unoptimized: true },
  serverExternalPackages: ['pg'],
}

export default nextConfig
