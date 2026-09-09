import { loadServerEnvironment } from "@eventrail/config/server";
import { createDatabasePool, PostgresWebhookDeliveryRepository } from "@eventrail/database";
import { WebhookDispatcher } from "./index.js";

const config = loadServerEnvironment(process.env);
const database = createDatabasePool(config.DATABASE_URL);
const dispatcher = new WebhookDispatcher(
  new PostgresWebhookDeliveryRepository(database),
  config.WEBHOOK_SIGNING_KEY,
);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
while (!controller.signal.aborted) {
  const result = await dispatcher.runBatch();
  await delay(result.delivered + result.retried + result.deadLettered === 0 ? 2_000 : 250, controller.signal);
}
await database.end();
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
