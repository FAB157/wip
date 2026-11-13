$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
$langs = if ($args.Count -gt 0) { $args } else { @('it','en') }
foreach ($L in $langs) {
  $font = "fontfile='C\:/Windows/Fonts/segoeuib.ttf'"
  $box = "fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=h*0.76"
  $trig = if ($L -eq 'en') { '..\settimana1\tiktok-trigger-EN.mp4' } else { '..\settimana1\tiktok-trigger.mp4' }
  $cardT = if ($L -eq 'en') { 'Every place has a secret.' } else { 'Ogni luogo ha un segreto.' }
  $cardS = if ($L -eq 'en') { 'WIP tells you.' } else { 'WIP te lo racconta.' }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText("$PWD\pisac1_$L.txt", $cardT, $utf8)
  [IO.File]::WriteAllText("$PWD\pisac2_$L.txt", $cardS, $utf8)

  ffmpeg -y -loglevel error -i veo-pisa-battistero.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=ov-pisa1_${L}.txt:fontsize=54:${box}:enable='between(t,0.5,4.5)',drawtext=${font}:textfile=ov-pisa2_${L}.txt:fontsize=50:line_spacing=10:${box}:enable='between(t,5.2,9.5)'" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "pisa1_$L.mp4"

  ffmpeg -y -loglevel error -ss 17 -t 6 -i $trig -vf "scale=1080:1920,fps=30" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "pisa2_$L.mp4"

  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -vf "drawtext=${font}:textfile=pisac1_$L.txt:fontcolor=white:fontsize=64:line_spacing=18:x=(w-text_w)/2:y=h*0.38,drawtext=${font}:textfile=pisac2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.50,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "pisa3_$L.mp4"

  $lista = (1..3 | ForEach-Object { "file 'pisa${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista-pisa_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista-pisa_$L.txt" -c copy "cat-pisa_$L.mp4"
  ffmpeg -y -loglevel error -i "cat-pisa_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.28,afade=t=out:st=16:d=2.5[a]" -map 0:v -map "[a]" -shortest -c:v copy -c:a aac -ar 44100 -b:a 128k "spot-pisa-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot-pisa-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1600k -maxrate 1900k -bufsize 3M -c:a aac -b:a 128k "spot-pisa-$($L.ToUpper())-up.mp4"
  "FATTO $L"
}
ffmpeg -y -loglevel error -ss 2 -i spot-pisa-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotpisa-it.jpg
ffmpeg -y -loglevel error -ss 13 -i spot-pisa-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotpisa-it-mid.jpg
Get-ChildItem spot-pisa-*.mp4 | Select-Object Name, Length
