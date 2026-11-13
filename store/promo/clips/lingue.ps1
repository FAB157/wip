$ErrorActionPreference = 'Continue'
Set-Location 'C:\progetti\itainta\store\promo\clips'
$T = @{
  fr = @('Perdu sur une place de Rome ?', 'WIP crée ton parcours. Gratuit.', "« Neuf millions de lieux.`nEt c'est WIP qui me les raconte. »", "L'audioguide démarre tout seul.`nMême écran éteint.", '9 000 000 de lieux - 196 pays', "Communauté WIP - trésors cachés`nlieux de tournage - 7 langues", "Chaque lieu te raconte`nson histoire.", 'Essaie gratuitement')
  es = @('¿Perdido en una plaza de Roma?', 'WIP crea tu ruta. Gratis.', "«Nueve millones de lugares.`nY me los cuenta WIP.»", "La audioguía arranca sola.`nIncluso con la pantalla apagada.", '9.000.000 de lugares - 196 países', "Comunidad WIP - joyas ocultas`nlocalizaciones de cine - 7 idiomas", "Cada lugar te cuenta`nsu historia.", 'Pruébala gratis')
  de = @('Verloren auf einem Platz in Rom?', 'WIP erstellt deine Route. Gratis.', "«Neun Millionen Orte.`nUnd WIP erzählt sie mir.»", "Der Audioguide startet von selbst.`nAuch bei ausgeschaltetem Display.", '9.000.000 Orte - 196 Länder', "WIP-Community - versteckte Schätze`nDrehorte - 7 Sprachen", "Jeder Ort erzählt dir`nseine Geschichte.", 'Gratis testen')
  ru = @('Потерялись на площади в Риме?', 'WIP построит маршрут. Бесплатно.', "«Девять миллионов мест.`nИ о них мне рассказывает WIP.»", "Аудиогид включается сам.`nДаже при выключенном экране.", '9 000 000 мест - 196 стран', "Сообщество WIP - скрытые жемчужины`nместа съёмок - 7 языков", "Каждое место расскажет`nсвою историю.", 'Попробуйте бесплатно')
  zh = @('在罗马的广场迷路了？', 'WIP 为你规划路线。免费。', "「九百万个地方，`n都由 WIP 讲给我听。」", "语音导览自动开启，`n息屏也能播放。", '9,000,000 个地点 · 196 个国家', "WIP 社区 · 隐藏宝藏`n电影取景地 · 7 种语言", "每个地方，`n都在讲述它的故事。", '免费试用')
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$J = Get-Content -Raw -Encoding UTF8 'C:\progetti\itainta\store\promo\clips\lingue.json' | ConvertFrom-Json
foreach ($L in @('ru','zh')) {
  $T[$L] = @($J.$L)
  $font = if ($L -eq 'zh') { "fontfile='C\:/Windows/Fonts/msyhbd.ttc'" } else { "fontfile='C\:/Windows/Fonts/segoeuib.ttf'" }
  $t = $T[$L]
  $names = @('ov1','ov2','ov3','ov4','ov5','ov6','ec1','ec2')
  if ($t.Count -eq 8) { for ($i = 0; $i -lt 8; $i++) { $p = Join-Path 'C:\progetti\itainta\store\promo\clips' ($names[$i] + '_' + $L + '.txt'); [IO.File]::WriteAllText($p, [string]$t[$i], $utf8); "scritto $p $((Get-Item $p).Length)" } }
  $box = "fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=h*0.74"
  ffmpeg -y -loglevel error -t 6.5 -i veo-roma-turista.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=ov1_$L.txt:fontsize=56:${box}:enable='between(t,0.8,6.4)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "seg1_$L.mp4"
  ffmpeg -y -loglevel error -ss 0.5 -t 5.5 -i ..\settimana1\tiktok-appdemo-EN.mp4 -vf "fps=30,drawtext=${font}:textfile=ov2_$L.txt:fontsize=54:fontcolor=white:box=1:boxcolor=0x1e3a8a@0.75:boxborderw=20:x=(w-text_w)/2:y=h*0.80" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "seg2_$L.mp4"
  ffmpeg -y -loglevel error -i kling-ny-battuta.mp4 -f lavfi -t 5 -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -vf "fps=30,drawtext=${font}:textfile=ov3_$L.txt:fontsize=46:line_spacing=10:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=18:x=(w-text_w)/2:y=h*0.78:enable='between(t,0.6,4.9)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 -shortest "seg3_$L.mp4"
  ffmpeg -y -loglevel error -t 5.5 -i veo-caffe-dialogo.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=ov4_$L.txt:fontsize=52:line_spacing=12:${box}:enable='between(t,0.6,5.4)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "seg4_$L.mp4"
  ffmpeg -y -loglevel error -t 5 -i veo-parigi-golden.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=ov5_$L.txt:fontsize=54:${box}:enable='between(t,0.6,4.9)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "seg5_$L.mp4"
  ffmpeg -y -loglevel error -t 5 -i veo-tokyo-neon.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,drawtext=${font}:textfile=ov6_$L.txt:fontsize=50:line_spacing=12:${box}:enable='between(t,0.6,4.9)'" -c:v libx264 -preset veryfast -crf 20 -c:a aac -ar 44100 -ac 2 "seg6_$L.mp4"
  ffmpeg -y -loglevel error -f lavfi -t 3.5 -i color=c=0x1e3a8a:s=1080x1920:r=30 -f lavfi -t 3.5 -i anullsrc=r=44100:cl=stereo -vf "drawtext=${font}:textfile=ec1_$L.txt:fontcolor=white:fontsize=72:line_spacing=18:x=(w-text_w)/2:y=h*0.36,drawtext=${font}:textfile=ec2_$L.txt:fontcolor=0x93c5fd:fontsize=50:x=(w-text_w)/2:y=h*0.50,drawtext=${font}:textfile=ec3.txt:fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h*0.58,fade=t=in:st=0:d=0.4" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 -shortest "seg7_$L.mp4"
  $lista = (1..7 | ForEach-Object { "file 'seg${_}_$L.mp4'" }) -join "`n"
  [IO.File]::WriteAllText("$PWD\lista_$L.txt", $lista + "`n", $utf8)
  ffmpeg -y -loglevel error -f concat -safe 0 -i "lista_$L.txt" -c copy "concat_$L.mp4"
  ffmpeg -y -loglevel error -i "concat_$L.mp4" -i ..\musica-travel-lofi.mp3 -filter_complex "[1:a]volume=0.22,afade=t=out:st=33.5:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=34:d=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 44100 -b:a 160k "spot1-lancio-$($L.ToUpper()).mp4"
  ffmpeg -y -loglevel error -i "spot1-lancio-$($L.ToUpper()).mp4" -c:v libx264 -preset medium -b:v 1600k -maxrate 1900k -bufsize 3M -c:a aac -b:a 128k "spot1-$($L.ToUpper())-up.mp4"
  ffmpeg -y -loglevel error -ss 14 -i "spot1-lancio-$($L.ToUpper()).mp4" -frames:v 1 -vf scale=300:-1 "chk-$L.jpg"
  "FATTO $L"
}
Get-ChildItem spot1-lancio-*.mp4 | Select-Object Name, Length
