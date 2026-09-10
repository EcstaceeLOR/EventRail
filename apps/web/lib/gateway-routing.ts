export function selectBrowserGatewayUrl(configured: string | undefined): string {
  if (!configured) return "";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_GATEWAY_URL must use HTTP or HTTPS");
  }
  return url.href.replace(/\/$/, "");
}

export const browserGatewayUrl = selectBrowserGatewayUrl(process.env.NEXT_PUBLIC_GATEWAY_URL);
