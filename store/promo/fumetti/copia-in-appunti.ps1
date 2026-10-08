# Mette un'immagine (PNG/JPG) negli appunti di sistema, per incollarla in Gemini come riferimento di stile.
# Uso: powershell.exe -NoProfile -STA -File copia-in-appunti.ps1 <percorso>
param([Parameter(Mandatory=$true)][string]$In)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($In)
[System.Windows.Forms.Clipboard]::SetImage($img)
"copiata $In $($img.Width)x$($img.Height)"
