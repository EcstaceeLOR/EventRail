import { createGateway } from "./app.js";

const port = Number(process.env.PORT ?? 4_000);
const host = process.env.HOST ?? "127.0.0.1";

const app = createGateway();
await app.listen({ host, port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
