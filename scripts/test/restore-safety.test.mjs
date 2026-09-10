import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeRestore } from "../restore-safety.mjs";

test("allows a distinct local drill database", () =>
  assert.doesNotThrow(() =>
    assertSafeRestore(
      "postgresql://u:p@localhost/source",
      "postgresql://u:p@localhost/eventrail_restore_drill",
    ),
  ));
test("refuses restoring over the source", () =>
  assert.throws(
    () =>
      assertSafeRestore(
        "postgresql://u:p@localhost/eventrail_restore_drill",
        "postgresql://u:p@localhost/eventrail_restore_drill",
      ),
    /differ/,
  ));
test("refuses an unmarked target", () =>
  assert.throws(
    () => assertSafeRestore("postgresql://u:p@localhost/source", "postgresql://u:p@localhost/prod"),
    /end with/,
  ));
