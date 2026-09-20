param([Parameter(Mandatory=$true)][int]$BatchProcessId)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$directory = 'output/akhil-ruthvik-2026-09-18'
$manifest = 'companies-akhil-ruthvik-2026-09-18.json'
$python = 'C:\Users\RUTHVIK\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
try {
    # Wait for this exact batch, not unrelated Node processes. No polling loop.
    $process = Get-Process -Id $BatchProcessId -ErrorAction SilentlyContinue
    if ($process) { $process.WaitForExit() }
    $companies = @(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)
    $report = @(Get-Content -LiteralPath "$directory/batch-report.json" -Raw | ConvertFrom-Json)
    if ($report.Count -ne $companies.Count) {
        throw "Batch stopped before all companies completed: $($report.Count)/$($companies.Count)."
    }
    & node node_modules/tsx/dist/cli.mjs scripts/package-batch.ts $directory $manifest *> "$directory/package.log"
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed; inspect package.log.' }
    & $python scripts/validate-batch.py $directory $manifest *> "$directory/verification.log"
    if ($LASTEXITCODE -ne 0) { throw 'Independent verification failed; inspect verification.log.' }
    @{
        state = 'packaged_and_validated'
        completedAt = (Get-Date).ToUniversalTime().ToString('o')
        companiesAttempted = $report.Count
        sourceRowsHeld = 8
        rows = ($report | Measure-Object -Property rows -Sum).Sum
        unresolvedExtractions = @($report | Where-Object { $_.status -in @('partial','unsupported','failed') }).Count
        note = 'Validation covers export integrity, not completeness of unsupported or partial sites. Review INPUT_REVIEW.md and all scrape reports.'
    } | ConvertTo-Json | Set-Content -LiteralPath "$directory/completion.json" -Encoding utf8
} catch {
    @{
        state = 'needs_attention'
        error = $_.Exception.Message
        checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath "$directory/completion.json" -Encoding utf8
    throw
}
