# Spot «Mosca — nove chiese in una» (09/09). Scena 1 Veo CON il parlato originale
# (regola 17: dialoghi veri, la musica resta sotto), scena 2 cupole con audio ambiente,
# card finale blu. Serve veo-mosca-1_<lingua>.mp4 (dialogo nella lingua) e veo-mosca-2.mp4.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
$langs = if ($args.Count -gt 0) { $args } else { @('it','en') }
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($L in $langs) {
  $font = "fontfile='C\:/Windows/Fonts/segoeuib.ttf'"
  $ov1 = if ($L -eq 'en') { 'Red Square, Moscow' } else { 'Piazza Rossa, Mosca' }
  $ov2 = if ($L -eq 'en') { "Nine churches in one.`nWIP tells you, on its own." } else { "Nove chiese in una.`nTe lo dice WIP, da solo." }
  $cardT = if ($L -eq 'en') { "You walk.`nThe place speaks." } else { "Cammini.`nIl posto ti parla." }
  $cardS = if ($L -eq 'en') { 'WIP, the voice of places.' } else { 'WIP, la voce dei luoghi.' }
  [IO.File]::WriteAllText("$PWD\mo-ov1_$L.txt", $ov1, $utf8)
  [IO.File]::WriteAllText("$PWD\mo-ov2_$L.txt", $ov2, $utf8)
  [IO.File]::WriteAllText("$PWD\mo-c1_$L.txt", $cardT, $utf8)
  [IO.File]::WriteAllText("$PWD\mo-c2_$L.txt", $cardS, $utf8)
  $box = "fontcolor=white:fontsize=44:line_spacing=12:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2"
  if (Test-Path "veo-mosca-1_$L.mp4") {
    # Scena con il dialogo nella lingua giusta: audio Veo conservato.
    ffmpeg -y -loglevel error -i "veo-mosca-1_$L.mp4" -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=mo-ov1_$L.txt:${box}:y=h*0.08:enable='between(t,0.5,4)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -ac 2 "mo1_$L.mp4"
  } else {
    # RIPIEGO (regola 5): manca il parlato in questa lingua → scena IT muta, battuta in sovraimpressione.
    $line = if ($L -eq 'en') { "Nine churches in one?`nMy phone just told me, on its own." } else { "Nove chiese in una?`nMe l'ha detto il telefono, da solo." }
    [IO.File]::WriteAllText("$PWD\mo-line_$L.txt", $line, $utf8)
    ffmpeg -y -loglevel error -i veo-mosca-1_it.mp4 -f lavfi -t 8 -i anullsrc=r=44100:cl=stereo -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=mo-ov1_$L.txt:${box}:y=h*0.08:enable='between(t,0.5,4)',drawtext=${font}:textfile=mo-line_$L.txt:${box}:y=h*0.76:enable='between(t,1.5,7.8)'" -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -shortest "mo1_$L.mp4"
  }
  ffmpeg -y -loglevel error -i veo-mosca-2.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=mo-ov2_$L.txt:${box}:y=h*0.76:enable='gte(t,0.6)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -ac 2 "mo2_$L.mp4"
  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -f lavfi -t 3.5 -i anullsrc=r=44100:cl=stereo -vf "drawtext=${font}:textfile=mo-c1_$L.txt:fontcolor=white:fontsize=66:line_spacing=18:x=(w-text_w)/2:y=h*0.34,drawtext=${font}:textfile=mo-c2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.52,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -shortest "mo3_$L.mp4"

  $lista = (1..3 | ForEach-Object { "file 'mo${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista-mo_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista-mo_$L.txt" -c copy "cat-mo_$L.mp4"
  $dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 "cat-mo_$L.mp4")
  $fadeSt = [math]::Max(0, $dur - 2.5)
  ffmpeg -y -loglevel error -i "cat-mo_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.20,afade=t=out:st=${fadeSt}:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 44100 -b:a 128k "spot-mosca-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot-mosca-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1600k -maxrate 1900k -bufsize 3M -c:a aac -b:a 128k "spot-mosca-$($L.ToUpper())-up.mp4"
  "FATTO $L ($dur s)"
}
ffmpeg -y -loglevel error -ss 2 -i spot-mosca-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotmo-it.jpg
ffmpeg -y -loglevel error -ss 11 -i spot-mosca-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotmo-it-mid.jpg
Get-ChildItem spot-mosca-*.mp4 | Select-Object Name, Length
