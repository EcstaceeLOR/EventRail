import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const smokeScript = fileURLToPath(new URL("../production-smoke.mjs", import.meta.url));

test("production smoke supports separate application and gateway origins", async (context) => {
  const applicationRequests = [];
  const gatewayRequests = [];
  const planRequests = [];
  const application = createServer((request, response) => {
    applicationRequests.push(request.url);
    response.writeHead(200, {
      "content-security-policy": "default-src 'self'",
      "content-type": "text/html",
      "x-content-type-options": "nosniff",
    });
    response.end("EventRail");
  });
  const gateway = createServer(async (request, response) => {
    gatewayRequests.push(`${request.method} ${request.url}`);
    if (request.method === "OPTIONS") {
      response.writeHead(403).end();
      return;
    }
    if (request.url?.startsWith("/v1/events")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(": connected\n\n");
      return;
    }
    if (request.url === "/v1/trading/plans") {
      let body = "";
      request.setEncoding("utf8");
      for await (const chunk of request) body += chunk;
      planRequests.push(JSON.parse(body));
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      request.url?.startsWith("/v1/data/markets?")
        ? JSON.stringify([{ marketId: `0x${"ab".repeat(32)}` }])
        : request.url === "/v1/trading/quotes"
          ? JSON.stringify({
              quoteId: "test",
              sourceBlock: "123456",
              expiresAt: "2030-01-01T00:00:00.000Z",
            })
          : request.url?.includes("/positions") || request.url?.includes("/claims")
            ? "[]"
            : JSON.stringify({ status: "ok" }),
    );
  });
  context.after(() => application.close());
  context.after(() => gateway.close());

  const applicationUrl = await listen(application);
  const gatewayUrl = await listen(gateway);
  const result = await runSmoke({
    SMOKE_ALLOW_HTTP: "true",
    SMOKE_BASE_URL: applicationUrl,
    SMOKE_GATEWAY_URL: gatewayUrl,
    SMOKE_PLAN: "true",
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(applicationRequests, ["/"]);
  assert.ok(gatewayRequests.includes("GET /v1/health"));
  assert.ok(gatewayRequests.includes("GET /v1/ready"));
  assert.ok(gatewayRequests.some((request) => request.startsWith("GET /v1/data/markets?")));
  assert.ok(gatewayRequests.includes("POST /v1/trading/quotes"));
  assert.ok(gatewayRequests.includes("POST /v1/trading/plans"));
  assert.equal(planRequests[0].policy.quoteSourceBlock, "123456");
  assert.equal(planRequests[0].policy.quoteExpiresAt, "2030-01-01T00:00:00.000Z");
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("HTTP server did not bind"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function runSmoke(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}
