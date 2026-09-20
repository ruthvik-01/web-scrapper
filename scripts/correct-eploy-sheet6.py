import csv,json,re,collections,pathlib,html,unicodedata
P=pathlib.Path('output/eploy-sheet6-corrected-2026-09-18')
rows=json.loads((P/'input.json').read_text(encoding='utf8'))
def clean(s):return re.sub(r'\s+',' ',html.unescape(str(s))).strip()
def norm(s):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',clean(s)).lower())
def employment(s):
 s=clean(s);s=re.sub(r'^(?:contract(?: type)?|employment type)\s*:\s*','',s,flags=re.I)
 if re.fullmatch(r'permanent(?: employee)?',s,re.I):return 'Permanent'
 if re.fullmatch(r'temporary(?: employee)?',s,re.I):return 'Temporary'
 if re.fullmatch(r'fixed[ -]term(?: contract| \(end date\))?',s,re.I):return 'Fixed-term contract'
 if re.fullmatch(r'temporary\s*/\s*fixed term contract',s,re.I):return 'Temporary / Fixed-term contract'
 if re.fullmatch(r'full[ -]time\s*/\s*part[ -]time',s,re.I):return 'Full-time / Part-time'
 for pat,label in [(r'full[ -]time','Full-time'),(r'part[ -]time','Part-time'),(r'casual\s*/\s*bank','Casual / Bank'),(r'zero hours','Zero-hours'),(r'term time only','Term-time only'),(r'contract','Contract'),(r'placement','Placement'),(r'casual','Casual'),(r'apprenticeship','Apprenticeship'),(r'volunteer','Volunteer'),(r'internship','Internship')]:
  if re.fullmatch(pat,s,re.I):return label
 return ''
work_patterns=[
 ('Hybrid',r'\bhybrid\s+(?:working|work\b|role|position|model|arrangement|pattern|approach|environment|basis|contract)'),
 ('Hybrid',r'\b(?:work|working|operate|operates)\s+(?:on |in |to |with |a |an |our |flexible |offer )*(?:hybrid)\b'),
 ('Hybrid',r'\bhybrid\s*[,:(-]'),
 ('Remote',r'\b(?:fully|100%)\s+remote\b'),
 ('Remote',r'\b(?:home|remote)[ -]based\s+(?:role|position|working|contract)\b'),
 ('Remote',r'\b(?:role|position)\s+(?:is |will be |can be )?(?:fully )?(?:remote|home[ -]based)\b'),
 ('Remote',r'\bremote[ -](?:working )?(?:role|position)\b'),
 ('On-site',r'\b(?:role|position|post)\s+(?:is |will be |is an? |will be an? )?(?:fully |entirely |primarily )?(?:on[ -]?site|office[ -]based)\b'),
 ('On-site',r'\b(?:on[ -]?site|office[ -]based)\s+(?:role|position|working)\b'),
 ('On-site',r'\b(?:fully|entirely|100%)\s+(?:office[ -]based|on[ -]?site)\b'),
]
audit=[];out=[]
source_by_url={}
for f in (P/'sources').glob('*.json'):
 s=json.loads(f.read_text(encoding='utf8'));source_by_url[s['url']]=s
