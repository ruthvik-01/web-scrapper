/**
 * Mber London Scraper - JOB TODAY Board
 * 
 * STATUS: BLOCKED - NO ACTIVE JOBS
 * 
 * As of 2026-09-25, the JOB TODAY board for MBER restaurant shows zero active jobs.
 * Company profile is live at: https://jobtoday.com/gb/company/restaurant-bar-mber-restaurant-JEopwv
 * 
 * Employer: MBER restaurant (displays as "MBER restaurant" on board)
 * Location: City of London, London, UK
 * Business: Restaurant/Bar (Pan-Asian restaurant with private members club bar)
 * 
 * Board verification:
 * - HTTP 200 OK on 2026-09-25
 * - activeJobsNumber: 0
 * - jobs array: empty []
 * - Page displays: "No active jobs. MBER restaurant is not hiring at the moment"
 * 
 * This placeholder documents the source block. When jobs appear on this board,
 * implement the full scraper to:
 * 1. Fetch company page from JOB TODAY API or HTML
 * 2. Extract active jobs array from __NEXT_DATA__ or API response
 * 3. Parse job details (title, description, location, salary, dates)
 * 4. Validate UK location and posting dates against rules
 * 5. Generate 15-column CSV/JSON output
 * 
 * Expected output location: output/YYYY-MM-DD-main-uk-scrape/jobs company wise/mber-london/
 */

import { Job } from '../universal_scraper/types';

export async function scrapeMberLondon(): Promise<Job[]> {
  // As of 2026-09-25, this board has zero active jobs
  // Return empty array and document BLOCKED status in source-report.json
  return [];
}

export default scrapeMberLondon;
