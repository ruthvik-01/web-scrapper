import assert from "node:assert/strict";
import { test } from "node:test";
import { mainPageFields } from "../src/main-page-fields.js";

test("metadata, footer and related jobs cannot supply a job city or county", () => {
 const f=mainPageFields(`<h1 id="ctl_h1JobTitle">Worker</h1><script type="application/ld+json">{"addressRegion":"Middlesex"}</script><footer>Uxbridge, Middlesex</footer><div id="ctl_SuggestedJobs"><span id="ctl_VacV_LocationID">London</span></div><span id="ctl_VacV_VacancyTypeID">Permanent</span>`);
 assert.equal(f.city,"");assert.equal(f.state,"");assert.equal(f.employmentType,"Permanent");
});
test("hybrid is not a city; explicit main-page city is retained without inferred county",()=>{
 const f=mainPageFields('<h1 id="ctl_h1JobTitle">Worker</h1><span id="ctl_AllLocations_lblReadonlySelected">Hybrid</span>');
 assert.equal(f.city,"");assert.equal(f.state,"");
 const g=mainPageFields('<span id="ctl_VacV_LocationID">London</span>');
 assert.equal(g.city,"London");assert.equal(g.state,"");
});
test("administrative areas and named nurseries are never cities",()=>{
 const a=mainPageFields('<span id="ctl_VacV_LocationID">Isle of Wight</span>');
 assert.equal(a.city,"");assert.equal(a.state,"Isle of Wight");
 const b=mainPageFields('<span data-testid="span-vacancies-loaction-name">Wildflower Marston Day Nursery</span>');
 assert.equal(b.city,"");assert.equal(b.locationLabel,"Wildflower Marston Day Nursery");
});
test("explicit role clauses fill missing employment type; generic benefits do not",()=>{
 const f=mainPageFields('<div id="ctl_VacV_Description">This is a permanent, part time role offering 20 hours per week.</div>');
 assert.equal(f.employmentType,'permanent, part time');
 assert.equal(mainPageFields('<div id="ctl_VacV_Description">We support permanent staff. Benefits for all full time staff.</div>').employmentType,"");
});
