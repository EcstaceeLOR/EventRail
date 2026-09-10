import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicEnvironment } from "../dist/public.js";
import { describeServerEnvironment, loadServerEnvironment } from "../dist/server.js";

test("public config defaults to Shannon and rejects another chain", () => {
  const defaults = loadPublicEnvironment({});
  assert.equal(defaults.NEXT_PUBLIC_SOMNIA_CHAIN_ID, 50312);
  assert.equal(defaults.NEXT_PUBLIC_GATEWAY_URL, "");
  assert.throws(
    () => loadPublicEnvironment({ NEXT_PUBLIC_SOMNIA_CHAIN_ID: "1" }),
    /NEXT_PUBLIC_SOMNIA_CHAIN_ID must be 50312/,
  );
});

test("server config fails with actionable connection errors", () => {
  assert.throws(
    () =>
      loadServerEnvironment({ DATABASE_URL: "https://wrong.example", REDIS_URL: "redis://localhost:6379" }),
    /DATABASE_URL: must use postgres/,
  );
  assert.throws(
    () => loadServerEnvironment({ DATABASE_URL: "postgresql://localhost/eventrail", REDIS_URL: "not-a-url" }),
    /REDIS_URL/,
  );
});

test("server descriptions never expose connection credentials", () => {
  const config = loadServerEnvironment({
    DATABASE_URL: "postgresql://eventrail:secret@localhost:5432/eventrail",
    REDIS_URL: "redis://:secret@localhost:6379",
  });
  const description = JSON.stringify(describeServerEnvironment(config));
  assert.equal(description.includes("secret"), false);
  assert.equal(description.includes("eventrail:secret"), false);
});

test("server config validates and deduplicates exact CORS origins", () => {
  const config = loadServerEnvironment({
    DATABASE_URL: "postgresql://localhost/eventrail",
    REDIS_URL: "redis://localhost:6379",
    CORS_ALLOWED_ORIGINS:
      "https://eventrail.example, https://docs.eventrail.example,https://eventrail.example",
  });
  assert.deepEqual(config.CORS_ALLOWED_ORIGINS, [
    "https://eventrail.example",
    "https://docs.eventrail.example",
  ]);
  assert.throws(
    () =>
      loadServerEnvironment({
        DATABASE_URL: "postgresql://localhost/eventrail",
        REDIS_URL: "redis://localhost:6379",
        CORS_ALLOWED_ORIGINS: "https://eventrail.example/path",
      }),
    /CORS_ALLOWED_ORIGINS.*invalid origin/,
  );
});
