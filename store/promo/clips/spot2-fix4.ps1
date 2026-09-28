$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
node scrivi-spot2.cjs
foreach ($L in @('it','en','fr','es','de','ru','zh')) {
  $font = if ($L -eq 'zh') { "fontfile='C\:/Windows/Fonts/msyhbd.ttc'" } else { "fontfile='C\:/Windows/Fonts/segoeuib.ttf'" }
  ffmpeg -y -loglevel error -ss 0.5 -t 5.5 -i ..\settimana1\tiktok-appdemo-EN.mp4 -vf "fps=30,drawtext=${font}:textfile=s2ov4_$L.txt:fontsize=38:line_spacing=12:fontcolor=white:box=1:boxcolor=0x1e3a8a@0.75:boxborderw=20:x=(w-text_w)/2:y=h*0.78" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "s2seg4_$L.mp4"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "s2lista_$L.txt" -c copy "s2concat_$L.mp4"
  ffmpeg -y -loglevel error -i "s2concat_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.22,afade=t=out:st=33.5:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=34:d=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 44100 -b:a 160k "spot2-mondo-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot2-mondo-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1500k -maxrate 1800k -bufsize 3M -c:a aac -b:a 128k "spot2-$($L.ToUpper())-up.mp4"
  ffmpeg -y -loglevel error -ss 30 -i "spot2-mondo-$($L.ToUpper()).mp4" -frames:v 1 -vf scale=300:-1 "chk-s2-$L-4.jpg"
  "FATTO $L"
}
Get-ChildItem spot2-*-up.mp4 | Select-Object Name, Length
