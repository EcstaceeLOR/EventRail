import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@eventrail/api-client",
    "@eventrail/config",
    "@eventrail/core",
    "@eventrail/react",
    "@eventrail/trading",
    "@eventrail/types",
  ],
};

export default nextConfig;
