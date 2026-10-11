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
  async headers() {
    return [
      // Pages and the manifest always revalidate so a Home Screen app never
      // keeps an old build (a prerendered page otherwise gets only s-maxage).
      // /api (the image proxy sets its own caching) and hashed assets excluded.
      {
        source: "/((?!_next/static|_next/image|api/|sw\\.js).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      // The push worker is registered by path: never cache it.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
