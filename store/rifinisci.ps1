# Toglie la barra del titolo di Chrome dalla cattura e porta l'immagine al
# formato che Google Play vuole per gli screenshot da telefono: 1080x1920
# (rapporto 9:16 esatto, entro i limiti 320-3840 px per lato).
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$BarraTitolo = 38,
  [int]$MargineSx = 9,
  [int]$MargineDx = 2
)

Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($In)

# ritaglio: via la barra del titolo, poi l'altezza esatta per il 9:16
$w = $src.Width - $MargineSx - $MargineDx
$hVoluta = [int][Math]::Round($w / 0.5625)
$disponibile = $src.Height - $BarraTitolo
if ($hVoluta -gt $disponibile) { $hVoluta = $disponibile }
$srcR = New-Object System.Drawing.Rectangle $MargineSx, $BarraTitolo, $w, $hVoluta

$bmp = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'
$g.SmoothingMode = 'HighQuality'
$g.PixelOffsetMode = 'HighQuality'
$dstR = New-Object System.Drawing.Rectangle 0, 0, 1080, 1920
$g.DrawImage($src, $dstR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "$Out  (1080x1920, da ritaglio $w x $hVoluta)"
