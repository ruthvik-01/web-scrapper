import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { packageBatch } from '../scripts/package-batch.js';
import { OUTPUT_COLUMNS, outputCsv, type OutputRow } from '../src/output.js';

test('eight-company packaging keeps shared code, separate results, empty posted dates, and excludes artifacts', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'batch-package-'));
  try {
    const companies = Array.from({length:8}, (_,i)=>({name:`Company ${i}`,slug:`company-${i}`,careersUrl:`https://example.com/jobs/${i}`,
      exportCompanyName:`Company ${i}`,employerNames:[`Source ${i}`]}));
    const manifest=resolve(dir,'manifest.json');
    await writeFile(manifest,JSON.stringify(companies));
    for (const c of companies) {
      const folder=resolve(dir,c.slug);
      await mkdir(folder);
      const row=Object.fromEntries(OUTPUT_COLUMNS.map(k=>[k,''])) as OutputRow;
      Object.assign(row,{jobId:'1',title:'Role',description:'Details',jobUrl:c.careersUrl,company:c.name,country:'UK',location:'UK',ats:'Custom',jdDeadline:'2026-10-01'});
      await writeFile(resolve(folder,'export-rows.json'),JSON.stringify([row]));
      await writeFile(resolve(folder,'jobs.csv'),outputCsv([row]));
      await writeFile(resolve(folder,'scrape-report.json'),JSON.stringify({status:'ok',rows:1,window:{from:'2026-07-17',to:'2026-09-17'},skipped:[],issues:[],limited:false,
        exportCompanyIdentity:{name:c.name,sourceNames:c.employerNames}}));
      await writeFile(resolve(folder,'unwanted.log'),'not for delivery');
    }
    await packageBatch(dir,manifest);
    const files=unzipSync(await readFile(resolve(dir,'final.zip')));
    assert.ok(files['companies.csv']);
    assert.equal(Object.keys(files).filter(p=>/^jobs company wise\/[^/]+\/jobs.csv$/.test(p)).length,8);
    assert.equal(Object.keys(files).filter(p=>/^code\/[^/]+\/scrape.ts$/.test(p)).length,8);
    assert.ok(!Object.keys(files).some(p=>p.endsWith('.log') || p.includes('/results/') || /code\/company-\d\/src\//.test(p)));
    assert.ok(files['code/universal_scraper/src/batch.ts']);
    assert.equal(JSON.parse(await readFile(resolve(dir,'validation.json'),'utf8')).csvRows,8);
    const first = resolve(dir,companies[0]!.slug);
    const invalid = JSON.parse(await readFile(resolve(first,'export-rows.json'),'utf8'));
    invalid[0].company = 'Unexpected brand';
    await writeFile(resolve(first,'export-rows.json'),JSON.stringify(invalid));
    await writeFile(resolve(first,'jobs.csv'),outputCsv(invalid));
    await assert.rejects(packageBatch(dir,manifest),/Unexpected exported company name/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('zero-job packaging preserves company folders and reports without diagnostic CSV rows', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'batch-empty-'));
  try {
    const company = {name:'Blocked Company',slug:'blocked-company',careersUrl:'https://example.com/jobs'};
    const manifest = resolve(dir,'manifest.json');
    const folder = resolve(dir,company.slug);
    await mkdir(folder);
    await writeFile(manifest,JSON.stringify([company]));
    await writeFile(resolve(folder,'export-rows.json'),'[]');
    await writeFile(resolve(folder,'jobs.csv'),outputCsv([]));
    await writeFile(resolve(folder,'scrape-report.json'),JSON.stringify({
      status:'partial',rows:0,window:{from:'2026-07-17',to:'2026-09-17'},
      skipped:[],issues:[{url:company.careersUrl,message:'Disallowed by robots.txt.'}],limited:false,
    }));
    await packageBatch(dir,manifest);
    const archive = await readFile(resolve(dir,'final.zip'));
    assert.equal(archive.subarray(0,2).toString(),'PK');
    const files = unzipSync(archive);
    assert.equal(Buffer.from(files['companies.csv']!).toString(),outputCsv([]));
    assert.equal(Buffer.from(files['jobs company wise/blocked-company/jobs.csv']!).toString(),outputCsv([]));
    assert.ok(files['jobs company wise/blocked-company/scrape-report.json']);
    assert.ok(files['code/blocked-company/scrape.ts']);
    const row = Object.fromEntries(OUTPUT_COLUMNS.map(k=>[k,''])) as OutputRow;
    row.company = company.name;
    await writeFile(resolve(folder,'export-rows.json'),JSON.stringify([row]));
    await writeFile(resolve(folder,'jobs.csv'),outputCsv([row]));
    await assert.rejects(packageBatch(dir,manifest),/Diagnostic rows are not jobs/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
