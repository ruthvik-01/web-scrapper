// Added detail scraping: extract Job ref and postedDate from job detail pages
function parseDateText(dateText) {
  if (!dateText) return null;
  // Try DD/MM/YYYY or DD-MM-YYYY
  let m = dateText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = parseInt(m[1],10); const mo = parseInt(m[2],10)-1; const y = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo+1).padStart(2,'0')}/${y}`;
  }
  // Try DD Month YYYY
  m = dateText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (m) {
    const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const d = parseInt(m[1],10); const mo = months[m[2].toLowerCase()]; const y = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${y}`;
  }
  // fallback: find year-month-day ISO
  m = dateText.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1],10); const mo = parseInt(m[2],10); const d = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${y}`;
  }
  return null;
}

async function fetchDetailsForJobs(page, jobs) {
  for (let i=0;i<jobs.length;i++) {
    const job = jobs[i];
    try {
      console.log(`Fetching details ${i+1}/${jobs.length}: ${job.jobUrl}`);
      await page.goto(job.jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(800);
      const bodyText = await page.textContent('body') || '';

      // Look for Job ref patterns
      let m = bodyText.match(/Job\s*(?:ref(?:erence)?|reference)?\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
      if (!m) {
        // sometimes 'Ref: abc_123' or 'Reference: abc-123'
        m = bodyText.match(/(?:Ref|Reference)\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
      }
      if (m && m[1]) {
        job.jobRef = m[1].trim();
        job.jobId = job.jobRef; // use jobRef as jobId per request
      }

      // posted date: search for 'Posted', 'Posted on', 'Date', etc near dates
      m = bodyText.match(/Posted(?: on)?\s*[:\-]?\s*([\d\w\s\/-]{6,30})/i);
      let posted = null;
      if (m && m[1]) posted = parseDateText(m[1].trim());
      if (!posted) {
        // search for common date patterns in whole body
        const dm = bodyText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
        if (dm) posted = parseDateText(dm[1]);
      }
      if (!posted) {
        const dm = bodyText.match(/\b(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
        if (dm) posted = parseDateText(dm[1]);
      }
      if (posted) job.postedDate = posted;
      
      // also try to extract job description if empty
      if (!job.description || job.description.length < 50) {
        const descEl = await page.$('.job-description, .description, .vacancy-description, article, main');
        if (descEl) {
          job.description = (await descEl.textContent()) || job.description || '';
          job.description = job.description.replace(/\s+/g,' ').trim();
        }
      }
    } catch (e) {
      console.error('Error fetching details for', job.jobUrl, e.message);
    }
    await sleep(400);
  }
  return jobs;
}

// We'll call fetchDetailsForJobs before saving the uniqueJobs

