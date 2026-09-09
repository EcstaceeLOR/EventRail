import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@eventrail/core", "@eventrail/types"],
};

export default nextConfig;
