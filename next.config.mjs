/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep `next build` from corrupting an active local preview. Next normally
  // writes both dev and production artifacts into `.next`.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};

export default nextConfig;

