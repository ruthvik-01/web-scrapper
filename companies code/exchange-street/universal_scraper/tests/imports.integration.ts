import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { dashboardFixture } from "./dashboard-helpers.js";

test("browser can upload external CSV, map columns, import, and choose DOM extraction settings", async () => {
  const fixture = await dashboardFixture();
  const file = join(fixture.root, "external-companies.csv");
  await writeFile(file, 'Organisation,Careers Link\nUploaded Example,https://uploaded.example/careers\n"<img src=x onerror=alert(1)>",https://other-upload.example/jobs\n');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(fixture.base);
    await page.getByLabel("Select Company 2", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Upload data", exact: true }).click();
    await page.getByLabel("Upload company spreadsheet").setInputFiles(file);
    await page.getByRole("button", { name: "Add companies", exact: true }).waitFor();
    await page.waitForFunction(() => !(document.querySelector("#import-commit") as HTMLButtonElement)?.disabled);
    assert.equal(await page.getByLabel("Company name column").inputValue(), "0");
    assert.equal(await page.getByLabel("Website URL column").inputValue(), "1");
    assert.equal(await page.locator("#import-preview img").count(), 0, "Workbook text must not become HTML.");
    await page.getByRole("button", { name: "Add companies", exact: true }).click();
    await page.getByRole("heading", { name: "2 companies added", exact: true }).waitFor();
    await page.getByRole("button", { name: "View imported companies", exact: true }).click();
    assert.equal(await page.locator("#company-rows tr").count(), 2);
    assert.equal(await page.locator("#company-rows img").count(), 0);
    await page.getByRole("button", { name: "Open Uploaded Example", exact: true }).click();
    await page.getByRole("button", { name: "Extraction settings", exact: true }).click();
    await page.getByLabel("Extraction mode").selectOption("dom");
    await page.getByLabel("Custom CSS selectors").fill('{"title":"h1","description":".description","location":".location"}');
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Extraction settings saved" }).waitFor();
    assert.equal(await page.getByLabel("Extraction mode").inputValue(), "dom");
    const dashboard = await (await fetch(`${fixture.base}/api/dashboard`)).json();
    assert.equal(dashboard.companies.find((company: { name: string }) => company.name === "Uploaded Example").mode, "dom");
    assert.equal(dashboard.companies.length, 10);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await fixture.close(); }
});
