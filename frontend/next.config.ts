import type { NextConfig } from "next";

const apiUrl = process.env.API_URL || "http://127.0.0.1:8484";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${apiUrl}/media/:path*` }];
  },
};

export default nextConfig;
