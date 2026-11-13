# Spot «Amsterdam — traduzione automatica in 7 lingue» (18/09). Feature:
# traduzione automatica dell'audioguida (regola 29: tre clip Veo reali della
# STESSA scena, nessun fermo immagine).
# Richiede veo-amsterdam-{1,2,3}-{it,en}.mp4 (tutte clip reali, verificate
# via Whisper — regola 30, mai lingua mista).
$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
$langs = if ($args.Count -gt 0) { $args } else { @('it','en') }
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($L in $langs) {
  $font = "fontfile='C\:/Windows/Fonts/segoeuib.ttf'"
  $ov1 = if ($L -eq 'en') { 'Amsterdam canals' } else { 'Canali di Amsterdam' }
  $ov2 = if ($L -eq 'en') { "Same guide, seven languages.`nIt switches by itself." } else { "Stessa guida, sette lingue.`nCambia da sola." }
  $cardT = if ($L -eq 'en') { "You walk.`nThe place speaks." } else { "Cammini.`nIl posto ti parla." }
  $cardS = if ($L -eq 'en') { 'WIP, the voice of places.' } else { 'WIP, la voce dei luoghi.' }
  [IO.File]::WriteAllText("$PWD\am-ov1_$L.txt", $ov1, $utf8)
  [IO.File]::WriteAllText("$PWD\am-ov2_$L.txt", $ov2, $utf8)
  [IO.File]::WriteAllText("$PWD\am-c1_$L.txt", $cardT, $utf8)
  [IO.File]::WriteAllText("$PWD\am-c2_$L.txt", $cardS, $utf8)
  $box = "fontcolor=white:fontsize=44:line_spacing=12:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2"
  $src = "veo-amsterdam-1-$L.mp4"
  $src2 = "veo-amsterdam-2-$L.mp4"
  $src3 = "veo-amsterdam-3-$L.mp4"

  # Scena 1: la clip Veo con il dialogo vero, audio conservato.
  ffmpeg -y -loglevel error -i $src -vf "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:6[bg];[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,drawtext=${font}:textfile=am-ov1_$L.txt:${box}:y=h*0.08:enable='between(t,0.5,4)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -ac 2 "am1_$L.mp4"

  # Scena 2 (REGOLA 29): seconda clip Veo reale che continua la STESSA
  # scena — nessun fermo immagine, movimento e dialogo continui, audio vero.
  ffmpeg -y -loglevel error -i $src2 -vf "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:6[bg];[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,drawtext=${font}:textfile=am-ov2_$L.txt:${box}:y=h*0.76:enable='gte(t,0.6)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -ac 2 "am2_$L.mp4"

  # Scena 2b (REGOLA 29): terza clip Veo reale, chiude la scena e la
  # CTA parlata — ancora nessun fermo immagine, ancora audio vero.
  ffmpeg -y -loglevel error -i $src3 -vf "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:6[bg];[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -ac 2 "am2b_$L.mp4"

  # Card finale blu standard.
  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -f lavfi -t 3.5 -i anullsrc=r=44100:cl=stereo -vf "drawtext=${font}:textfile=am-c1_$L.txt:fontcolor=white:fontsize=66:line_spacing=18:x=(w-text_w)/2:y=h*0.34,drawtext=${font}:textfile=am-c2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.52,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -b:a 128k -shortest "am3_$L.mp4"

  $lista = (@('am1','am2','am2b','am3') | ForEach-Object { "file '${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista-am_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista-am_$L.txt" -c copy "cat-am_$L.mp4"
  $dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 "cat-am_$L.mp4")
  $fadeSt = [math]::Max(0, $dur - 2.5)
  ffmpeg -y -loglevel error -i "cat-am_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.20,afade=t=out:st=${fadeSt}:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 44100 -b:a 128k "spot-amsterdam-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot-amsterdam-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1600k -maxrate 1900k -bufsize 3M -c:a aac -b:a 128k "spot-amsterdam-$($L.ToUpper())-up.mp4"
  "FATTO $L ($dur s)"
}
Get-ChildItem spot-amsterdam-*.mp4 | Select-Object Name, Length
