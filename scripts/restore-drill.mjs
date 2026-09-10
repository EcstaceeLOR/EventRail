import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { assertSafeRestore } from "./restore-safety.mjs";

const source = process.env.RESTORE_SOURCE_DATABASE_URL;
const target = process.env.RESTORE_TARGET_DATABASE_URL;
if (!source || !target)
  throw new Error("RESTORE_SOURCE_DATABASE_URL and RESTORE_TARGET_DATABASE_URL are required");
assertSafeRestore(source, target);
const directory = mkdtempSync(join(tmpdir(), "eventrail-restore-"));
const dump = join(directory, "eventrail.dump");
const started = Date.now();
try {
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--file", dump, source], { stdio: "inherit" });
  execFileSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", target, dump], {
    stdio: "inherit",
  });
  const sourceTables = countTables(source);
  const targetTables = countTables(target);
  if (sourceTables === 0 || sourceTables !== targetTables)
    throw new Error(`table-count mismatch: source=${sourceTables}, target=${targetTables}`);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify({ status: "passed", sourceTables, targetTables, recoveryTimeSeconds: seconds }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
function countTables(url) {
  return Number(
    execFileSync(
      "psql",
      [url, "-Atc", "select count(*) from information_schema.tables where table_schema='public'"],
      { encoding: "utf8" },
    ).trim(),
  );
}
