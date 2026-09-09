import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@eventrail/config", "@eventrail/core", "@eventrail/react", "@eventrail/types"],
};

export default nextConfig;
