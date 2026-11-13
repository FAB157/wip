# Feature graphic 1024x500 per Google Play: icona + "World in Pocket" + claim,
# nella lingua richiesta. Uso: feature7.ps1 -Claim "The guide that speaks when you arrive" -Out ...
param(
  [Parameter(Mandatory=$true)][string]$Claim,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$Icona = "C:\progetti\itainta\store\icona-512.png"
)
Add-Type -AssemblyName System.Drawing
$W = 1024; $H = 500
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'ClearTypeGridFit'
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(30,58,138)), ([System.Drawing.Color]::FromArgb(9,18,46)), 0
$g.FillRectangle($brush, $rect)
$ico = [System.Drawing.Image]::FromFile($Icona)
$g.DrawImage($ico, (New-Object System.Drawing.Rectangle 80, 135, 230, 230))
$fT = New-Object System.Drawing.Font("Segoe UI", 52, [System.Drawing.FontStyle]::Bold)
$size = 24; if ($Claim.Length -gt 40) { $size = 21 }; if ($Claim.Length -gt 52) { $size = 18 }
$fS = New-Object System.Drawing.Font("Segoe UI", $size, [System.Drawing.FontStyle]::Regular)
$bW = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$bS = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(215,191,209,240))
$g.DrawString("World in Pocket", $fT, $bW, 355, 185)
$g.DrawString($Claim, $fS, $bS, (New-Object System.Drawing.RectangleF 362, 275, 640, 90))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $ico.Dispose()
Write-Output "$Out (1024x500)"
