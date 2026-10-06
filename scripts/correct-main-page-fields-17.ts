import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { mainPageFields } from "../src/main-page-fields.js";
import { outputCsv, type OutputRow } from "../src/output.js";
import { packageBatch } from "./package-batch.js";

const root=resolve(import.meta.dirname,"..");
const base=resolve(root,"output/batch 17-9-2026");
const input=resolve(base,"company-names-corrected");
const captures=resolve(root,"output/_history/batch-17-main-page-review");
const destination=resolve(base,"main-page-corrected");
const stage=await mkdtemp(resolve(tmpdir(),"main-page-corrected-"));
const manifest=resolve(input,"code/universal_scraper/companies.json");
const companies=JSON.parse(await readFile(manifest,"utf8"));
const audit: Record<string,unknown>[]=[];
const summaries=[];
const fields=["employmentType","city","state","location"] as const;
for(const company of companies){
 const oldFolder=resolve(input,"jobs company wise",company.slug);
 const rows:OutputRow[]=JSON.parse(await readFile(resolve(oldFolder,"export-rows.json"),"utf8"));
 const result=JSON.parse(await readFile(resolve(oldFolder,"scrape-result.json"),"utf8"));
 const evidence=[];
 for(const row of rows.filter(r=>r.jobId)){
  const meta=JSON.parse(await readFile(resolve(captures,company.slug,`${row.jobId}.json`),"utf8"));
  assert.equal(meta.status,"read",`Unavailable page: ${company.slug}/${row.jobId}`);
  const f=mainPageFields(await readFile(resolve(captures,company.slug,`${row.jobId}.html`),"utf8"));
  assert.ok(f.title && f.roleText,`Missing main vacancy content: ${row.jobId}`);
  assert.equal(f.title.toLowerCase().replace(/[^a-z0-9]/g,""),row.title.toLowerCase().replace(/[^a-z0-9]/g,""),`Job title changed: ${row.jobId}`);
  const before=Object.fromEntries(fields.map(k=>[k,row[k]]));
  row.city=f.city;row.state=f.state;row.employmentType=f.employmentType;
  row.location=[row.city,row.state,row.country].filter(Boolean).join(", ");
  if(f.locationLabel && !row.description.includes(f.locationLabel)) row.description+=`\n\nSource location: ${f.locationLabel}`;
  const record={jobId:row.jobId,company:company.name,url:meta.url,checkedAt:meta.checkedAt,
   before,after:Object.fromEntries(fields.map(k=>[k,row[k]])),visibleLocation:f.locationLabel,evidence:f.evidence,
   changedFields:fields.filter(k=>before[k]!==row[k]),
   rule:"Only primary visible vacancy fields or explicit role clauses; no metadata/geocoder/HQ county assignment. Empty means unsupported by this visible-page parser, not proof the role has no location or contract."};
  audit.push(record);evidence.push(record);
 }
 const folder=resolve(stage,company.slug);await mkdir(folder);
 result.rows=rows.filter(r=>r.jobId);
 result.report.mainPageFieldVerification={checkedAt:new Date().toISOString(),policy:"Visible main job page only; fields not supported remain empty strings.",rows:evidence};
 // Retain original source records as source evidence, not as corrected exports.
 result.report.rows=result.rows.length;
 for(const [name,data] of Object.entries({"company.json":company,"export-rows.json":rows,"scrape-result.json":result,"scrape-report.json":result.report})) await writeFile(resolve(folder,name),JSON.stringify(data,null,2));
 await writeFile(resolve(folder,"jobs.csv"),outputCsv(rows));
 summaries.push({company:company.name,slug:company.slug,jobs:result.rows.length,status:result.report.status,verifiedMainPages:evidence.length});
}
assert.equal(audit.length,188);
await writeFile(resolve(stage,"batch-report.json"),JSON.stringify(summaries,null,2));
await packageBatch(stage,manifest);
await mkdir(destination,{recursive:true});
for(const name of ["code","jobs company wise","companies.csv","final.zip","validation.json","batch-report.json"]) await cp(resolve(stage,name),resolve(destination,name),{recursive:true});
await writeFile(resolve(destination,"field-corrections.json"),JSON.stringify(audit,null,2));
const corrected= audit.filter(a=>(a.changedFields as string[]).length);
const stats={verifiedJobPages:audit.length,changedRows:corrected.length,changedFields:Object.fromEntries(fields.map(f=>[f,audit.filter(a=>(a.changedFields as string[]).includes(f)).length])),jobs:188,diagnosticRows:3,destination};
await writeFile(resolve(destination,"correction-summary.json"),JSON.stringify(stats,null,2));
console.log(JSON.stringify(stats,null,2));
