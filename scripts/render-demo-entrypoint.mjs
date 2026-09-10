import { spawn, spawnSync } from "node:child_process";

const migration = spawnSync(process.execPath, ["packages/database/scripts/migrate.mjs", "up"], {
  env: process.env,
  stdio: "inherit",
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const components = [
  ["gateway", "apps/gateway/dist/index.js", true],
  ["market-sync", "workers/market-sync/dist/runner.js", false],
  ["receipts", "workers/receipts/dist/runner.js", false],
  ["settlement", "workers/settlement/dist/runner.js", false],
  ["webhooks", "workers/webhooks/dist/runner.js", false],
];

const children = new Map();
const restartTimers = new Map();
const restartDelayMs = 10_000;
let stopping = false;

for (const component of components) launch(component);

function launch(component) {
  if (stopping) return;
  const [name, script, critical] = component;
  const child = spawn(process.execPath, [script], { env: process.env, stdio: "inherit" });
  children.set(name, child);
  console.log(`EventRail ${name} started`, { pid: child.pid });
  let handled = false;
  child.once("error", (error) => {
    if (handled || stopping) return;
    handled = true;
    console.error(`EventRail ${name} failed to start`, { message: error.message });
    handleUnexpectedStop(component, critical, 1);
  });
  child.once("exit", (code, signal) => {
    if (handled || stopping) return;
    handled = true;
    console.error(`EventRail ${name} stopped unexpectedly`, { code, signal });
    handleUnexpectedStop(component, critical, code ?? 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal, 0));
}

function stop(signal, exitCode) {
  if (stopping) return;
  stopping = true;
  for (const timer of restartTimers.values()) globalThis.clearTimeout(timer);
  restartTimers.clear();
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

function handleUnexpectedStop(component, critical, exitCode) {
  const [name] = component;
  children.delete(name);
  if (critical) {
    stop("SIGTERM", exitCode);
    return;
  }
  console.error(`EventRail ${name} will restart`, { delayMs: restartDelayMs });
  const timer = setTimeout(() => {
    restartTimers.delete(name);
    launch(component);
  }, restartDelayMs);
  restartTimers.set(name, timer);
}
