import process from "node:process";

const baseUrl = requiredUrl("SMOKE_BASE_URL");
const account = process.env.SMOKE_ACCOUNT ?? "0x0000000000000000000000000000000000000001";
const apiKey = process.env.SMOKE_API_KEY;
const authHeaders = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
const results = [];

await check("application", baseUrl, { headers: ["content-security-policy", "x-content-type-options"] });
for (const [name, variable] of [
  ["developer portal", "SMOKE_DOCS_URL"],
  ["examples", "SMOKE_EXAMPLES_URL"],
  ["status", "SMOKE_STATUS_URL"],
]) {
  if (process.env[variable])
    await check(name, requiredUrl(variable), { headers: ["content-security-policy"] });
}
await check("health", new URL("/v1/health", baseUrl), { json: true });
await check("readiness", new URL("/v1/ready", baseUrl), { json: true });
await checkDeniedOrigin(new URL("/v1/data/markets", baseUrl));
const markets = await check(
  "markets",
  new URL("/v1/data/markets?network=shannon&status=active&limit=5", baseUrl),
  { json: true, auth: true },
);
await check("portfolio", new URL(`/v1/data/accounts/${account}/positions`, baseUrl), {
  json: true,
  auth: true,
});
await check("claims", new URL(`/v1/data/accounts/${account}/claims`, baseUrl), { json: true, auth: true });
await checkStream(new URL("/v1/events?network=shannon", baseUrl));
const market = Array.isArray(markets) ? markets[0] : markets?.data?.[0];
if (market?.marketId) {
  const quote = await post("quote", "/v1/trading/quotes", {
    marketId: market.marketId,
    outcome: "up",
    side: "buy",
    mode: "spend",
    amount: "1000000",
    feeBps: 0,
    maxSlippageBps: 200,
    minimumFillBps: 1,
    minimumTimeRemainingSeconds: 0,
  });
  if (quote && process.env.SMOKE_PLAN === "true")
    await post("unsigned plan", "/v1/trading/plans", {
      account,
      idempotencyKey: `smoke-${Date.now()}`,
      quote,
      policy: { maxSlippageBps: 200, minimumFillBps: 1, minimumTimeRemainingSeconds: 0 },
      builderFeeApproved: false,
    });
} else results.push(["quote/plan", "FAIL", "no active market"]);
console.table(results.map(([checkName, status, detail]) => ({ check: checkName, status, detail })));
if (results.some(([, status]) => status === "FAIL")) process.exitCode = 1;

async function check(name, url, options = {}) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: options.auth ? authHeaders : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    for (const header of options.headers ?? [])
      if (!response.headers.has(header)) throw new Error(`missing ${header}`);
    const body = options.json ? await response.json() : null;
    results.push([name, "PASS", `HTTP ${response.status}`]);
    return body;
  } catch (error) {
    results.push([name, "FAIL", error instanceof Error ? error.message : String(error)]);
    return null;
  }
}
async function post(name, path, body) {
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
    results.push([name, "PASS", `HTTP ${response.status}`]);
    return response.json();
  } catch (error) {
    results.push([name, "FAIL", error instanceof Error ? error.message : String(error)]);
    return null;
  }
}
async function checkStream(url) {
  try {
    const response = await fetch(url, { headers: authHeaders, signal: AbortSignal.timeout(8_000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream"))
      throw new Error(`HTTP ${response.status}`);
    results.push(["event stream", "PASS", "SSE connected"]);
    await response.body?.cancel();
  } catch (error) {
    results.push(["event stream", "FAIL", error instanceof Error ? error.message : String(error)]);
  }
}
async function checkDeniedOrigin(url) {
  try {
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: { origin: "https://denied.invalid", "access-control-request-method": "GET" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 403 || response.headers.has("access-control-allow-origin")) {
      throw new Error(`unexpected HTTP ${response.status}`);
    }
    results.push(["CORS denial", "PASS", "untrusted origin rejected"]);
  } catch (error) {
    results.push(["CORS denial", "FAIL", error instanceof Error ? error.message : String(error)]);
  }
}
function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (process.env.SMOKE_ALLOW_HTTP !== "true" && url.protocol !== "https:")
    throw new Error(`${name} must use HTTPS`);
  return url;
}