for i,r in enumerate(rows):
 s=source_by_url.get(r['jobUrl'],{});fields=s.get('fields',[]);valid=s.get('status')==200
 title=s.get('title','');schemas=s.get('schema',[])
 if title and norm(title)!=norm(r['title']):valid=False
 if s.get('finalUrl') and '/vacancies/' not in s['finalUrl']:valid=False
 if not valid:fields=[];schemas=[]
 desc=clean(s.get('description','')+' '+r['description']) if valid else clean(r['description'])
 # Some templates have their description in main rather than VacV_Description.
 if valid and not s.get('description') and s.get('body') and norm(r['title']) in norm(s['body']):desc=clean(s['body']+' '+r['description'])
 et='';ee='';es=''
 for f in fields:
  if f['id'].endswith('VacV_VacancyTypeID') and employment(f['text']):et=employment(f['text']);ee=f['text'];es='Live vacancy-type field';break
 if not et:
  m=re.search(r'\bself[ -]employed\s+(?:partnership|agreement|basis|role|position|mortgage|financial|adviser|earning|model|opportunit)',desc,re.I)
  if m:et='Self-employed';ee=m[0];es='Explicit description clause'
 if not et:
  m=re.search(r'\bhours per week\s*\(\s*(full[ -]time|part[ -]time)\s*\)',desc,re.I)
  if m:et=employment(m[1]);ee=m[0];es='Explicit hours label, not inferred from hours count'
 if not et:
  for schema in schemas:
   v=schema.get('employmentType','');v=' / '.join(v) if isinstance(v,list) else v
   if employment(v):et=employment(v);ee=v;es='Live JobPosting employmentType';break
 if not et and employment(r['employmentType']):et=employment(r['employmentType']);ee=r['employmentType'];es='Valid original CSV value retained; live type unavailable'
 if not et:
  for pat,label in [(r'\bapprentice(?:ship)?\b','Apprenticeship'),(r'\bvolunteer\b','Volunteer'),(r'\bintern(?:ship)?\b','Internship'),(r'\b(?:fixed[ -]term|FTC)\b','Fixed-term contract'),(r'\bpart[ -]time\b','Part-time'),(r'\bfull[ -]time\b','Full-time'),(r'\bcasual\b','Casual'),(r'^bank\b','Casual / Bank')]:
   if re.search(pat,r['title'],re.I):et=label;ee=r['title'];es='Explicit job title';break
 if not et:
  for pat in [r'\b(?:this is|this role is|this position is|we are offering)\s+(?:a |an )?(?:\w+[ -]){0,2}?(permanent|temporary|fixed[ -]term|full[ -]time|part[ -]time)\s+(?:role|position|contract|opportunity)',r'\b(?:contract type|employment type|job type|working hours)\s*:\s*(permanent|temporary|fixed[ -]term|full[ -]time|part[ -]time)',r'\b(permanent|temporary|fixed[ -]term|full[ -]time|part[ -]time)\s+(?:contract|basis)\b']:
   m=re.search(pat,desc,re.I)
   if m:et=employment(m[1]);ee=m[0];es='Explicit description clause';break
 wt='';we='';ws='';candidates=[]
 for f in fields:
  if re.search(r'Location|Workplace|Working|PositionID',f['id'],re.I):
   if re.search(r'\bhybrid\b',f['text'],re.I):wt='Hybrid'
   elif re.fullmatch(r'(?:fully )?remote|home[ -]based',f['text'],re.I):wt='Remote'
   elif re.fullmatch(r'office[ -]based',f['text'],re.I):wt='On-site'
   if wt:we=f['text'];ws='Live vacancy location/workplace field';break
 for label,pat in work_patterns:
  for m in re.finditer(pat,desc,re.I):
   pre=desc[max(0,m.start()-45):m.start()]
   if re.search(r'(?:no|not|unable to offer|cannot offer|does not offer|not suitable for|not eligible for)\s+(?:a |any |fully )?$',pre,re.I):continue
   snippet=desc[max(0,m.start()-75):min(len(desc),m.end()+130)]
   if label=='Hybrid' and re.search(r'Agile|Waterfall|combines the energy|office-based work and visits to construction sites',snippet,re.I):continue
   if label=='Hybrid' and re.search(r'where possible|will be considered|requests for',snippet,re.I):continue
   candidates.append((label,snippet))
 # Explicit mix of home and regular physical work in one clause (not a remote-only declaration).
 mixed=re.search(r'.{0,140}(?:work(?:ed|ing)? from home|home[ -]working).{0,180}',desc,re.I)
 if mixed and re.search(r'\b(?:remaining day|\d+ days?|[a-z]+ days? (?:a|per|each)|split|combination|mix|balance)\b',mixed[0],re.I) and re.search(r'\boffice\b',mixed[0],re.I):candidates.insert(0,('Hybrid',mixed[0]))
 if not wt and candidates:
  chosen=next((c for c in candidates if c[0]=='Hybrid'),candidates[0]);wt,we=chosen;ws='Explicit description wording'
 if not wt:
  physical=re.search(r'\b(?:working in customers[’\'] homes|combination of office-based work and visits to construction sites)\b',desc,re.I)
  if physical:wt='On-site';we=desc[max(0,physical.start()-40):physical.end()+100];ws='Explicit physical workplace duties'
 if not wt:
  for schema in schemas:
   if schema.get('jobLocationType')=='TELECOMMUTE':wt='Remote';we='jobLocationType=TELECOMMUTE';ws='Live JobPosting jobLocationType';break
 row=dict(r);row['employmentType']=et;row['worktype']=wt;out.append(row)
 notes=[]
 if not et:notes.append('Employment type not explicitly established')
 if not wt:notes.append('Work arrangement not explicitly established; not assumed On-site')
 if not valid:notes.append('Live page unavailable or title mismatch; original description used')
 if es.startswith('Valid original'):notes.append('Employment type retained from input; not independently confirmed')
 if len(set(x[0] for x in candidates))>1:notes.append('Multiple workplace phrases; review context')
 audit.append(dict(row=i+2,company=r['company'],jobId=r['jobId'],title=r['title'],jobUrl=r['jobUrl'],oldEmploymentType=r['employmentType'],employmentType=et,employmentEvidence=ee,employmentSource=es,worktype=wt,workEvidence=we,workSource=ws,notes='; '.join(notes),liveStatus=s.get('status','Not fetched')))
with (P/'eploy-sheet6-1-uk-jobs-corrected.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(out)
with (P/'field-correction-audit.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=list(audit[0]));w.writeheader();w.writerows(audit)
(P/'audit.json').write_text(json.dumps(audit,ensure_ascii=False),encoding='utf8')
summary={'rows':len(rows),'sourcesFetched':len(source_by_url),'employmentChanged':sum(a['oldEmploymentType']!=a['employmentType'] for a in audit),'employmentTypes':dict(collections.Counter(x['employmentType'] for x in out)),'worktypes':dict(collections.Counter(x['worktype'] for x in out)),'liveStatus':dict(collections.Counter(x['liveStatus'] for x in audit))}
(P/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary,indent=2))
