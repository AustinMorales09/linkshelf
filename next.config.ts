import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the demo snapshot with the server functions (copied to /tmp on Vercel; see lib/db.ts).
  outputFileTracingIncludes: { "/**": ["./seed/**/*"] },
  // Pin the data folder to this project, no matter which directory the server is started from.
  env: { APP_DIR: __dirname },
  // Product files are uploaded through server actions; allow up to 25 MB.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  // Public pages live at /@handle. A folder named "@handle" would be a parallel-route slot, so rewrite instead.
  async rewrites() {
    return [
      { source: "/@:handle", destination: "/u/:handle" },
      { source: "/@:handle/p/:id", destination: "/u/:handle/p/:id" },
    ];
  },
};

export default nextConfig;
