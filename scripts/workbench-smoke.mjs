// scripts/workbench-smoke.mjs
//
// End-to-end smoke test for the enterprise workbench home flow. Exercises:
//   1. Workbench home: new conversation CTA and recent work section.
//   2. Settings: stability section renders.
//   3. API: /api/usage shape.
//
// Run locally (with `npm run dev` on port 30142 first):
//   npm run test:workbench
// Or against a deployed URL:
//   PI_WEB_BASE_URL=https://staging.example.com npm run test:workbench
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.PI_WEB_BASE_URL ?? "http://localhost:30142";
const screenshotPath = "output/playwright/workbench-settings-smoke.png";

const settingsButton = /^(Settings|设置)$/;
const settingsHeading = /^(Settings|设置)$/;
const stabilityHeading = /^(Stability|稳定性)$/;

await mkdir("output/playwright", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const browserMessages = [];

page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    browserMessages.push(`${msg.type()}: ${msg.text()}`);
  }
});
page.on("pageerror", (err) => {
  browserMessages.push(`pageerror: ${err.message}`);
});

async function expectVisible(locator, label) {
  const target = locator.first();
  await target.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await target.isVisible(), true, label);
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await expectVisible(page.getByText("Enterprise Workbench"), "home workbench label visible");
  await expectVisible(page.getByRole("button", { name: /New conversation|新建对话/ }), "new chat button visible");
  await expectVisible(page.getByText(/My Work|我的工作/), "recent work heading visible");

  await page.getByRole("button", { name: settingsButton }).click();
  await expectVisible(page.getByRole("heading", { name: settingsHeading }), "settings heading visible");
  await expectVisible(page.getByText(stabilityHeading), "stability section visible");

  const usageRes = await page.request.get(`${baseURL}/api/usage`);
  assert.equal(usageRes.ok(), true, "usage API ok");
  const usage = await usageRes.json();
  assert.deepEqual(Object.keys(usage.usage).sort(), [
    "activeRuns",
    "completedRuns",
    "generatedAt",
    "totalRuns",
  ].sort(), "usage API shape");

  await page.screenshot({ path: screenshotPath, fullPage: true });

  if (browserMessages.length > 0) {
    throw new Error(`Browser console/page messages:\n${browserMessages.join("\n")}`);
  }

  console.log(JSON.stringify({
    baseURL,
    slices: ["workbench home", "settings stability", "usage API"],
    screenshot: screenshotPath,
    api: { usage: usageRes.status() },
  }, null, 2));
} finally {
  await browser.close();
}
