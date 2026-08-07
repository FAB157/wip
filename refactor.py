import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Trova la firma di /api/poi/enrich e aggiungi 'mode'
content = content.replace(
    'const { id, name, lat, lon, category, subCategory, wikidata: clientWikidata, wikipedia: clientWikipedia, lang = "it", fast = false } = req.body;',
    'const { id, name, lat, lon, category, subCategory, wikidata: clientWikidata, wikipedia: clientWikipedia, lang = "it", fast = false, mode = "long" } = req.body;'
)

# Sostituisci il prompt AI
vecchio_prompt = '''      // AI Synthesis (Deep Mode)
      if (!fast) {
        try {
          const curatorPrompt = \Sei un curatore turistico e storico d'eccellenza per World in Pocket. Ricevi Nome, Categoria ("\"), e Coordinate (Lat: \, Lon: \).
Basa la tua descrizione SOLO su fatti storici reali e accertati.
La lingua deve essere: \.

Restituisci un JSON valido con:
- 'description_short': Testo di 2 frasi riassuntive.
- 'description_long': Descrizione accademica, immersiva e STORICAMENTE SUPER DETTAGLIATA (minimo 1500 caratteri).
- 'audio_script': Il copione finale dell'audioguida emozionante.
- 'is_gem': (true/false) in base all'importanza.

INFORMAZIONI SUL LUOGO:
Nome: "\"
Coordinate: \, \
Wikipedia: "\"\;'''

nuovo_prompt = '''      // AI Synthesis (Deep Mode)
      if (!fast) {
        try {
          let curatorPrompt = "";
          if (mode === "short") {
              curatorPrompt = \Sei un assistente informativo locale di World in Pocket. Ricevi Nome, Categoria ("\") e Coordinate.
Basa la tua descrizione su fatti reali tratti da Wikipedia. La lingua deve essere: \.

Restituisci IMMEDIATAMENTE un JSON valido con questa struttura:
{
  "description_short": "Sintesi accattivante di 2 frasi riassuntive del luogo.",
  "is_gem": false
}

INFORMAZIONI SUL LUOGO:
Nome: "\"
Coordinate: \, \
Wikipedia: "\"\;
          } else {
              curatorPrompt = \Sei un curatore turistico e storico d'eccellenza per World in Pocket. Ricevi Nome, Categoria ("\"), e Coordinate (Lat: \, Lon: \).
Basa la tua descrizione SOLO su fatti storici reali e accertati.
La lingua deve essere: \.

Restituisci un JSON valido con:
- 'description_short': Testo di 2 frasi riassuntive.
- 'description_long': Descrizione accademica, immersiva e STORICAMENTE SUPER DETTAGLIATA (minimo 1500 caratteri).
- 'audio_script': Il copione finale dell'audioguida emozionante.
- 'is_gem': (true/false) in base all'importanza.

INFORMAZIONI SUL LUOGO:
Nome: "\"
Coordinate: \, \
Wikipedia: "\"\;
          }'''

content = content.replace(vecchio_prompt, nuovo_prompt)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Modificato server.ts")
