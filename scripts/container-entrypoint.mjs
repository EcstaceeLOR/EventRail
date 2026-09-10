import { spawn } from "node:child_process";

const commands = {
  gateway: ["pnpm", ["--filter", "@eventrail/gateway", "start"]],
  web: ["pnpm", ["--filter", "@eventrail/web", "start"]],
  "developer-portal": ["pnpm", ["--filter", "@eventrail/developer-portal", "start"]],
  examples: ["pnpm", ["--filter", "@eventrail/examples", "start"]],
  "market-sync": ["pnpm", ["--filter", "@eventrail/market-sync-worker", "start"]],
  receipts: ["pnpm", ["--filter", "@eventrail/receipts-worker", "start"]],
  settlement: ["pnpm", ["--filter", "@eventrail/settlement-worker", "start"]],
  webhooks: ["pnpm", ["--filter", "@eventrail/worker-webhooks", "start"]],
  demo: ["node", ["scripts/render-demo-entrypoint.mjs"]],
  migrate: ["pnpm", ["db:migrate"]],
};

const component = process.env.COMPONENT ?? "gateway";
const command = commands[component];
if (!command) {
  console.error(`Unknown EventRail component: ${component}`);
  process.exit(64);
}

const child = spawn(command[0], command[1], { stdio: "inherit", shell: false, env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error("Unable to start EventRail component", { component, message: error.message });
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
