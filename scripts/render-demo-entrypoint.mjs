import { spawn, spawnSync } from "node:child_process";

const migration = spawnSync(process.execPath, ["packages/database/scripts/migrate.mjs", "up"], {
  env: process.env,
  stdio: "inherit",
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const components = [
  ["gateway", "apps/gateway/dist/index.js"],
  ["market-sync", "workers/market-sync/dist/runner.js"],
  ["receipts", "workers/receipts/dist/runner.js"],
  ["settlement", "workers/settlement/dist/runner.js"],
  ["webhooks", "workers/webhooks/dist/runner.js"],
];

const children = new Map();
let stopping = false;

for (const [name, script] of components) {
  const child = spawn(process.execPath, [script], { env: process.env, stdio: "inherit" });
  children.set(name, child);
  child.once("error", (error) => {
    console.error(`EventRail ${name} failed to start`, { message: error.message });
    stop("SIGTERM", 1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.error(`EventRail ${name} stopped unexpectedly`, { code, signal });
    stop("SIGTERM", code ?? 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal, 0));
}

function stop(signal, exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) {
    if (!child.killed) child.kill(signal);
  }
  const forceExit = setTimeout(() => process.exit(exitCode), 15_000);
  forceExit.unref();
  Promise.allSettled(
    [...children.values()].map(
      (child) =>
        new Promise((resolve) => (child.exitCode === null ? child.once("exit", resolve) : resolve())),
    ),
  ).then(() => process.exit(exitCode));
}
