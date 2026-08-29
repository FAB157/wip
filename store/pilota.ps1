# Pilota la finestra Chrome in modalita' --app (nessuna barra del browser:
# quello che si vede e' solo la pagina) per catturare gli screenshot dello
# Store: la porta in primo piano, puo' cliccarci dentro e ne cattura l'area
# cliente. Si lavora sull'HANDLE, non sul PID: lo stesso processo Chrome ha
# piu' finestre e MainWindowHandle punta a quella sbagliata.
#
#   pilota.ps1 -Azione trova
#   pilota.ps1 -Azione clic    -Handle 854806 -X 210 -Y 700
#   pilota.ps1 -Azione cattura -Handle 854806 -Out "...\raw.png"
param(
  [Parameter(Mandatory=$true)][ValidateSet('trova','clic','cattura','scorri')][string]$Azione,
  [int64]$Handle = 0,
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Tacche = -3,
  [string]$Out = ""
)

Add-Type @"
using System;using System.Text;using System.Runtime.InteropServices;
public class P {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb c, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, IntPtr e);
  public struct RECT { public int L,T,R,B; }
  public struct POINT { public int X,Y; }
  public const uint GIU = 0x0002, SU = 0x0004, ROTELLA = 0x0800;
}
"@

function Origine([int64]$h) {
  $pt = New-Object P+POINT; $pt.X = 0; $pt.Y = 0
  [void][P]::ClientToScreen([IntPtr]$h, [ref]$pt)
  return $pt
}

if ($Azione -eq 'trova') {
  $trovate = @()
  $cb = [P+Cb]{ param($h,$l)
    if ([P]::IsWindowVisible($h)) {
      $t = New-Object System.Text.StringBuilder 512
      [void][P]::GetWindowText($h, $t, 512)
      $c = New-Object System.Text.StringBuilder 256
      [void][P]::GetClassName($h, $c, 256)
      if ($c.ToString() -like "Chrome_WidgetWin*" -and $t.Length -gt 0) {
        $r = New-Object P+RECT
        [void][P]::GetWindowRect($h, [ref]$r)
        $script:trovate += [PSCustomObject]@{
          Handle=[int64]$h
          Titolo=$t.ToString().Substring(0,[Math]::Min(40,$t.Length))
          X=$r.L; Y=$r.T; W=($r.R-$r.L); H=($r.B-$r.T)
        }
      }
    }
    return $true
  }
  [void][P]::EnumWindows($cb, [IntPtr]::Zero)
  $trovate | Format-Table -AutoSize
  return
}

[void][P]::SetForegroundWindow([IntPtr]$Handle)
Start-Sleep -Milliseconds 900
$o = Origine $Handle

if ($Azione -eq 'clic') {
  [void][P]::SetCursorPos($o.X + $X, $o.Y + $Y)
  Start-Sleep -Milliseconds 300
  [P]::mouse_event([P]::GIU, 0,0,0,[IntPtr]::Zero)
  Start-Sleep -Milliseconds 90
  [P]::mouse_event([P]::SU, 0,0,0,[IntPtr]::Zero)
  Write-Output "clic su ($X,$Y)"
  return
}

if ($Azione -eq 'scorri') {
  [void][P]::SetCursorPos($o.X + $X, $o.Y + $Y)
  Start-Sleep -Milliseconds 250
  [P]::mouse_event([P]::ROTELLA, 0, 0, (120 * $Tacche), [IntPtr]::Zero)
  Write-Output "scorrimento $Tacche tacche in ($X,$Y)"
  return
}

# cattura
$rc = New-Object P+RECT
[void][P]::GetClientRect([IntPtr]$Handle, [ref]$rc)
$w = $rc.R - $rc.L; $h2 = $rc.B - $rc.T
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $w, $h2
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($o.X, $o.Y, 0, 0, (New-Object System.Drawing.Size $w, $h2))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "$Out ($w x $h2)"
