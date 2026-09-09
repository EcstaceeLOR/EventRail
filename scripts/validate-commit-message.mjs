import { readFile } from "node:fs/promises";

const messageFile = process.argv[2];
if (!messageFile) {
  console.error("Usage: node scripts/validate-commit-message.mjs <commit-message-file>");
  process.exit(2);
}

const [header = ""] = (await readFile(messageFile, "utf8")).split(/\r?\n/);
const conventionalHeader =
  /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9-]+\))?!?: .{1,100}$/;
const generatedCommit = /^(?:Merge|Revert)\b/;

if (!conventionalHeader.test(header) && !generatedCommit.test(header)) {
  console.error(
    "Commit message must follow Conventional Commits, for example: feat(gateway): add market endpoint",
  );
  process.exit(1);
}

console.log("Commit message follows the EventRail convention.");
