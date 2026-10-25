import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This project uses `tsc --noEmit` for lint/type checks and does not install ESLint.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

