import { load } from "cheerio";
import { AccessPolicy, type ScrapeOptions, type Issue } from "./crawl.js";
import { extractJobs } from "./extract.js";
import { canonicalUrl, dateWindow, normalizeJobs, plainText, type RawJob } from "./normalize.js";

/** Public Jobtrain job-card GET pagination; never visits applications or accounts. */
export async function scrapeJobtrain(url: string, options: ScrapeOptions = {}) {
  const now = options.now || new Date();
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 15000);
  const max = options.maxPages ?? 100;
  const issues: Issue[] = [];
  const jobs: RawJob[] = [];
  const links = new Set<string>();
  const pendingUrls: string[] = [];
  let pagesVisited = 0, total = 0, skip = 0, complete = false;
  try {
    const board = await policy.html(url); pagesVisited++;
    const $ = load(board.body);
    const endpoint = canonicalUrl($('#requestUrl').attr('data-request-url') || '', board.url);
    if (!endpoint || new URL(endpoint).origin !== new URL(url).origin || !/\/Home\/_JobCard$/i.test(new URL(endpoint).pathname)) {
      throw new Error('No supported public Jobtrain job-card endpoint on this board.');
    }
    while (pagesVisited < max) {
      const target = new URL(endpoint); target.searchParams.set('Skip', String(skip));
      const response = await policy.html(target.href); pagesVisited++;
      const card = load(response.body);
      const countText = card('#totalMatchRecords').attr('value');
      if (!countText || !/^\d+$/.test(countText)) throw new Error('Missing advertised Jobtrain total.');
      total = Number(countText);
      const before = links.size;
      card('a[href]').each((_, e) => {
        const href = canonicalUrl(card(e).attr('href') || '', response.url);
        if (href && new URL(href).origin === new URL(url).origin && /\/Job\/JobDetail$/i.test(new URL(href).pathname) && new URL(href).searchParams.has('JobId')) links.add(href);
      });
      console.log(`[${options.company}] Jobtrain pagination: ${links.size}/${total} vacancies (Skip=${skip}).`);
      if (links.size >= total) { complete = true; break; }
      if (links.size === before) throw new Error('Jobtrain pagination returned no new vacancies.');
      skip += links.size - before;
    }
    for (const target of links) {
      if (pagesVisited >= max) { pendingUrls.push(target); continue; }
      try {
        const response = await policy.html(target); pagesVisited++;
        const extracted = extractJobs(response.body, response.url, options.company);
        if (!extracted.length) throw new Error('No JobPosting found on advertised detail page.');
        for (const job of extracted) {
          job.jobId ||= new URL(target).searchParams.get('JobId') || '';
          job.jobUrl = target;
          job.salaryRange = plainText(job.salaryRange);
          if (/^0001-01-01/.test(job.jdDeadline || '')) {
            job.jdDeadline = '';
            (job.notes ||= []).push('Jobtrain year-0001 deadline is an empty-date sentinel, not a published deadline.');
          }
          // This tenant publishes nation as locality and city as region.
          for (const loc of job.locations) {
            if (/^(Scotland|England|Wales|Northern Ireland)$/i.test(loc.city || '') && loc.state && !/^(Scotland|England|Wales|Northern Ireland)$/i.test(loc.state)) {
              [loc.city, loc.state] = [loc.state, loc.city];
              (job.notes ||= []).push('Corrected inverted source locality/region where locality explicitly names a UK nation.');
            }
          }
          jobs.push(job);
        }
        console.log(`[${options.company}] Jobtrain details: ${jobs.length}/${links.size}.`);
      } catch (e) { issues.push({url:target,message:String(e)}); }
    }
  } catch (e) { issues.push({url,message:String(e)}); }
  const normalized = normalizeJobs(jobs,now);
  const limited = !complete || pendingUrls.length > 0;
  return {rows:normalized.rows, rawJobs:jobs, report:{
    sourceUrl:url, scrapedAt:now.toISOString(), window:dateWindow(now), process:'STATIC Jobtrain',
    status:limited || issues.length ? 'partial' : normalized.rows.length ? 'ok' : 'no_matches',
    pagesVisited, requests:pagesVisited, advertisedUrls:total, candidates:jobs.length, rows:normalized.rows.length,
    limited, pendingUrls, skipped:normalized.skipped, issues, dateFallbacks:normalized.dateFallbacks,
    dataNotes:normalized.dataNotes, locationEvidence:[],
  }};
}
