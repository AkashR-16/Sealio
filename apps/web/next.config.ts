import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@sealio/types"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Turbopack (default in Next 16) — canvas is an optional Node-only dep of pdfjs-dist, not needed in browser
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
  // Webpack fallback (when --webpack flag is passed)
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

export default nextConfig
