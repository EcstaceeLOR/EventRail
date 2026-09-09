import assert from "node:assert/strict";
import test from "node:test";
import { classifyWalletError, getWalletAction } from "../lib/wallet-state.ts";

test("wallet action guards trading behind connection and Shannon", () => {
  assert.equal(getWalletAction(false, false), "connect");
  assert.equal(getWalletAction(true, false), "switch");
  assert.equal(getWalletAction(true, true), "review");
});

test("user rejection is recoverable and distinct from provider failure", () => {
  assert.deepEqual(classifyWalletError("User rejected the request"), {
    title: "Connection cancelled",
    message: "No changes were made. Choose a wallet when you are ready.",
    tone: "info",
  });
  assert.equal(classifyWalletError("RPC unavailable").tone, "error");
});
