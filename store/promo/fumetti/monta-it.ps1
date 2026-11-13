$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\fumetti'
$J = Get-Content -Raw -Encoding UTF8 'C:\progetti\itainta\store\promo\clips\fumetti.json' | ConvertFrom-Json
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($L in @('it')) {
  $t = @($J.storia1.$L)
  $font = if ($L -eq 'zh') { "fontfile='C\:/Windows/Fonts/msyhbd.ttc'" } else { "fontfile='C\:/Windows/Fonts/segoeuib.ttf'" }
  # fumetti: tavola1=t0, tavola2=t1, tavola3=t2, tavola4=t3 + t4 (risposta), card=t5 (titolo|cta)
  [IO.File]::WriteAllText("$PWD\b1_$L.txt", $t[0], $utf8)
  [IO.File]::WriteAllText("$PWD\b2_$L.txt", $t[1], $utf8)
  [IO.File]::WriteAllText("$PWD\b3_$L.txt", $t[2], $utf8)
  [IO.File]::WriteAllText("$PWD\b4_$L.txt", $t[3], $utf8)
  [IO.File]::WriteAllText("$PWD\b5_$L.txt", $t[4], $utf8)
  $card = $t[5].Split('|')
  [IO.File]::WriteAllText("$PWD\c1_$L.txt", $card[0], $utf8)
  [IO.File]::WriteAllText("$PWD\c2_$L.txt", $card[1], $utf8)
  $bub = "fontcolor=black:fontsize=54:line_spacing=10:box=1:boxcolor=white@0.92:boxborderw=26:x=(w-text_w)/2"
  # zoompan lento su ogni tavola (4 s, 30 fps), 1080x1920
  $zp = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.12)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
  ffmpeg -y -loglevel error -i storia1-tavola1.png -vf "${zp},drawtext=${font}:textfile=b1_$L.txt:${bub}:y=h*0.08:enable='gte(t,0.5)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "f1_$L.mp4"
  ffmpeg -y -loglevel error -i storia1-tavola2.png -vf "${zp},drawtext=${font}:textfile=b2_$L.txt:${bub}:y=h*0.08:enable='gte(t,0.5)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "f2_$L.mp4"
  ffmpeg -y -loglevel error -i storia1-tavola3.png -vf "${zp},drawtext=${font}:textfile=b3_$L.txt:${bub}:y=h*0.08:enable='gte(t,0.5)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "f3_$L.mp4"
  ffmpeg -y -loglevel error -i storia1-tavola4.png -vf "${zp},drawtext=${font}:textfile=b4_$L.txt:${bub}:y=h*0.08:enable='between(t,0.5,2.6)',drawtext=${font}:textfile=b5_$L.txt:${bub}:y=h*0.08:enable='gte(t,2.7)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "f4_$L.mp4"
  ffmpeg -y -loglevel error -f lavfi -t 4 -i color=c=0x1e3a8a:s=1080x1920:r=30 -vf "drawtext=${font}:textfile=c1_$L.txt:fontcolor=white:fontsize=72:line_spacing=18:x=(w-text_w)/2:y=h*0.38,drawtext=${font}:textfile=c2_$L.txt:fontcolor=0x93c5fd:fontsize=52:x=(w-text_w)/2:y=h*0.52,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "f5_$L.mp4"
  $lista = (1..5 | ForEach-Object { "file 'f${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista_$L.txt" -c copy "cat_$L.mp4"
  ffmpeg -y -loglevel error -i "cat_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.35,afade=t=out:st=18.5:d=2.5[a]" -map 0:v -map "[a]" -shortest -c:v copy -c:a aac -ar 44100 -b:a 128k "fumetto1-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "fumetto1-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1500k -maxrate 1800k -bufsize 3M -c:a aac -b:a 96k "fumetto1-$($L.ToUpper())-up.mp4"
  "FATTO $L"
}
ffmpeg -y -loglevel error -ss 6 -i fumetto1-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-it.jpg
Get-ChildItem fumetto1-*.mp4 | Select-Object Name, Length
