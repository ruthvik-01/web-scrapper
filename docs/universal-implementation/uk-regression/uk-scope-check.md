# UK-only company scraper check

Checked every supplied company folder. These checks verify normalizer behavior; they do not establish current vacancies or whole-scraper completeness. Global employers are eligible only for their UK-based roles. Unknown locations and overseas roles must be excluded. NHS Jobs remains excluded.

- Folders: 75; normalizers checked: 53; cases executed: 795; failures: 0.
- UK-filter-checked migration candidates: 45; held: 30; live companies tested: 0.
- Candidates are audit scope only. They must pass end-to-end regression and the shared UK evidence gate before production cutover.

| Company / folder | Platform | Migration scope | UK evidence / limitation |
|---|---|---|---|
| Alice / alice | Comeet | held-for-review | Known supplied-company identity mismatch or demo board; UK filtering alone does not validate source identity. |
| Alzheimer's Society / alzheimers-society | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Aqua Security / aquasec | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Blockaid / blockaid | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| B&M / bmstores | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| CC Nurseries / cc-nurseries | Jobtrain | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Cellebrite / cellebrite | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Checkmarx / checkmarx | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Classiq / classiq | Comeet | held-for-review | Known supplied-company identity mismatch or demo board; UK filtering alone does not validate source identity. |
| Compass Schools / compass-schools | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Coralogix / coralogix | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Curve / curve | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Cycode / cycode | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Cyera / cyera | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Earnix / earnix | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Empathy / empathy | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Exchange Street Claims & Financial Services / exchange-street | Custom HTML / unknown ATS | held-for-review | Broken relative imports; UK normalizer checks do not prove launcher works. |
| Frame Security / framesecurity | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Frasers Hospitality / frasers-hospitality | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Get Recruited (UK) Ltd / get-recruited | Custom HTML / unknown ATS | held-for-review | Broken relative imports; UK normalizer checks do not prove launcher works. |
| Guide Dogs / guide-dogs | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Hackney Borough Council / hackney-borough-council | Custom HTML / unknown ATS | held-for-review | Rejects explicit foreign country, but may accept model uk_location probability >= 0.5 without independent source proof; hold strict UK-only migration. |
| Harper May Ltd / harper-may | Custom HTML / unknown ATS | held-for-review | Rejects explicit foreign country, but may accept model uk_location probability >= 0.5 without independent source proof; hold strict UK-only migration. |
| Intercity Technology / intercity-technology | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Kaltura / kaltura | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| London Borough of Bexley / london-borough-of-bexley | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| London Borough of Hillingdon / london-borough-of-hillingdon | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Long Term Futures / long-term-futures | Custom HTML / unknown ATS | held-for-review | Broken relative imports; UK normalizer checks do not prove launcher works. |
| Louis Vuitton / louis-vuitton | Custom HTML / unknown ATS | held-for-review | Rejects explicit foreign country, but may accept model uk_location probability >= 0.5 without independent source proof; hold strict UK-only migration. |
| Mayra Property Services / mayra-property-services | Custom Supabase REST | held-for-review | Supplied board identifies a German employer; weak city/substring UK matching; source identity unresolved. |
| Mber London / mber-london | JOB TODAY placeholder | held-for-review | Placeholder always returns []; historical zero jobs does not establish current UK scraping support; missing types import. |
| Mega food centre / mega-food-centre | Custom HTML / unknown ATS | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| Mencap / mencap | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Michael Page Technology / michael-page-technology | Custom HTML / unknown ATS | held-for-review | Rejects explicit foreign country, but may accept model uk_location probability >= 0.5 without independent source proof; hold strict UK-only migration. |
| Mindspace / mindspace | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| monday.com / monday | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Mountain Healthcare Ltd / mountain-healthcare-ltd | Occy (saved snapshot) | held-for-review | Saved-data exporter for Occy; appends UK country to historical rows, not a verified live UK scraper. |
| MWH Treatment / mwh-treatment | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Nayax / nayax | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| News UK / news-uk | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| No 35 Mackenzie Walk / no35-mackenzie-walk | Portobello Next.js | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| Noma Security / noma-security | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Northwood Hygiene Products Limited / northwood-hygiene-products-limited | WordPress | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| oliver roberts ltd / oliver-roberts-ltd | Identity investigation only | held-for-review | Identity investigation/report, not a job scraper; no verified careers source. |
| Operations Resources Limited / operations-resources-limited | Haystack JSON-LD | held-for-review | Source inspection found explicit country/postcode checks, but Python/historical snapshot implementation needs TypeScript migration and offline regression proof first. |
| Optibus / optibus | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Osborne Clarke / osborne-clarke | Eploy (source/config evidence) | held-for-review | Broken relative imports; UK normalizer checks do not prove launcher works. |
| Overwolf / overwolf | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| P Ducker Systems Ltd / p-ducker-systems-ltd | WordPress | held-for-review | Historical Python exporter with company/role-specific UK place clauses; preserve evidence, require TypeScript UK rejection/regression checks. |
| Papaya Global / papayaglobal | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Partnering Health Ltd / partnering-health-ltd | WordPress | held-for-review | Historical Python exporter with company/role-specific UK place clauses; preserve evidence, require TypeScript UK rejection/regression checks. |
| Aviation Inc / persivalenic | Comeet | held-for-review | Known supplied-company identity mismatch or demo board; UK filtering alone does not validate source identity. |
| Personetics / personetics | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| PGS LTD / pgs-ltd | Reed / linked Reed details | held-for-review | Source inspection found explicit country/postcode checks, but Python/historical snapshot implementation needs TypeScript migration and offline regression proof first. |
| Pinpoint Group Recruitment Ltd / pinpoint-group-recruitment-ltd | Custom HTML / unknown ATS | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| Pinpoint Resourcing Ltd / pinpoint-resourcing-ltd | Reed / linked Reed details | held-for-review | Source inspection found explicit country/postcode checks, but Python/historical snapshot implementation needs TypeScript migration and offline regression proof first. |
| Port / port | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| PPG Health In Justice / ppghealthinjusticeweb | Eploy (source/config evidence) | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| PRDC Dental / prdc-dental | Unresolved; no scraper | held-for-review | Folder has no scraper source; its historical metadata is not a runnable UK scraper. |
| Prince of Wales Medical Centre / prince-of-wales-medical-centre | Unresolved; no scraper | held-for-review | Folder has no scraper source; its historical metadata is not a runnable UK scraper. |
| Remedio / remedio | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Restore / restore | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Rodericks Dental Partners / rodericks-dental-partners | Custom / Tribepad-style board (inferred URL pattern) | held-for-review | Source inspection found explicit country/postcode checks, but Python/historical snapshot implementation needs TypeScript migration and offline regression proof first. |
| SeeAbility / seeability | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| SJC Partners / sjc-partners | JobAdder | held-for-review | Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration. |
| Solidus Labs / soliduslabs | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| TCFM / tcfm | Eploy (source/config evidence) | held-for-review | Broken relative imports; UK normalizer checks do not prove launcher works. |
| Thetaray / thetaray | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Thinking Schools Academy Trust / thinking-schools-academy-trust | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Tower Hamlets / tower-hamlets | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Trullion / trullion | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Upwind Security / upwind | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Viber / viber | Comeet | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Walkers — Walker's Shortbread / walkers-shortbread | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |
| Wren Kitchens / wren-kitchens | Eploy (source/config evidence) | uk-filter-checked | Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified. |

## Reproduce

From web_scrapper_project: `node --import tsx scripts/check-company-uk-scope.ts`.
