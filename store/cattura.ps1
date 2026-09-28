# Cattura l'AREA CLIENTE della finestra Chrome in modalita' --app (niente barra
# del titolo, niente bordi): quello che si vede e' esattamente la pagina.
# Uso: powershell -File cattura.ps1 -Pid 11136 -Out "...\01-mappa.png"
param(
  [Parameter(Mandatory=$true)][int]$ProcId,
  [Parameter(Mandatory=$true)][string]$Out
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
}
"@

$p = Get-Process -Id $ProcId
$h = $p.MainWindowHandle
[void][Win]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 1200

$rc = New-Object Win+RECT
[void][Win]::GetClientRect($h, [ref]$rc)
$pt = New-Object Win+POINT
$pt.X = 0; $pt.Y = 0
[void][Win]::ClientToScreen($h, [ref]$pt)

$w = $rc.R - $rc.L
$hgt = $rc.B - $rc.T

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $w, $hgt
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($pt.X, $pt.Y, 0, 0, (New-Object System.Drawing.Size $w, $hgt))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Write-Output "$Out  ($w x $hgt)"
