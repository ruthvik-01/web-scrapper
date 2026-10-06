/** NHS Jobs is explicitly outside this workflow, including subdomains. */
export function isNhsJobsUrl(value: string): boolean {
  try { const host = new URL(value).hostname.toLowerCase(); return host === "jobs.nhs.uk" || host.endsWith(".jobs.nhs.uk"); }
  catch { return false; }
}
export function assertAllowedJobSource(value: string): void {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("A public HTTP(S) source without credentials is required.");
  if (isNhsJobsUrl(value)) throw new Error("NHS Jobs is excluded from the UK scraper workflow.");
}
