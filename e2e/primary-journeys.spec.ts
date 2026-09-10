import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:4000/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/events") return route.abort("failed");
    if (url.pathname === "/v1/health") {
      return route.fulfill({
        json: {
          status: "ok",
          service: "eventrail-gateway",
          version: "e2e",
          timestamp: new Date().toISOString(),
        },
      });
    }
    return route.fulfill({ json: [] });
  });
});

test("landing, discovery, and immutable market journey", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const featuredMarket = page.locator('a[href^="/markets/"]').first();
  const featuredMarketHref = await featuredMarket.getAttribute("href");
  expect(featuredMarketHref).toBeTruthy();
  await page.getByRole("link", { name: /Explore live markets/i }).click();
  await expect(page).toHaveURL(/\/markets/);
  await expect(page.getByRole("main")).toBeVisible();
  await page.goto(featuredMarketHref!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("trade risk notice")).toBeVisible();
});

test("injected wallet connects and switches to Somnia Shannon", async ({ page }) => {
  await installWalletFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const walletDialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await walletDialog.getByRole("button", { name: /injected/i }).click();
  await page.getByRole("button", { name: "Switch network" }).click();
  await expect(page.getByRole("button", { name: /0x1212.*3434/i })).toBeVisible();
});

test("portfolio, claims, status recovery, and developer journeys", async ({ page }) => {
  for (const path of ["/portfolio", "/claims", "/activity", "/developers", "/developers/dashboard"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "EventRail services" })).toBeVisible();
  await expect(
    page.getByText(/Telemetry unavailable|All systems operational|Some systems degraded/),
  ).toBeVisible();
});

test("critical accessibility rules pass on trading and legal surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "Desktop engines provide the full axe matrix.");
  for (const path of ["/markets", "/funding", "/claims", "/legal/risk", "/legal/privacy"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.filter((violation) => violation.impact === "critical"),
      path,
    ).toEqual([]);
  }
});

test("primary internal links resolve without browser errors", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => (link as HTMLAnchorElement).getAttribute("href")).filter(Boolean)),
    ]);
  for (const href of hrefs) {
    const response = await page.goto(href!);
    expect(response?.status(), href!).toBeLessThan(400);
  }
});

test("mobile navigation fits the viewport and honors reduced motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only budget.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/markets");
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const motionDuration = await page
    .locator("main")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(["0.01ms", "1e-05s"]).toContain(motionDuration);
});

test("markets stay within navigation and transfer budgets", async ({ page }) => {
  const started = Date.now();
  await page.goto("/markets", { waitUntil: "networkidle" });
  expect(Date.now() - started).toBeLessThan(15_000);
  const bytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .reduce((total, entry) => total + ((entry as PerformanceResourceTiming).transferSize || 0), 0),
  );
  expect(bytes).toBeLessThan(3_000_000);
});

async function installWalletFixture(page: Page) {
  await page.addInitScript(() => {
    let chainId = "0x1";
    let authorized = false;
    const account = `0x${"12".repeat(18)}3434`;
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const emit = (event: string, value: unknown) =>
      listeners.get(event)?.forEach((listener) => listener(value));
    const provider = {
      isMetaMask: true,
      request: async ({ method }: { method: string; params?: unknown[] }) => {
        if (method === "eth_chainId") return chainId;
        if (method === "eth_accounts") return authorized ? [account] : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          emit("accountsChanged", [account]);
          return [account];
        }
        if (method === "wallet_switchEthereumChain") {
          chainId = "0xc488";
          emit("chainChanged", chainId);
          return null;
        }
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        return null;
      },
      on: (event: string, listener: (value: unknown) => void) => {
        const subscriptions = listeners.get(event) ?? new Set();
        subscriptions.add(listener);
        listeners.set(event, subscriptions);
      },
      removeListener: (event: string, listener: (value: unknown) => void) =>
        listeners.get(event)?.delete(listener),
    };
    (window as unknown as { ethereum: typeof provider }).ethereum = provider;
  });
}
