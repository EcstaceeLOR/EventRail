export const browserGatewayUrl = "/gateway";
export const defaultGatewayUpstream = "https://eventrail-preview-gateway.onrender.com";

export function gatewayRewriteDestination(upstream = defaultGatewayUpstream): string {
  const url = new URL(upstream);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_GATEWAY_URL must use HTTP or HTTPS");
  }
  return `${url.href.replace(/\/$/, "")}/:path*`;
}
