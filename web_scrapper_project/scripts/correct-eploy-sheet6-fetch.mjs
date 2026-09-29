import fs from 'node:fs';
import {load} from 'cheerio';
const dir='output/eploy-sheet6-corrected-2026-09-18';
const rows=JSON.parse(fs.readFileSync(`${dir}/input.json`,'utf8'));
fs.mkdirSync(`${dir}/sources`,{recursive:true});
function extract(html){
 const $=load(html);
 const schema=[];$('script[type="application/ld+json"]').each((_,e)=>{try{const walk=x=>{if(Array.isArray(x))return x.forEach(walk);if(x&&typeof x==='object'){if([x['@type']].flat().includes('JobPosting'))schema.push({title:x.title,employmentType:x.employmentType,jobLocationType:x.jobLocationType});if(x['@graph'])walk(x['@graph']);}};walk(JSON.parse($(e).text()));}catch{}});
 $('script,style,header,footer,nav,[hidden],[aria-hidden="true"]').remove();
 $('[id],[class]').filter((_,e)=>/suggested|related|jobResultList|jobsSlider/i.test(`${$(e).attr('id')||''} ${$(e).attr('class')||''}`)).remove();
 const fields=[];$('[id]').each((_,e)=>{const id=$(e).attr('id');const text=$(e).text().replace(/\s+/g,' ').trim();if(/VacV_|Working|Workplace|Contract/i.test(id)&&text&&text.length<250&&!/^(li|div)_/.test(id))fields.push({id,text});});
 const desc=$('[id$="VacV_Description"]').first().text()||$('.JT-container').first().text();
 return {title:$('h1').first().text().trim(),fields,schema,description:desc,body:$('main').first().text().replace(/\s+/g,' ').trim().slice(0,30000)};
}
const unique=[...new Map(rows.map((r,i)=>[r.jobUrl,{...r,index:i}])).values()];let queue=[...unique],active=0,done=0;const hosts=new Map();
await new Promise(resolve=>{function launch(){if(!queue.length&&!active)return resolve();while(active<12){const n=queue.findIndex(r=>(hosts.get(new URL(r.jobUrl).host)||0)<2);if(n<0)break;const r=queue.splice(n,1)[0],host=new URL(r.jobUrl).host;active++;hosts.set(host,(hosts.get(host)||0)+1);(async()=>{const path=`${dir}/sources/${r.index}.json`;if(!fs.existsSync(path)){let result={url:r.jobUrl,index:r.index,checkedAt:new Date().toISOString()};try{const cached=`${dir}/pages/${r.index}.html`;let html;if(fs.existsSync(cached)){html=fs.readFileSync(cached,'utf8');result.status=200;}else{const res=await fetch(r.jobUrl,{signal:AbortSignal.timeout(35000)});result.status=res.status;result.finalUrl=res.url;html=await res.text();}if(result.status===200)Object.assign(result,extract(html));}catch(e){result.error=e.message;}fs.writeFileSync(path,JSON.stringify(result));}})().finally(()=>{active--;hosts.set(host,hosts.get(host)-1);done++;if(done%100===0||done===unique.length)console.log(`${done}/${unique.length}`);launch();});}}launch();});
console.log('Finished');
