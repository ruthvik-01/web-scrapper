#!/bin/bash
# Quick test to verify scraper fixes by rescraping a small subset

# Backup existing files
echo "Backing up existing files..."
cp "Eddy County_jobs.json" "Eddy County_jobs.backup.json"

# Create a test companies file with just one small company
echo '[
  {
    "company": "Eddy County",
    "careerUrl": "https://eddy.hrmdirect.com/employment/job-openings.php?sort=da"
  }
]' > test_companies.json

echo "Rescraping Eddy County to verify fixes..."
npx ts-node scraper.ts

echo "Comparison of job IDs before and after fix:"
echo "=== BEFORE (from backup) ==="
grep -o '"jobId": "[^"]*"' "Eddy County_jobs.backup.json" | head -5

echo ""
echo "=== AFTER (from new scrape) ==="
grep -o '"jobId": "[^"]*"' "Eddy County_jobs.json" | head -5

echo ""
echo "Checking ats field values:"
echo "=== BEFORE (from backup) ==="
grep -o '"ats": "[^"]*"' "Eddy County_jobs.backup.json" | head -3

echo ""
echo "=== AFTER (from new scrape) ==="
grep -o '"ats": "[^"]*"' "Eddy County_jobs.json" | head -3

echo ""
echo "Test complete. Check results above."