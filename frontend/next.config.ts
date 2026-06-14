import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' makes `next build` emit a self-contained server bundle at
  // .next/standalone — a minimal node_modules (only what the server actually
  // traces/imports) plus a server.js entrypoint. The Docker runner stage copies
  // that instead of the full node_modules, cutting the final image from ~1GB+ to
  // a few hundred MB. Started with `node server.js`, not `next start`.
  output: "standalone",
};

export default nextConfig;
