import { createClient } from "redis";

export async function connectEventRailRedis(url: string) {
  const client = createClient({ url });
  await client.connect();
  return client;
}
