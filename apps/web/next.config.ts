import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  transpilePackages: [
    "@eventrail/api-client",
    "@eventrail/config",
    "@eventrail/core",
    "@eventrail/react",
    "@eventrail/trading",
    "@eventrail/types",
  ],
  async headers() {
    return securityHeaders();
  },
};

function securityHeaders() {
  const headers = [
    { key: "Content-Security-Policy", value: csp() },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
  return [{ source: "/:path*", headers }];
}

function csp() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://*.somnia.network wss://*.somnia.network https://*.somnia.host wss://*.walletconnect.com https://*.walletconnect.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default nextConfig;
