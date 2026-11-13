$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
$langs = if ($args.Count -gt 0) { $args } else { @('it','en') }
foreach ($L in $langs) {
  $font = "fontfile='C\:/Windows/Fonts/segoeuib.ttf'"
  $cardT = if ($L -eq 'en') { 'Every place has a story.' } else { 'Ogni luogo ha una storia.' }
  $cardS = if ($L -eq 'en') { 'WIP tells it to you.' } else { 'WIP te la racconta.' }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText("$PWD\ndc1_$L.txt", $cardT, $utf8)
  [IO.File]::WriteAllText("$PWD\ndc2_$L.txt", $cardS, $utf8)

  ffmpeg -y -loglevel error -i veo-notredame-1.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "nd1_$L.mp4"
  ffmpeg -y -loglevel error -i veo-notredame-2.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "nd2_$L.mp4"
  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -vf "drawtext=${font}:textfile=ndc1_$L.txt:fontcolor=white:fontsize=64:line_spacing=18:x=(w-text_w)/2:y=h*0.38,drawtext=${font}:textfile=ndc2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.50,drawtext=${font}:text='wip.guide':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=h*0.60,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "nd3_$L.mp4"

  $lista = (1..3 | ForEach-Object { "file 'nd${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista-nd_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista-nd_$L.txt" -c copy "cat-nd_$L.mp4"
  ffmpeg -y -loglevel error -i "cat-nd_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.28,afade=t=out:st=21:d=2.5[a]" -map 0:v -map "[a]" -shortest -c:v copy -c:a aac -ar 44100 -b:a 128k "spot-notredame-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot-notredame-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1600k -maxrate 1900k -bufsize 3M -c:a aac -b:a 128k "spot-notredame-$($L.ToUpper())-up.mp4"
  "FATTO $L"
}
ffmpeg -y -loglevel error -ss 2 -i spot-notredame-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotnd-it.jpg
ffmpeg -y -loglevel error -ss 13 -i spot-notredame-IT.mp4 -frames:v 1 -vf scale=300:-1 chk-spotnd-it-mid.jpg
Get-ChildItem spot-notredame-*.mp4 | Select-Object Name, Length
