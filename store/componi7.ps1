# Compone una cattura dell'app (qualsiasi rapporto) in uno screenshot Play
# 1080x1920 con titolo+sottotitolo, adattando l'immagine al riquadro senza
# tagliarla (a differenza di componi.ps1, che la scala solo in larghezza).
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][string]$Titolo,
  [string]$Sottotitolo = "",
  [int]$TagliaSopra = 0,    # px da togliere in alto alla cattura (barra del titolo della finestra app)
  [int]$W = 1080,           # Google Play: 1080x1920 · App Store iPhone 6,9": 1320x2868
  [int]$H = 1920
)
Add-Type -AssemblyName System.Drawing
$k = $W / 1080.0           # fattore di scala per testi e margini
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'ClearTypeGridFit'
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(30,58,138)), ([System.Drawing.Color]::FromArgb(9,18,46)), 90
$g.FillRectangle($brush, $rect)

# titolo: dimensione che scala con la lunghezza, mai su piu' di due righe
$size = 46; if ($Titolo.Length -gt 22) { $size = 40 }; if ($Titolo.Length -gt 30) { $size = 34 }
$fT = New-Object System.Drawing.Font("Segoe UI", ($size * $k), [System.Drawing.FontStyle]::Bold)
$fS = New-Object System.Drawing.Font("Segoe UI", (26 * $k), [System.Drawing.FontStyle]::Regular)
$bW = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$bS = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(205,191,209,240))
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
$top = [int](95 * $k)
$g.DrawString($Titolo, $fT, $bW, (New-Object System.Drawing.RectangleF (60*$k), $top, ($W-120*$k), (150*$k)), $fmt)
if ($Sottotitolo -ne "") { $g.DrawString($Sottotitolo, $fS, $bS, (New-Object System.Drawing.RectangleF (80*$k), (232*$k), ($W-160*$k), (90*$k)), $fmt) }

$src = [System.Drawing.Image]::FromFile($In)
$srcR = New-Object System.Drawing.Rectangle 0, $TagliaSopra, $src.Width, ($src.Height - $TagliaSopra)
$y = [int](400 * $k)
$maxW = [int](990 * $k); $maxH = $H - [int](60 * $k) - $y
$scala = [Math]::Min($maxW / $srcR.Width, $maxH / $srcR.Height)
$larg = [int]($srcR.Width * $scala); $alt = [int]($srcR.Height * $scala)
$x = [int](($W - $larg) / 2)
$r = [int](34 * $k)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($x, $y, $r, $r, 180, 90); $path.AddArc(($x+$larg-$r), $y, $r, $r, 270, 90)
$path.AddArc(($x+$larg-$r), ($y+$alt-$r), $r, $r, 0, 90); $path.AddArc($x, ($y+$alt-$r), $r, $r, 90, 90)
$path.CloseFigure()
$g.SetClip($path)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle $x, $y, $larg, $alt), $srcR, [System.Drawing.GraphicsUnit]::Pixel)
$g.ResetClip()
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90,255,255,255)), 2
$g.DrawPath($pen, $path)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "$Out ($larg x $alt dentro ${W}x${H})"
