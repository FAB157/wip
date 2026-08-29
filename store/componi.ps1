# Compone gli screenshot dell'app nel formato che Google Play chiede per il
# telefono: 1080x1920 (9:16 esatto). La cattura vera dell'app viene messa su
# uno sfondo del blu di marca con una didascalia sopra: e' la presentazione
# standard degli store, e permette di rispettare il rapporto senza tagliare
# nulla dell'interfaccia reale.
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][string]$Titolo,
  [string]$Sottotitolo = ""
)

Add-Type -AssemblyName System.Drawing
$W = 1080; $H = 1920

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'
$g.TextRenderingHint = 'ClearTypeGridFit'

# sfondo: blu di marca in alto, piu' cupo in basso
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$c1 = [System.Drawing.Color]::FromArgb(30, 58, 138)
$c2 = [System.Drawing.Color]::FromArgb(9, 18, 46)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 90
$g.FillRectangle($brush, $rect)

# didascalia
$fT = New-Object System.Drawing.Font("Segoe UI", 46, [System.Drawing.FontStyle]::Bold)
$fS = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Regular)
$bW = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$bS = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(205, 191, 209, 240))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center

$g.DrawString($Titolo, $fT, $bW, (New-Object System.Drawing.RectangleF 60, 95, ($W - 120), 150), $fmt)
if ($Sottotitolo -ne "") {
  $g.DrawString($Sottotitolo, $fS, $bS, (New-Object System.Drawing.RectangleF 80, 232, ($W - 160), 90), $fmt)
}

# la schermata dell'app, con angoli arrotondati
$src = [System.Drawing.Image]::FromFile($In)
$larg = 990
$alt = [int][Math]::Round($src.Height * ($larg / $src.Width))
$x = [int](($W - $larg) / 2)
$y = 400
if ($y + $alt -gt ($H - 60)) { $alt = $H - 60 - $y }

$r = 34
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($x, $y, $r, $r, 180, 90)
$path.AddArc(($x + $larg - $r), $y, $r, $r, 270, 90)
$path.AddArc(($x + $larg - $r), ($y + $alt - $r), $r, $r, 0, 90)
$path.AddArc($x, ($y + $alt - $r), $r, $r, 90, 90)
$path.CloseFigure()

$g.SetClip($path)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle $x, $y, $larg, $alt))
$g.ResetClip()

# bordo sottile chiaro, per staccare dallo sfondo
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 255, 255, 255)), 2
$g.DrawPath($pen, $path)

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "$Out (1080x1920)"
