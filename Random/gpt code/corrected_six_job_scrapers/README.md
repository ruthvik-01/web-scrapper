# Job Scrapers

This project contains scrapers for collecting job postings from various companies.

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

This will install all required dependencies including:
- playwright (for browser automation)
- axios (for HTTP requests)
- cheerio (for HTML parsing)
- p-queue (for concurrency control)
- TypeScript and related development dependencies

4. Install Playwright browsers (required for scrapers that use Playwright):

```bash
npx playwright install
```

## Running the Scrapers

You can run each scraper individually using npm scripts:

```bash
# Run Arona scraper
npm run scrape-arona

# Run City of Alamogordo scraper
npm run scrape-alamogordo

# Run Farrow & Ball scraper
npm run scrape-farrow

# Run Socorro scraper
npm run scrape-socorro

# Run Garver scraper
npm run scrape-garver

# Run US Courts scraper
npm run scrape-uscourts
```

Alternatively, you can run them directly with ts-node:

```bash
npx ts-node fixed_scrapers/arona/arona_scraper.ts
npx ts-node fixed_scrapers/cityofalamogordo/alamogordo_scraper.ts
npx ts-node fixed_scrapers/farrow/farrow_ball_scraper.ts
npx ts-node fixed_scrapers/socorro/socorro_scraper.ts
npx ts-node fixed_scrapers/garver/garver_scraper.ts
npx ts-node fixed_scrapers/uscourts/uscourts_scraper.ts
```

## Output

Each scraper will generate two files:
1. `{company}_jobs.json` - Contains the scraped job postings
2. `{company}_errors.json` - Contains any errors encountered during scraping (if any)

## Building TypeScript

To compile TypeScript files to JavaScript:

```bash
npm run build
```

The compiled files will be placed in the `dist` directory.

## Troubleshooting

If you encounter any issues:

1. Make sure all dependencies are installed: `npm install`
2. Ensure Playwright browsers are installed: `npx playwright install`
3. Check that you're using Node.js version 14 or higher: `node --version`
4. If you get EACCES errors on Linux/macOS, you might need to fix npm permissions or use sudo (not recommended) or install with a different prefix.