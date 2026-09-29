import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("[Opening] https://garverusa.com/careers/job-listings");
  await page.goto("https://garverusa.com/careers/job-listings", { waitUntil: "networkidle" });

  // Get job count from table
  const rows = await page.locator("table#jobsTable tbody tr").count();
  console.log("Job rows in table:", rows);

  // Get sample job data
  const jobs = await page.$$eval("table#jobsTable tbody tr", (rows) => {
    return rows.slice(0, 3).map((row) => {
      const cells = row.querySelectorAll("td");
      const link = cells[0]?.querySelector("a");
      return {
        title: link?.textContent?.trim() || null,
        href: link?.href || null,
        city: cells[1]?.textContent?.trim() || null,
        state: cells[2]?.textContent?.trim() || null,
        market: cells[3]?.textContent?.trim() || null,
      };
    });
  });
  console.log("Sample jobs:", JSON.stringify(jobs, null, 2));

  // Check for pagination elements
  const hasPagination = await page.locator(".pagination, .page-numbers, [class*='pagination']").count();
  console.log("Pagination elements:", hasPagination);

  // Check for load more button
  const hasLoadMore = await page.locator("button:has-text('Load'), button:has-text('More'), [class*='load-more']").count();
  console.log("Load more buttons:", hasLoadMore);

  // Inspect a detail page
  if (jobs[0]?.href) {
    console.log("\n[Inspecting detail page]", jobs[0].href);
    await page.goto(jobs[0].href, { waitUntil: "networkidle" });

    // Look for job description
    const descSelectors = [
      "[class*='job-description']",
      "[class*='description']",
      ".job-detail",
      "#job-description",
      "[class*='content']",
    ];

    for (const sel of descSelectors) {
      const text = await page.locator(sel).first().textContent().catch(() => null);
      if (text && text.length > 200) {
        console.log("Description found with selector:", sel);
        console.log("Length:", text.length);
        console.log("Preview:", text.slice(0, 200).replace(/\s+/g, " "));
        break;
      }
    }

    // Look for posted date, deadline
    const pageText = await page.textContent("body");
    const dateMatches = pageText.match(/(posted|date|deadline|closing)\s*:?\s*([\w\/\.\-]+)/gi);
    if (dateMatches) {
      console.log("\nDate references:", dateMatches.slice(0, 5));
    }
  }

  await browser.close();
})();
