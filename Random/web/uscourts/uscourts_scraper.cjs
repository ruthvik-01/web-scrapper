const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const { default: PQueue } = require("p-queue");

const CONFIG = {
  url: "https://www.uscourts.gov/careers/search-judiciary-jobs",
  company: "US Courts",
  refDate: "2026-08-14",
  concurrency: 5
};

const parseDateRange = (range) => {
  const match = range.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(.+)/);
  if (!match) return {};
  const toIso = (d) => {
    const [mm, dd, yyyy] = d.split("/");
    return `${yyyy}-${mm}-${dd}`;
  };
  const deadline = match[2].includes("/") ? toIso(match[2]) : match[2];
  return { posted: toIso(match[1]), deadline };
};

const isOlderThan30Days = (dateStr, ref) => {
  const d = new Date(dateStr);
  const refDate = new Date(ref);
  const diff = (refDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 30;
};

const isMexicoLocation = (city, state) => {
  const indicators = ["mexico", "monterrey", "mexico city", "nm"];
  const loc = `${city || ""} ${state || ""}`.toLowerCase();
  return indicators.some(ind => loc.includes(ind));
};

const cleanDate = (dateStr) => {
  if (!dateStr || dateStr.toLowerCase().includes("open until filled") || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  return dateStr;
};

async function discoverPage(pageNum) {
  const url = pageNum === 0 ? CONFIG.url : `${CONFIG.url}?page=${pageNum}`;
  const { data } = await axios.get(url, { timeout: 30000 });
  const $ = cheerio.load(data);
  const jobs = [];
  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;
    const link = cells.eq(0).find("a");
    const href = link.attr("href") || "";
    const idMatch = href.match(/(\d+)/);
    if (!idMatch) return;
    jobs.push({
      jobId: idMatch[1],
      title: link.text().trim(),
      jobUrl: href.startsWith("http") ? href : `https://www.uscourts.gov${href}`
    });
  });
  return jobs;
}

async function discover() {
  const all = [];
  for (let page = 0; ; page++) {
    const jobs = await discoverPage(page);
    if (!jobs.length) break;
    all.push(...jobs);
    if (jobs.length < 25) break;
  }
  const seen = new Set();
  return all.filter(j => {
    if (seen.has(j.jobId)) return false;
    seen.add(j.jobId);
    return true;
  });
}

async function fetchExternalDescription(url) {
  try {
    const { data } = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(data);
    const desc = $("#job-description, .job-description, [data-testid='job-description'], .description, .posting-description").text().trim();
    if (desc && desc.length > 50) return desc;
    const bodyText = $("body").text().trim();
    if (bodyText.length > 100) return bodyText.substring(0, 5000);
    return null;
  } catch {
    return null;
  }
}

async function fetchCourtWebsiteDescription(url) {
  try {
    const { data } = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(data);
    const sections = [];
    $(".field--name-field-position-description, .field--name-field-qualifications, .field--name-field-employee-benefits, .field--name-field-miscellaneous, .field--name-field-application-info, .job-description, .position-description").each((_, el) => {
      sections.push($(el).text().trim());
    });
    const description = sections.join("\n\n").replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();
    if (description && description.length > 100) return description;
    const mainContent = $(".content, main, article, .main-content").text().trim();
    if (mainContent && mainContent.length > 200) return mainContent.substring(0, 8000);
    return null;
  } catch {
    return null;
  }
}

async function scrape(partial) {
  const { data } = await axios.get(partial.jobUrl, { timeout: 30000 });
  const $ = cheerio.load(data);
  const sections = [];
  $(".field--name-field-position-description, .field--name-field-qualifications, .field--name-field-employee-benefits, .field--name-field-miscellaneous, .field--name-field-application-info").each((_, el) => {
    sections.push($(el).text().trim());
  });
  let description = sections.join("\n\n").replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();

  if (!description || description.length < 100) {
    const trakstarLink = $("a[href*='trakstar.com'], a[href*='hire.com']").attr("href");
    if (trakstarLink) {
      const externalDesc = await fetchExternalDescription(trakstarLink);
      if (externalDesc) description = externalDesc;
    }
  }

  if (!description || description.length < 100) {
    const announcementLinks = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().toLowerCase();
      if (href && (text.includes("job announcement") || text.includes("announcement") || text.includes("external"))) {
        announcementLinks.push(href);
      }
    });
    for (const link of announcementLinks) {
      if (link.includes('.pdf')) continue;
      if (link.includes('www.uscourts.gov') && link.includes('/careers')) continue;
      const courtDesc = await fetchCourtWebsiteDescription(link);
      if (courtDesc && courtDesc.length > 100) {
        description = courtDesc;
        break;
      }
    }
    if (!description || description.length < 100) {
      const courtLink = $("a[href*='.uscourts.gov']").attr("href");
      if (courtLink && !courtLink.includes('www.uscourts.gov/careers') && !courtLink.includes('/sites/default/files')) {
        const courtDesc = await fetchCourtWebsiteDescription(courtLink);
        if (courtDesc) description = courtDesc;
      }
    }
  }

  const dateText = $(".field--name-field-date-range .field__item").text().trim();
  const dates = parseDateRange(dateText);
  const salaryText = $(".field--name-field-salary-range .field__item").text().trim();
  const salaryRange = salaryText || "";
  const locationText = $(".field--name-field-vacancy-location .field__item").text().trim();
  const [city = "", state = ""] = locationText.split(",").map(s => s.trim());
  const companyText = $(".field--name-field-court .field__item").text().trim();
  const employmentType = $(".field--name-field-duration .field__item").text().trim();
  const mexico = isMexicoLocation(city, state);
  if (mexico && !dates.posted) return null;
  if (dates.posted && isOlderThan30Days(dates.posted, CONFIG.refDate)) return null;
  return {
    jobId: partial.jobId,
    title: partial.title,
    description: description,
    jobUrl: partial.jobUrl,
    postedDate: cleanDate(dates.posted || "") || CONFIG.refDate,
    jdDeadline: cleanDate(dates.deadline || ""),
    company: "uscourts",
    salaryRange,
    employmentType,
    worktype: "",
    location: locationText || `${city}, ${state}`.replace(/^, |, $/g, ""),
    city,
    state,
    country: state === "MX" ? "Mexico" : (state ? "United States" : ""),
    ats: "Custom"
  };
}

async function main() {
  console.log("Discovering jobs...");
  const discovered = await discover();
  console.log(`Discovered: ${discovered.length}`);
  const queue = new PQueue({ concurrency: CONFIG.concurrency });
  const jobs = [];
  const errors = [];
  const tasks = discovered.map(partial =>
    queue.add(async () => {
      try {
        const job = await scrape(partial);
        if (job) jobs.push(job);
      } catch (e) {
        errors.push({ jobId: partial.jobId, error: String(e) });
      }
    })
  );
  await Promise.all(tasks);
  fs.writeFileSync("uscourts_jobs.json", JSON.stringify(jobs, null, 2));
  if (errors.length) {
    fs.writeFileSync("uscourts_errors.json", JSON.stringify(errors, null, 2));
  }
  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${discovered.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: uscourts_jobs.json`);
}

main().catch(console.error);
