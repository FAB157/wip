$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\fumetti'
$J = Get-Content -Raw -Encoding UTF8 'C:\progetti\itainta\store\promo\clips\fumetti.json' | ConvertFrom-Json
$utf8 = New-Object System.Text.UTF8Encoding($false)
$L = 'it'
$t = @($J.storia6.$L)
$font = "fontfile='C\:/Windows/Fonts/segoeuib.ttf'"
for ($i = 0; $i -lt 4; $i++) { [IO.File]::WriteAllText("$PWD\s6b$($i+1)_$L.txt", [string]$t[$i], $utf8) }
$card = ([string]$t[4]).Split('|')
[IO.File]::WriteAllText("$PWD\s6c1_$L.txt", $card[0], $utf8)
[IO.File]::WriteAllText("$PWD\s6c2_$L.txt", $card[1], $utf8)
$bub = "fontcolor=black:fontsize=50:line_spacing=10:box=1:boxcolor=white@0.92:boxborderw=26:x=(w-text_w)/2"
$zp = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.12)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
for ($i = 1; $i -le 4; $i++) {
  ffmpeg -y -loglevel error -i "storia6-tavola$i.png" -vf "${zp},drawtext=${font}:textfile=s6b${i}_$L.txt:${bub}:y=h*0.08:enable='gte(t,0.5)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "j${i}_$L.mp4"
}
ffmpeg -y -loglevel error -f lavfi -t 4 -i color=c=0x1e3a8a:s=1080x1920:r=30 -vf "drawtext=${font}:textfile=s6c1_$L.txt:fontcolor=white:fontsize=66:line_spacing=18:x=(w-text_w)/2:y=h*0.36,drawtext=${font}:textfile=s6c2_$L.txt:fontcolor=0x93c5fd:fontsize=52:x=(w-text_w)/2:y=h*0.52,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "j5_$L.mp4"
$lista = (1..5 | ForEach-Object { "file 'j${_}_$L.mp4'" }) -join "`n"
[IO.File]::WriteAllText("$PWD\lista6_$L.txt", $lista + "`n", $utf8)
ffmpeg -y -loglevel error -f concat -safe 0 -i "lista6_$L.txt" -c copy "cat6_$L.mp4"
ffmpeg -y -loglevel error -i "cat6_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.35,afade=t=out:st=17.5:d=2.5[a]" -map 0:v -map "[a]" -shortest -c:v copy -c:a aac -ar 44100 -b:a 128k "fumetto6-IT.mp4"
ffmpeg -y -loglevel error -i "fumetto6-IT.mp4" -c:v libx264 -preset medium -b:v 1500k -maxrate 1800k -bufsize 3M -c:a aac -b:a 96k "fumetto6-IT-up.mp4"
"FATTO IT"
ffmpeg -y -loglevel error -ss 2 -i fumetto6-IT.mp4 -frames:v 1 -vf scale=300:-1 chk6-it.jpg
ffmpeg -y -loglevel error -ss 10 -i fumetto6-IT.mp4 -frames:v 1 -vf scale=300:-1 chk6-it-mid.jpg
ffmpeg -y -loglevel error -ss 14 -i fumetto6-IT.mp4 -frames:v 1 -vf scale=300:-1 chk6-it-4.jpg
Get-ChildItem fumetto6-*.mp4 | Select-Object Name, Length
