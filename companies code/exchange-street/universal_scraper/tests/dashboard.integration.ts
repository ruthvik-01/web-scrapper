import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { dashboardFixture, waitForIdle } from "./dashboard-helpers.js";

test("dashboard UI supports filtering, five-company selection, fixture runs, previews, and downloads", async () => {
  const fixture = await dashboardFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    // Default browser viewport only; no resizing or mobile emulation.
    const page = await browser.newPage({ acceptDownloads: true });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(fixture.base);
    await page.getByRole("heading", { name: "Your next five." }).waitFor();
    await page.getByLabel("Select Company 2", { exact: true }).waitFor();
    assert.equal(await page.locator("#stat-companies").textContent(), "8");
    assert.equal(await page.getByLabel("Select Company 8", { exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Pick 5 ready" }).click();
    assert.equal(await page.locator("#selection-count").textContent(), "5/5");
    assert.equal(await page.getByLabel("Select Company 7", { exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search companies", exact: true }).fill("Company 2");
    assert.equal(await page.locator("#company-rows tr").count(), 1);
    await page.getByLabel("Select Company 2", { exact: true }).check();
    await page.getByRole("button", { name: "Run selected companies" }).click();
    await page.getByRole("button", { name: "Start scraping", exact: true }).click();
    await waitForIdle(fixture.base);
    await page.getByRole("button", { name: "Refresh dashboard" }).click();
    await page.waitForFunction(() => document.querySelector("#stat-completed")?.textContent === "2");
    await page.getByRole("button", { name: "Open Company 2", exact: true }).click();
    await page.getByRole("button", { name: "Software Engineer", exact: true }).waitFor();
    await page.getByRole("button", { name: "Software Engineer", exact: true }).click();
    assert.match(await page.locator(".job-description").textContent() || "", /Build useful software/);
    await page.getByRole("button", { name: "Review report", exact: true }).click();
    assert.match(await page.locator("#detail-body").textContent() || "", /No access or extraction errors/);
    await page.getByRole("button", { name: "Code & files", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download code ZIP" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /-code\.zip$/);
    await page.getByRole("button", { name: "Close company details" }).click();
    await page.getByRole("button", { name: "Run history", exact: true }).click();
    assert.match(await page.locator("#run-list").textContent() || "", /Batch of 1 company/);
    await page.getByRole("button", { name: "Exports", exact: true }).click();
    assert.equal(await page.locator(".export-card").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('12px "Public Sans"'); }), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await fixture.close(); }
});
