param([switch]$Read, [string]$Destination)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Get-FieldworkHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)) }
    finally { $sha.Dispose(); $stream.Dispose() }
}
try {
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is unavailable.' }
    $default = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Fieldwork'))
    $setting = Join-Path $default 'location.txt'
    $current = if (Test-Path -LiteralPath $setting) { (Get-Content -LiteralPath $setting -Raw).Trim() } else { $default }
    if (-not $current) { throw "Saved data location is empty: $setting" }
    $current = [IO.Path]::GetFullPath($current)
    if ($Read) { Write-Output $current; exit 0 }

    if (-not $PSBoundParameters.ContainsKey('Destination')) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.FolderBrowserDialog
        $picker.Description = 'Choose where Fieldwork saves your imports, runs and exports'
        if (Test-Path -LiteralPath $current) { $picker.SelectedPath = $current }
        if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
        $Destination = $picker.SelectedPath
    }
    if (-not $Destination) { exit 0 }
    $target = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
    $source = $current.TrimEnd('\')
    if ($target.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
        $target.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $source.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Choose a different folder outside the current data folder.'
    }
    if (Test-Path -LiteralPath $target) {
        if (-not (Get-Item -LiteralPath $target).PSIsContainer) { throw "Destination is not a folder: $target" }
        if (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1) { throw "Destination must be empty: $target" }
    }
    $port = if ($env:PORT -and $env:PORT -ne '0') { $env:PORT } else { '4317' }
    if ($env:PORT -ne '0') {
        try {
            $running = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/dashboard" -TimeoutSec 2
            if ($running.token -and $running.companies -ne $null) { throw 'Stop Fieldwork before changing its data location.' }
        } catch {
            if ($_.Exception.Message -like 'Stop Fieldwork*') { throw }
        }
    }
    if (Test-Path -LiteralPath $source) {
        $links = Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
        if ($links) { throw 'The current data folder contains a linked folder or file; move it manually before changing location.' }
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    if (Test-Path -LiteralPath $source) {
        Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
        $files = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force)
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($source.Length).TrimStart('\')
            $copied = Join-Path $target $relative
            if (-not (Test-Path -LiteralPath $copied) -or
                (Get-Item -LiteralPath $copied).Length -ne $file.Length -or
                (Get-FieldworkHash $copied) -ne (Get-FieldworkHash $file.FullName)) {
                throw "Copy verification failed: $relative. The old location is unchanged."
            }
        }
    }
    New-Item -ItemType Directory -Path $default -Force | Out-Null
    $temporary = Join-Path $default ('location-' + [guid]::NewGuid().ToString('N') + '.tmp')
    Set-Content -LiteralPath $temporary -Value $target -NoNewline -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $setting -Force
    Write-Output "Fieldwork data copied to $target. The old folder remains at $source."
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
