import { createClient } from "redis";

export async function connectEventRailRedis(url: string, ca?: string) {
  const client = createClient({ url, ...(ca ? { socket: { tls: true, ca } } : {}) });
  await client.connect();
  return client;
}
