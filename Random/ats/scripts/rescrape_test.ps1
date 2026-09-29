# Quick test to verify scraper fixes by rescraping a small subset

# Backup existing files
Write-Host "Backing up existing files..."
Copy-Item "Eddy County_jobs.json" "Eddy County_jobs.backup.json" -Force

# Create a test companies file with just one small company
$testCompanies = @(
    @{
        company = "Eddy County"
        careerUrl = "https://eddy.hrmdirect.com/employment/job-openings.php?sort=da"
    }
) | ConvertTo-Json

$testCompanies | Out-File -FilePath "test_companies.json" -Encoding UTF8

# Temporarily modify scraper to use test companies
$scraperContent = Get-Content "scraper.ts"
$scraperContent = $scraperContent -replace 'readFileSync\("companies.json"', 'readFileSync("test_companies.json"'
$scraperContent | Set-Content "scraper.ts"

Write-Host "Rescraping Eddy County to verify fixes..."
# Run the scraper
npx tsc
node dist/scraper.js

Write-Host "Comparison of job IDs before and after fix:"
Write-Host "=== BEFORE (from backup) ==="
Select-String -Path "Eddy County_jobs.backup.json" -Pattern '"jobId": "[^"]*"' | Select-Object -First 5

Write-Host ""
Write-Host "=== AFTER (from new scrape) ==="
Select-String -Path "Eddy County_jobs.json" -Pattern '"jobId": "[^"]*"' | Select-Object -First 5

Write-Host ""
Write-Host "Checking ats field values:"
Write-Host "=== BEFORE (from backup) ==="
(Select-String -Path "Eddy County_jobs.backup.json" -Pattern '"ats": "[^"]*"' -SimpleMatch | Measure-Object).Count
Get-Content "Eddy County_jobs.backup.json" | Select-String -Pattern '"ats": "HRMDirect"' -SimpleMatch | Select-Object -First 3

Write-Host ""
Write-Host "=== AFTER (from new scrape) ==="
(Select-String -Path "Eddy County_jobs.json" -Pattern '"ats": "[^"]*"' -SimpleMatch | Measure-Object).Count
Get-Content "Eddy County_jobs.json" | Select-String -Pattern '"ats": "HRMDirect"' -SimpleMatch | Select-Object -First 3

Write-Host ""
Write-Host "Test complete. Check results above."

# Restore original scraper
$originalScraper = Get-Content "scraper.ts"
$originalScraper = $originalScraper -replace 'readFileSync\("test_companies.json"', 'readFileSync("companies.json"'
$originalScraper | Set-Content "scraper.ts"