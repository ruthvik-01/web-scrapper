import csv, re, shutil, zipfile
from pathlib import Path

ROOT = Path(r"D:\Internship\MAIN\UK SCRAPPER\output\22-9-26 batch-corrected-fields")
CSV = ROOT / "companies.csv"
rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig", newline="")))

annual = re.compile(r"(?i)(?:salary|annual salary|pay|earnings)\s*(?:is|:|of|up to|from|range)?\s*(£\s*[0-9][0-9,]*(?:\s*[-–]\s*£?\s*[0-9][0-9,]*)?)\s*(?:pa|per annum|per year|a year|annual)?")
currency_range = re.compile(r"£\s*[0-9][0-9,]*(?:\s*[-–]\s*£?\s*[0-9][0-9,]*)?")
hourly = re.compile(r"(?i)(?:£\s*[0-9]+(?:\.[0-9]+)?\s*(?:per hour|an hour|p/?h)|\b(?:hourly rate|hourly pay)\s*[:\-]?\s*£?\s*[0-9]+(?:\.[0-9]+)?)")

def norm(v):
    return re.sub(r"\s+", "", v.replace("–", "-")).replace("££", "£")

changed = []
for i, r in enumerate(rows, 2):
    old_salary = r.get("salaryRange", "")
    desc = r.get("description", "")
    # Small currency values in salaryRange are hourly rates in this batch.
    if old_salary:
        first = re.search(r"[0-9][0-9,]*(?:\.[0-9]+)?", old_salary)
        amount = float(first.group(0).replace(",", "")) if first else 0
        if first and amount < 1000:
            note = f"Hourly rate: {old_salary.strip()}"
            if note.lower() not in desc.lower():
                desc = desc.rstrip() + "\n\n" + note
            r["salaryRange"] = ""
            r["description"] = desc
            changed.append((i, "hourly-to-description", old_salary, ""))
            continue
    if not old_salary:
        # Only promote an amount explicitly tied to salary/pay/earnings.
        matches = []
        for m in annual.finditer(desc):
            value = norm(m.group(1))
            if value and ("per day" not in m.group(0).lower() and "per week" not in m.group(0).lower()):
                matches.append(value)
        if matches:
            # Prefer a range; otherwise use the first clearly annual amount.
            value = next((x for x in matches if "-" in x), matches[0])
            r["salaryRange"] = value
            changed.append((i, "annual-description-to-salaryRange", "", value))

with CSV.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)

report = ROOT / "salary-correction-report.csv"
with report.open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f); w.writerow(["row", "change", "before", "after"]); w.writerows(changed)

zip_path = ROOT / "final.zip"
tmp_zip = ROOT / "final.zip.tmp"
with zipfile.ZipFile(zip_path, "r") as old, zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED) as new:
    for item in old.infolist():
        if item.filename not in {"companies.csv", "salary-correction-report.csv"}:
            new.writestr(item, old.read(item.filename))
    new.write(CSV, "companies.csv")
    new.write(report, "salary-correction-report.csv")
tmp_zip.replace(zip_path)
print({"rows": len(rows), "changes": len(changed), "hourlyMoved": sum(x[1]=="hourly-to-description" for x in changed), "annualPromoted": sum(x[1]=="annual-description-to-salaryRange" for x in changed)})
