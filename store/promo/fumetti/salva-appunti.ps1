# Salva l'immagine negli appunti di sistema come PNG.
# Uso: powershell.exe -NoProfile -STA -File salva-appunti.ps1 <percorso.png>
# Serve -STA: in MTA l'accesso agli appunti fallisce (Exit 5).
param([Parameter(Mandatory=$true)][string]$Out)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) { Write-Error 'Nessuna immagine negli appunti'; exit 2 }
$img.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"salvata $Out $($img.Width)x$($img.Height)"
