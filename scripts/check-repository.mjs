import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { contentViolations, pathViolation } from "./repository-policy.mjs";

const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.status !== 0) {
  throw new Error(result.stderr || "Unable to enumerate repository files.");
}

const findings = [];
const files = result.stdout.split("\0").filter(Boolean);

for (const file of files) {
  const pathProblem = pathViolation(file);
  if (pathProblem) findings.push(`${file}: ${pathProblem}`);

  let buffer;
  try {
    buffer = await readFile(file);
  } catch {
    continue;
  }
  if (buffer.length > 2 * 1024 * 1024 || buffer.includes(0)) continue;
  for (const problem of contentViolations(buffer.toString("utf8"))) {
    findings.push(`${file}: possible ${problem}`);
  }
}

if (findings.length > 0) {
  console.error("Repository policy violations:\n" + findings.map((finding) => `- ${finding}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Repository policy passed for ${files.length} files.`);
}
