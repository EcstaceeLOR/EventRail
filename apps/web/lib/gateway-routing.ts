export const defaultGatewayUpstream = "https://eventrail-preview-gateway.onrender.com";

export function selectBrowserGatewayUrl(configured: string | undefined): string {
  const url = new URL(configured || defaultGatewayUpstream);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_GATEWAY_URL must use HTTP or HTTPS");
  }
  return url.href.replace(/\/$/, "");
}

export const browserGatewayUrl = selectBrowserGatewayUrl(process.env.NEXT_PUBLIC_GATEWAY_URL);
