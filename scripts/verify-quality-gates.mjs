import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const executable = (name) =>
  resolve("node_modules", ".bin", `${name}${process.platform === "win32" ? ".cmd" : ""}`);
const fixtureRoot = resolve("scripts");
const fixtureDirectory = mkdtempSync(join(fixtureRoot, ".quality-gate-"));
if (dirname(fixtureDirectory) !== fixtureRoot) {
  throw new Error("Quality-gate fixtures must stay inside the scripts directory.");
}

const fixtures = {
  lint: join(fixtureDirectory, "intentional-lint-failure.js"),
  type: join(fixtureDirectory, "intentional-type-failure.ts"),
  test: join(fixtureDirectory, "intentional-test-failure.test.mjs"),
};

writeFileSync(fixtures.lint, "missingGlobal();\n");
writeFileSync(fixtures.type, "const value: string = 42;\nvoid value;\n");
writeFileSync(
  fixtures.test,
  'import assert from "node:assert/strict";\nimport test from "node:test";\ntest("intentional failure", () => assert.fail("expected"));\n',
);

const probes = [
  ["lint", executable("eslint"), ["--no-config-lookup", "--rule", "no-undef:error", fixtures.lint]],
  [
    "type",
    executable("tsc"),
    ["--noEmit", "--strict", "--skipLibCheck", "--target", "ES2024", fixtures.type],
  ],
  ["test", process.execPath, ["--test", fixtures.test]],
];

try {
  const missedFailures = probes
    .filter(([, command, arguments_]) => spawnSync(command, arguments_, { stdio: "ignore" }).status === 0)
    .map(([name]) => name);
  if (missedFailures.length > 0) {
    throw new Error(`Quality gates did not reject intentional ${missedFailures.join(", ")} failures.`);
  }
  console.log("Verified that lint, type, and test gates reject intentional failures.");
} finally {
  rmSync(fixtureDirectory, { recursive: true, force: true });
}
