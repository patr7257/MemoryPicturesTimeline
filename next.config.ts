import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker image runs `node server.js` without a
  // full node_modules install (Dokploy deploy, see Dockerfile).
  output: "standalone",
  typedRoutes: true,
  reactCompiler: true,
  // No next/image optimization: thumbnails are pre-generated fixed-size WebP
  // at upload time (sharp) and streamed through the authenticated
  // /api/img/[id]/[size] proxy, so runtime optimization has nothing to add.
  images: { unoptimized: true },
};

export default nextConfig;
