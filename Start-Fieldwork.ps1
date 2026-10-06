$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    if (-not $env:FIELDWORK_DATA_DIR) {
        $env:FIELDWORK_DATA_DIR = & (Join-Path $PSScriptRoot 'Choose-Fieldwork-Location.ps1') -Read
    }
    if (-not $env:FIELDWORK_DATA_DIR) { throw 'No Fieldwork data folder was selected.' }
    if (-not (Test-Path -LiteralPath 'node_modules/tsx')) { throw 'Run Setup-Fieldwork.cmd first.' }
    & node -e "const fs=require('fs'),p=require('playwright');if(!fs.existsSync(p.chromium.executablePath()))process.exit(1)"
    if ($LASTEXITCODE -ne 0) { throw 'Chromium is missing. Run Setup-Fieldwork.cmd.' }
    if (-not $env:FIELDWORK_OPEN_BROWSER) { $env:FIELDWORK_OPEN_BROWSER = '1' }
    Write-Host "Fieldwork data: $env:FIELDWORK_DATA_DIR"
    & npm run ui
    exit $LASTEXITCODE
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
