import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const composePath = resolve(repositoryRoot, "compose.yaml");
const action = process.argv[2];

if (!existsSync(composePath)) {
  throw new Error(`Expected the EventRail compose file at ${composePath}.`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("Docker is required. Install Docker Desktop, start it, and retry.");
    }
    throw result.error;
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(...args) {
  run("docker", ["compose", "--file", composePath, "--project-name", "eventrail", ...args]);
}

switch (action) {
  case "up":
    compose("up", "--detach", "--wait");
    run("pnpm", ["db:migrate"]);
    run("pnpm", ["db:seed"]);
    break;
  case "down":
    compose("down");
    break;
  case "status":
    compose("ps");
    break;
  case "reset":
    // The fixed project and volume names make this destructive operation local and bounded.
    compose("down", "--volumes", "--remove-orphans");
    compose("up", "--detach", "--wait");
    run("pnpm", ["db:migrate"]);
    run("pnpm", ["db:seed"]);
    break;
  default:
    throw new Error("Usage: node scripts/local-infrastructure.mjs <up|down|status|reset>");
}
