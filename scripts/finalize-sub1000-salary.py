import csv, re, zipfile
from pathlib import Path
root=Path(r"D:\Internship\MAIN\UK SCRAPPER\output\22-9-26 batch-corrected-fields")
src=root/'companies.csv'; out=root/'companies-salary-normalized.csv'
rows=list(csv.DictReader(src.open(encoding='utf-8-sig',newline=''))); moved=0
for r in rows:
    m=re.search(r'[0-9][0-9,]*(?:\.[0-9]+)?',r['salaryRange'] or '')
    if m and float(m.group().replace(',',''))<1000:
        note='Hourly/day rate: '+r['salaryRange'].strip()
        if note.lower() not in r['description'].lower(): r['description']=r['description'].rstrip()+'\n\n'+note
        r['salaryRange']=''; moved+=1
with out.open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
zp=root/'final.zip'; tmp=root/'final.zip.tmp'
with zipfile.ZipFile(zp) as old, zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as new:
    for i in old.infolist():
        if i.filename not in {'companies.csv','companies-salary-normalized.csv'}: new.writestr(i,old.read(i.filename))
    new.write(out,'companies.csv'); new.write(out,'companies-salary-normalized.csv')
tmp.replace(zp); print({'moved':moved,'rows':len(rows)})
