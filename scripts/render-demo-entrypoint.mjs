import { spawn, spawnSync } from "node:child_process";

const migration = spawnSync(process.execPath, ["packages/database/scripts/migrate.mjs", "up"], {
  env: process.env,
  stdio: "inherit",
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const gateway = ["gateway", "apps/gateway/dist/index.js", true];
const backgroundComponents = [
  ["market-sync", "workers/market-sync/dist/runner.js", false],
  ["receipts", "workers/receipts/dist/runner.js", false],
  ["settlement", "workers/settlement/dist/runner.js", false],
  ["webhooks", "workers/webhooks/dist/runner.js", false],
];
const configuredWorkers = process.env.DEMO_WORKERS ?? "market-sync";
const requestedWorkers = new Set(
  (configuredWorkers === "none" ? "" : configuredWorkers)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);
const knownWorkers = new Set(backgroundComponents.map(([name]) => name));
const unknownWorkers = [...requestedWorkers].filter((name) => !knownWorkers.has(name));
if (unknownWorkers.length > 0) {
  console.error("Unknown EventRail demo workers", { workers: unknownWorkers });
  process.exit(64);
}
const enabledBackgroundComponents = backgroundComponents.filter(([name]) => requestedWorkers.has(name));

const children = new Map();
const restartTimers = new Map();
const startupTimers = new Set();
const restartDelayMs = 10_000;
const backgroundStartDelayMs = 15_000;
const backgroundStartStaggerMs = 5_000;
let stopping = false;

// Render's free instance has one small CPU. Starting five Node processes at
// once can keep the public port closed until Render's port scan times out.
// Give the critical HTTP gateway exclusive startup time, then stagger workers.
launch(gateway);
enabledBackgroundComponents.forEach((component, index) => {
  const timer = setTimeout(
    () => {
      startupTimers.delete(timer);
      launch(component);
    },
    backgroundStartDelayMs + index * backgroundStartStaggerMs,
  );
  startupTimers.add(timer);
});

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
  for (const timer of startupTimers) globalThis.clearTimeout(timer);
  startupTimers.clear();
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
