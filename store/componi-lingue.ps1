# Compone i 5 screenshot dello Store in tutte le lingue a partire dalle catture
# (cartella $Catture: 01-mappa.png, 02-scheda.png, 03-itinerario.png, 04-eventi.png, 05-guida.png).
# Output: store\lingue\<lingua>\0N-*.png
param(
  [Parameter(Mandatory=$true)][string]$Catture,
  [string[]]$Lingue = @('en-US','fr-FR','es-ES','de-DE','ru-RU','zh-CN'),
  [int]$W = 1080,          # Google Play 1080x1920 · iPhone 6,9" 1320x2868
  [int]$H = 1920,
  [string]$OutRoot = "C:\progetti\itainta\store\lingue"
)
$T = @{
  'it-IT' = @(
    @('Cammini, e la guida parla','Milioni di luoghi in 196 paesi, sulla mappa'),
    @('Storie vere di ogni luogo','Guida, naviga, ascolta'),
    @('Itinerari perfetti','Un piano con luoghi veri, orari e pause pranzo'),
    @('Eventi, mostre, biglietti','Prenotazione diretta, vicino a te o in viaggio'),
    @('La guida che parte da sola','A mani libere, anche a schermo spento'))
  'en-US' = @(
    @('Walk, and the guide speaks','Millions of places in 196 countries, on the map'),
    @('Real stories about every place','Guide, navigate, listen'),
    @('Perfect itineraries','A day plan with real places, times and lunch stops'),
    @('Events, exhibitions, tickets','Direct booking links, near you or where you travel'),
    @('The guide that starts by itself','Hands-free, even with the screen off'))
  'fr-FR' = @(
    @('Vous marchez, le guide parle','Des millions de lieux dans 196 pays, sur la carte'),
    @('De vraies histoires pour chaque lieu','Guide, navigation, écoute'),
    @('Des itinéraires parfaits','Un programme avec lieux réels, horaires et pauses'),
    @('Événements, expositions, billets','Réservation directe, près de vous ou en voyage'),
    @('Le guide qui démarre tout seul','Mains libres, même écran éteint'))
  'es-ES' = @(
    @('Caminas, y la guía habla','Millones de lugares en 196 países, en el mapa'),
    @('Historias reales de cada lugar','Guía, navega, escucha'),
    @('Itinerarios perfectos','Un plan con lugares reales, horarios y paradas'),
    @('Eventos, exposiciones, entradas','Reserva directa, cerca de ti o donde viajes'),
    @('La guía que arranca sola','Manos libres, incluso con la pantalla apagada'))
  'de-DE' = @(
    @('Sie gehen, der Guide spricht','Millionen Orte in 196 Ländern, auf der Karte'),
    @('Echte Geschichten zu jedem Ort','Guide, Navigation, Audio'),
    @('Perfekte Routen','Ein Tagesplan mit echten Orten, Zeiten und Pausen'),
    @('Veranstaltungen, Ausstellungen, Tickets','Direkt buchen, in der Nähe oder auf Reisen'),
    @('Der Guide, der von selbst startet','Freihändig, auch bei ausgeschaltetem Display'))
  'ru-RU' = @(
    @('Вы идёте — гид рассказывает','Миллионы мест в 196 странах на карте'),
    @('Настоящие истории о каждом месте','Гид, навигация, аудио'),
    @('Идеальные маршруты','План дня с реальными местами, временем и обедом'),
    @('События, выставки, билеты','Прямое бронирование рядом с вами или в поездке'),
    @('Гид, который запускается сам','Без рук, даже при выключенном экране'))
  'zh-CN' = @(
    @('你走着，导览就开口','196 个国家的数百万地点，尽在地图'),
    @('每个地点的真实故事','导览、导航、聆听'),
    @('完美行程','包含真实地点、时间和用餐的一日计划'),
    @('活动、展览、门票','直接预订，就在你身边或旅途中'),
    @('自动开始的导览','免操作，熄屏也能工作'))
}
# catture disponibili (senza mappa): indice didascalia, file sorgente, file uscita, px da tagliare in alto
$piano = @(
  @(1, '02-scheda.png',     '01-scheda.png',     0),
  @(2, '03-itinerario.png', '02-itinerario.png', 0),
  @(3, '04-eventi.png',     '03-eventi.png',     0),
  @(4, '05-guida.png',      '04-guida.png',      175)
)
foreach ($L in $Lingue) {
  $outDir = Join-Path $OutRoot $L
  New-Item -ItemType Directory -Force $outDir | Out-Null
  foreach ($p in $piano) {
    $in = Join-Path $Catture $p[1]
    if (-not (Test-Path $in)) { Write-Output "MANCA $in"; continue }
    & C:\progetti\itainta\store\componi7.ps1 -In $in -Out (Join-Path $outDir $p[2]) -Titolo $T[$L][$p[0]][0] -Sottotitolo $T[$L][$p[0]][1] -TagliaSopra $p[3] -W $W -H $H
  }
}
