import type { NextConfig } from "next";

const config: NextConfig = {
  // A minimal server bundle for the container image (copy public/ and .next/static next to it).
  output: "standalone",
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@lfct/curriculum"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  typedRoutes: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
