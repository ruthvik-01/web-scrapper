"""Use official-link discoveries to target job lists, not entire corporate sites."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / "companies-akhil-ruthvik-2026-09-18.json").read_text(encoding="utf-8"))
changes = {
    "louisvuitton": "https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D",
    "mcginnis-loy": "https://mcginnisloy.com/jobs/",
    "meridial": "https://www.meridial.ai/projects",
    "mitchelladam": "https://mitchelladam.co.uk/work-for-us/",
    "morgan-law": "https://www.morgan-law.com/jobs/",
    "essex-icb": "https://www.essex.icb.nhs.uk/careers/current-vacancies/",
    "nlggta": "https://www.nlggta.co.uk/",
    "paysafe": "https://paysafe.careers.hibob.com/",
    "peoplefirstpersonnel": "https://peoplefirstpersonnel.co.uk/careers/",
    "poundland": "https://search.poundlanddealzcareers.com/vacancies/",
    "proactive": "https://www.proactive.it/job-vacancies/",
    "qvh": "http://jobs.qvh.nhs.uk/",
    "royallondon": "https://jobs.royallondon.com/",
    "sdg2advocacyhub": "https://sdg2advocacyhub.org/about-us/opportunities/",
    "seetec": "https://jobs.seetec.co.uk/",
    "sjcpartners": "https://sjcpartners.com/jobs/",
    "smarted": "https://www.smarted.co.uk/teaching-jobs-in-birmingham",
    "smiths-group": "https://www.smiths.com/careers/job-search",
    "sodexo": "http://www.sodexojobs.co.uk/",
    "stannah": "https://www.jobtrain.co.uk/stannah/",
    "sueryder": "https://careers.sueryder.org/SueRyder/Home",
    "breadltd": "https://jobs.thebreadfactory.co.uk/jobs",
    "long-term-futures": "https://www.longtermfutures.co.uk/job-search/",
}
links = "a[href*='/job/'],a[href*='/jobs/'],a[href*='/vacanc'],a[href*='/Vacanc'],a[href*='jobadvert'],a[href*='/search-page/job/'],a[href*='/job-detail'],a[href*='/jobDetail']"
groups = [[], [], []]
fast = {"louisvuitton","mcginnis-loy","morgan-law","proactive","royallondon","seetec","stannah",
        "breadltd","sueryder","poundland","exchange-street","harpermay","peoplefirstpersonnel","nhuc","essex-icb"}
for original in source:
    slug = original["slug"]
    if slug in {"kent-community-health-nhs-foundation-trust", "laat", "sfgroup"}:
        continue
    company = dict(original)
    company["careersUrl"] = changes.get(slug, original["careersUrl"])
    if company["careersUrl"] != original["careersUrl"]:
        company["originalUrl"] = original["careersUrl"]
    company["sourceNote"] += " Target URL follows links inspected on the employer's official public pages; evidence is retained under output/akhil-ruthvik-2026-09-18/research. Agency client boards remain labelled as agency sources, not as direct-employer vacancies."
    company["options"] = {
        "mode": "auto", "maxPages": 3000, "delayMs": 1000, "timeoutMs": 30000,
        "selectors": {"jobLinksOnly": links},
    }
    if slug == "louisvuitton":
        company["options"]["selectors"] = {"jobLinksOnly": "main > div.lv-career-job-list a[href*='/search-page/job/']"}
    if slug == "long-term-futures":
        company["options"]["mode"] = "static"
        company["options"]["selectors"] = {
            "jobLinksOnly": ".global-jobsCard a[href*='/external_job/']",
            "title": ".job-hero > h3", "description": ".job-content .wysiwyg",
            "postedDate": ".job-hero > p", "location": ".job-hero > div > p",
            "next": "a[href*='/job-search/page/']",
        }
    groups[2 if slug == "long-term-futures" else 0 if slug in fast else 1].append(company)
for number, group in enumerate(groups, 1):
    path = ROOT / f"companies-akhil-targeted-{number}-2026-09-18.json"
    path.write_text(json.dumps(group, indent=2, ensure_ascii=False), encoding="utf-8")
    print(path.name, len(group))
