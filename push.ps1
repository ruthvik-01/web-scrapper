param([string]$Message = "")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'D:\Internship\MAIN\UK SCRAPPER'
if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "chore: update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
git add -A
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host 'Nothing to commit — working tree clean.'
} else {
  git commit -m $Message
}
git pull --rebase origin main
git push origin main
git status -sb
