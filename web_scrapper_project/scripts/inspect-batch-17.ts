import { AccessPolicy } from '../src/crawl.js';
import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve('output/batch 17-9-2026/inspection');
await mkdir(out, {recursive:true});
const sites = [
 ['cc-vacancies-js','https://www.jobtrain.co.uk/ccnurseries/assets/scripts/vacancies/vacancies.js'],
];
await Promise.all(sites.map(async ([slug,url]) => {
 const policy = new AccessPolicy(1000,15000);
 try {
 const response = await policy.html(url!);
 await writeFile(resolve(out,`${slug}.html`),response.body);
 const $=load(response.body);
 const links=$('a[href]').map((_,e)=>({text:$(e).text().trim().replace(/\s+/g,' ').slice(0,120),href:$(e).attr('href')})).get().filter(x=>/career|vacanc|jobs|recruit|\bnext\b/i.test(x.href+' '+x.text));
 console.log(JSON.stringify({slug,url:response.url,title:$('title').text(),links,robots:url!.endsWith('robots.txt')?response.body:undefined}));
 } catch(e) {console.log(JSON.stringify({slug,error:String(e)}));}
}));
