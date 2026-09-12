# Deploy con prova di caricamento obbligatoria, poi comandi opzionali.
# Uso: pwsh scripts/deploy-sicuro.ps1 <file log> [comandi dopo...]
param([string]$Log, [string[]]$Dopo)
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:PORT = '3997'
$out = npx tsx scripts/prova-caricamento.mjs 2>&1 | Select-String -Pattern 'MODULO CARICATO|ERRORE CARICAMENTO'
"$out" | Out-File $Log
if ("$out" -notmatch 'MODULO CARICATO') { 'NON PUBBLICO' | Out-File $Log -Append; exit 1 }
npm run deploy 2>&1 | Out-File $Log -Append
"DEPLOY EXIT $LASTEXITCODE" | Out-File $Log -Append
if ($LASTEXITCODE -ne 0) { exit 1 }
foreach ($c in $Dopo) { "== $c ==" | Out-File $Log -Append; Invoke-Expression $c 2>&1 | Out-File $Log -Append }
