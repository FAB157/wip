$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
node scrivi-spot2.cjs
$utf8 = New-Object System.Text.UTF8Encoding($false)
$langs = if ($args.Count -gt 0) { $args } else { @('it','en','fr','es','de','ru','zh') }
foreach ($L in $langs) {
  $font = if ($L -eq 'zh') { "fontfile='C\:/Windows/Fonts/msyhbd.ttc'" } else { "fontfile='C\:/Windows/Fonts/segoeuib.ttf'" }
  $box = "fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=h*0.74:line_spacing=12"
  ffmpeg -y -loglevel error -t 9 -i veo-bangkok-mercato.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=s2ov1_$L.txt:fontsize=52:${box}:enable='between(t,0.8,8.8)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "s2seg1_$L.mp4"
  ffmpeg -y -loglevel error -t 9 -i veo-cinqueterre-tramonto.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=s2ov2_$L.txt:fontsize=52:${box}:enable='between(t,0.8,8.8)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "s2seg2_$L.mp4"
  ffmpeg -y -loglevel error -t 9 -i veo-londra-pioggia.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=s2ov3_$L.txt:fontsize=52:${box}:enable='between(t,0.8,8.8)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "s2seg3_$L.mp4"
  ffmpeg -y -loglevel error -ss 0.5 -t 5.5 -i ..\settimana1\tiktok-appdemo-EN.mp4 -vf "fps=30,drawtext=${font}:textfile=s2ov4_$L.txt:fontsize=44:line_spacing=12:fontcolor=white:box=1:boxcolor=0x1e3a8a@0.75:boxborderw=20:x=(w-text_w)/2:y=h*0.80" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "s2seg4_$L.mp4"
  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -f lavfi -t 3.5 -i anullsrc=r=44100:cl=stereo -vf "drawtext=${font}:textfile=s2ec1_$L.txt:fontcolor=white:fontsize=72:line_spacing=18:x=(w-text_w)/2:y=h*0.36,drawtext=${font}:textfile=s2ec2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.50,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h*0.58,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 -shortest "s2seg5_$L.mp4"
  $lista = (1..5 | ForEach-Object { "file 's2seg${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\s2lista_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "s2lista_$L.txt" -c copy "s2concat_$L.mp4"
  ffmpeg -y -loglevel error -i "s2concat_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.22,afade=t=out:st=33.5:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=34:d=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 44100 -b:a 160k "spot2-mondo-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot2-mondo-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1500k -maxrate 1800k -bufsize 3M -c:a aac -b:a 128k "spot2-$($L.ToUpper())-up.mp4"
  "FATTO $L"
}
ffmpeg -y -loglevel error -ss 4 -i spot2-mondo-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-s2-it.jpg
Get-ChildItem spot2-*.mp4 | Select-Object Name, Length
