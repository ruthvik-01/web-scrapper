import csv, re, zipfile, shutil
from pathlib import Path

root = Path(r"D:\Internship\MAIN\UK SCRAPPER")
old = root / "output/22-9-26 batch-corrected-fields/companies-main.csv"
srcdir = Path(r"D:\Programs\Java\downloads\batch 21-9-26")
files = sorted(srcdir.glob("*jobs_cleaned.csv"))
dest = root / "output/combined-21-22-9-26"
dest.mkdir(parents=True, exist_ok=True)
fields = None; rows = []; audit = []

def clean(r, source):
    s = (r.get("salaryRange") or "").strip()
    m = re.search(r"[0-9][0-9,]*(?:\.[0-9]+)?", s)
    if m and float(m.group().replace(",", "")) < 1000:
        note = "Hourly/day rate: " + s
        if note.lower() not in r["description"].lower(): r["description"] = r["description"].rstrip() + "\n\n" + note
        r["salaryRange"] = ""; audit.append([source, r["jobId"], "sub-1000-to-description", s, ""])
    # Convert annual shorthand such as £80k - 90k to contract format.
    def kfmt(x):
        n = float(x.replace(",", "")) * 1000
        return f"£{int(n) if n.is_integer() else n:g}"
    if re.fullmatch(r"£?\s*[0-9]+(?:\.[0-9]+)?k\s*(?:-\s*£?\s*[0-9]+(?:\.[0-9]+)?k)?", s, re.I):
        nums = re.findall(r"[0-9]+(?:\.[0-9]+)?", s)
        r["salaryRange"] = "-".join(kfmt(n) for n in nums)
        audit.append([source, r["jobId"], "annual-k-normalized", s, r["salaryRange"]])

for path in [old, *files]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if fields is None: fields = reader.fieldnames
        for r in reader:
            clean(r, path.name); rows.append(r)

out = dest / "companies.csv"
with out.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
with (dest / "salary-normalization-report.csv").open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f); w.writerow(["source", "jobId", "change", "before", "after"]); w.writerows(audit)
with (dest / "README.md").open("w", encoding="utf-8") as f:
    f.write(f"# Combined 21-9-26 and 22-9-26 batches\n\nRows: {len(rows)}\nSources: corrected 22-9-26 batch plus four supplied 21-9-26 CSVs. Values below £1,000 were moved to descriptions; annual k shorthand was converted to pounds.\n")
zip_path = dest / "combined-21-22-9-26.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for p in (out, dest / "salary-normalization-report.csv", dest / "README.md"):
        z.write(p, p.name)
print({"rows": len(rows), "sources": len(files)+1, "changes": len(audit), "zip": str(zip_path)})
