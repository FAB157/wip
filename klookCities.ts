/**
 * Città di Klook (id → nome inglese), lette dal pannello affiliati il 07/09/2026.
 *
 * Servono a due cose:
 *  1. il link affiliato profondo alla pagina della città
 *     (`https://www.klook.com/<locale>/city/<id>-<slug>/?aid=<KLOOK_AID>`);
 *  2. sapere se la città ha un widget salvato nell'account (KLOOK_ADS): solo
 *     in quel caso l'API pubblica del widget restituisce le attività vere.
 *
 * Klook non ha un'API per gli affiliati e blocca le letture dal server (403):
 * le attività arrivano SOLO dal widget, che è legato a un annuncio (ad) per
 * città creato nel pannello. Per aggiungere una città: pannello → My Ads →
 * Other tools → Dynamic Widgets → città, tutte le categorie, 6 elementi →
 * l'ad_id nell'URL va in KLOOK_ADS qui sotto.
 *
 * Il file è un modulo TS (non JSON) di proposito: l'import di un JSON senza
 * `with { type: "json" }` ha già messo giù l'API una volta (22/08/2026).
 */

/** Identificativo affiliato dell'account WIP su Klook. */
export const KLOOK_AID = 124310;

/** Widget salvati nel pannello: città Klook → ad_id. -1 = «tutte le destinazioni». */
export const KLOOK_ADS: Record<number, number> = {
  57: 1419353,   // Beijing
  28: 1419374,   // Tokyo
  29: 1419376,   // Osaka
  [-1]: 1419362, // All destinations (sceglie in base al paese del visitatore)
};

const RIGHE = `2|Hong Kong
3|Macau
19|Taipei
42|Yilan
20|Hualien
47|Taitung
25|Taichung
22|Kaohsiung
43|Penghu
164|Tainan
165|Kinmen
436|Chiayi
4737|Taoyuan
6488|New Taipei
10048|Keelung
17312|Hsinchu
24415|Changhua
28|Tokyo
29|Osaka
30|Kyoto
32|Hokkaido
36|Kyushu
71|Nagoya
135|Kobe
445|Kanazawa
4351|Kumamoto Prefecture
4819|Hyogo
5122|Hiroshima Prefecture
5209|Fukuoka Prefecture
6069|Aichi
6139|Chiba Prefecture
6409|Shizuoka Prefecture
6484|Okinawa Prefecture
6806|Kanagawa
6850|Miyagi Prefecture
7057|Nagasaki Prefecture
7062|Nara Prefecture
7259|Saitama Prefecture
8601|Beppu
9316|Takayama
9324|Otsu
9962|Kawagoe
11455|Tottori
11753|Akita
12832|Atami
13088|Okayama
13285|Kurashiki
13641|Naha
14045|Saga
14493|Aomori
15969|Takamatsu
16319|Fuji
17384|Sendai
17406|Fukui
18085|Fukushima
18170|Narita
20814|Saitama
21043|Kagoshima
21926|Toyama
22069|Chiba
22144|Niigata
22203|Ise
22379|Kitakyushu
23622|Kamakura
24445|Himeji
25166|Ishigaki
25492|Wakayama
26277|Nagano
26383|Kawasaki
26793|Morioka
26895|Yokohama
27109|Matsumoto
28941|Miyazaki
29364|Nikko
31594|Oita
37472|Asahikawa
72235|Noboribetsu
85051|Furano
119753|Hakodate
133938|Sapporo
135922|Otaru
13|Seoul
46|Busan
156|Gangwon
157|Gyeonggi
158|Incheon
545|Daegu
6268|Daejeon
6955|Ulsan
7204|Gwangju
8928|Gyeongju
11054|Sokcho
20544|Jeju
25723|Seogwipo
57|Beijing
59|Shanghai
60|Xi'an
61|Chengdu
62|Guilin
161|Zhangjiajie
174|Nanjing
179|Yunnan
182|Harbin
184|Xiamen
187|Chongqing
256|Guizhou
257|Inner Mongolia
285|Tibet
5616|Tianjin
6977|Xinjiang
7732|Leshan
8651|Kunming
8902|Foshan
9422|Kashgar
9460|Dalian
9580|Xining
11058|Guiyang
11303|Datong
12146|Guangzhou
12291|Lijiang
12436|Zhengzhou
13659|Dali
14950|Qingdao
15073|Ningbo
16549|Suzhou
16641|Wuxi
18656|Huangshan
19190|Hangzhou
19725|Lanzhou
19789|Zhuhai
20000|Dongguan
20537|Hefei
22348|Changsha
22690|Luoyang
22772|Sanya
23301|Shenzhen
24369|Wuhan
26399|Shenyang
27529|Jingdezhen
28039|Lhasa
28168|Changchun
28231|Urumqi
28293|Quanzhou
29059|Nanning
29710|Fuzhou
30380|Jinan
6|Singapore
4|Bangkok
17|Pattaya
5|Chiang Mai Province
7|Phuket
63|Krabi Province
125|Hua Hin
216|Chiang Rai Province
254|Kanchanaburi Province
255|Sukhothai Province
530|Phra Nakhon Si Ayutthaya Province
5445|Surat Thani Province
365167|Hat Yai
701124|Chonburi
701356|Ayutthaya
702317|Ko Pha-ngan District
702414|Ko Samui
702599|Ko Chang
702660|Ko Yao
702661|Pai
703019|Rayong
703025|Phang Nga
49|Kuala Lumpur
65|Penang
66|Sabah
67|Sarawak
190|Langkawi
191|Johor Bahru
266|Ipoh
276|Malacca
396|Terengganu
488|Cameron Highlands
5066|Selangor
7086|Putrajaya
16814|Kuching
364959|Kota Kinabalu
365089|Kuantan
365161|George Town
8|Bali
45|Jakarta
98|Batam
113|Bintan
163|Yogyakarta
209|Bandung
337|Surabaya
338|Medan
520|Banyuwangi
521|Malang
522|Labuan Bajo
7755|Denpasar
10199|Semarang
16613|Kuta
701087|Mataram
701248|Canggu
703018|Ubud
96|Manila
97|Cebu City
121|Palawan
144|Bohol
148|Dumaguete
331|Davao
480|Bacolod
481|Iloilo City
10908|Makati
14489|Quezon City
26286|Pasay
26802|Taguig
88695|Puerto Princesa
111159|Tagaytay
112652|Coron
134143|Malay
365356|El Nido
365498|Baguio
702385|Lapu-Lapu
33|Ho Chi Minh
34|Hanoi
35|Hue
75|Hoi An
74|Da Nang
130|Phu Quoc
207|Da Lat
208|Nha Trang
290|Sapa
402|Quy Nhon
486|Ha Long
549|Vung Tau
555|Can Tho-Mekong Delta
556|Phan Thiet
30135|Ninh Binh
702596|Haiphong
10|Siem Reap
44|Phnom Penh
279|Sihanoukville
120|Luang Prabang
180|Vientiane Prefecture
181|Vangvieng
9|Kathmandu
12|Pokhara
64|Thimphu
6935|Paro
132|Mumbai
145|New Delhi
149|Jaipur
150|Udaipur
151|Cochin
178|Goa
195|Bangalore
210|Pune
211|Varanasi
214|Agra
252|Hyderabad
264|Jodhpur
271|Kolkata
274|Chennai
275|Jaisalmer
301|Amritsar
303|Ahmedabad
420|Ladakh
12871|Chandigarh
15743|Gurugram
17862|Lucknow
22132|Shimla
24899|Srinagar
54891|Rishikesh
364949|Leh
78|Dubai
131|Abu Dhabi
426|Sharjah
442|Ras Al Khaimah
703500|Al Ain
162|Doha
159|Muscat
701670|Salalah
186|Istanbul
269|Antalya Province
270|Central Anatolia Region
15289|Nevşehir Province
29490|Bursa
32303|Alanya
56530|Kemer
61798|Fethiye
84936|Kuşadası
116609|Bodrum
124157|Marmaris
701631|Izmir
192|Jerusalem
194|Tel Aviv
524|Eilat
202|Colombo
203|Kandy
204|Galle
342|Baku
438|Dhaka
527|Malé
502|Amman Governorate
503|Petra
507|Aqaba Governorate
68|Sydney
69|Melbourne
73|Cairns
70|Brisbane
88|Perth
72|Gold Coast
79|Tasmania
94|Northern Territory
89|Adelaide
95|Darwin
155|Broome
171|Sunshine Coast
435|Canberra
517|Byron Bay
16897|Hobart
20214|Alice Springs
24650|Blue Mountains
365203|Whitsundays
365307|Margaret River
702765|Noosa
702768|Yulara
702822|Fremantle
702940|Townsville
82|Christchurch
83|Queenstown
80|Auckland
81|Rotorua District
85|Wellington
87|Nelson
206|Dunedin
390|Taupo
397|Wanaka
434|Tauranga
526|Kaikoura
702420|Te Anau
702609|Bay of Islands
189|Fiji
702064|Nadi
272|Cape Town
706538|Port Elizabeth
14|Mauritius
289|Marrakech
10179|Chefchaouen Province
18433|Prefecture of Casablanca
21113|Essaouira Province
328|Arusha
5033|Zanzibar
30841|Dar es Salaam
284|Cairo Governorate
531|Luxor Governate
532|Sharm El Sheikh
365308|Aswan
365309|Hurghada
365435|Luxor
701687|Giza
704173|Bora-Bora
106|London
200|Edinburgh
291|Belfast
292|Cambridge
293|Cardiff
294|Glasgow
295|Liverpool
296|Manchester
297|Oxford
299|York
372|Inverness
374|Bath
464|Brighton and Hove
490|Stirling
700008|Birmingham
706913|Island of Skye
107|Paris
300|Provence-Alpes-Côte d'Azur
318|Bordeaux
9202|Normandy
143700|Avignon
155386|Versailles
169424|Nice
185152|Marseille
194929|Aix-en-Provence
205956|Lille
206478|Toulouse
210320|Carcassonne
215559|Rouen
223132|Nantes
365009|Lyon
365224|Strasbourg
365385|Reims
700232|Chamonix-Mont-Blanc
700761|Colmar
90|Amsterdam
325|Utrecht
64752|Rotterdam
104227|Delft
104586|Haarlem
125390|The Hague
103|Berlin
118|Munich
353|Hamburg
355|Cologne, Düsseldorf & Bonn
469|Bavaria
22901|Dresden
79171|Cologne
112049|Frankfurt
91|Vienna
354|Salzburg
400|Innsbruck
475|Tirol
138|Zurich
139|Lucerne
349|Geneva
352|Interlaken
413|Zermatt
23494|Basel
42671|Lausanne
60887|Montreux
118207|St. Moritz
150247|Grindelwald
233923|Bern
92|Rome
115|Florence
117|Venice
126|Naples
316|Toscana
317|Siena
321|Genoa
322|Turin
339|Verona
340|Bologna
370|Palermo
403|Sicily
404|Bari
409|Pisa
9926|Salerno
13862|Matera
14389|Parma
19443|Perugia
20484|Modena
20969|Ravenna
25529|Province of Padua
29882|La Spezia
32471|Stresa
40245|Portofino
42623|Pompei
46727|Civitavecchia
49991|Assisi
57478|Catania
71946|Brindisi
74506|Bolzano
78656|Bergamo
79468|Milan
80698|Riomaggiore
87006|Orvieto
92500|Bellagio
94569|Capri
96334|Sanremo
99807|Lucca
103660|Sorrento
111093|Tivoli
112326|Amalfi
112735|Positano
136034|Lecce
109|Madrid
108|Barcelona
122|Seville
188|Malaga & Costa del Sol
363|Andalusia
381|Valencia
399|Canary Islands
473|Toledo
493|San Sebastian
494|Bilbao
495|Granada
496|Cordoba
500|Girona
501|Tarragona
543|Balearic Islands
15091|Segovia
35920|Malaga
40032|Marbella
51086|Las Palmas
56871|Santander
128076|Palma
114|Reykjavik
119|Helsinki
160|Finnish Lapland
241626|Rovaniemi
140|Stockholm
201|Gothenburg
142|Oslo
172|Tromso
25955|Bergen
141|Copenhagen
154|Athens
406|Thessaloniki
407|Region of Crete
408|Mykonos
195154|Rhodes
230817|Thira
280|County Galway
281|County Dublin
283|Limerick
701781|Cork
308|Lisbon
385|Porto
6931|Madeira
103411|Braga
104849|Coimbra
365170|Sintra
365171|Cascais
307|Budapest
304|Antwerp Province
305|Bruges
306|Brussels
474|Ghent
333|Prague
347|Krakow
351|Warsaw
447|Gdańsk
518|Wroclaw
700808|Zakopane
359|Bratislava
348|Bucharest
364|Sibiu
367|Brasov County
345|Ljubljana
449|Bled
346|Sofia
383|Plovdiv
450|Varna
376|Dubrovnik
379|Zagreb
380|Split
456|Valletta
457|Gozo
433|Tallinn
453|Tbilisi
22140|Batumi
93|New York
124|Los Angeles
123|Orlando
129|San Francisco
136|Las Vegas
166|Washington DC
167|Boston
198|Miami
286|Guam
330|San Diego
465|Seattle
539|Portland
557|New Orleans
4276|Florida
5568|California
7017|Arizona
25928|Island of Hawaii
61384|Charleston
71287|Nashville
76792|Dallas
79946|San Antonio
80779|Philadelphia
83822|Springdale
90932|Houston
99418|Austin
365000|Kauai County
365001|Maui County
365257|Atlanta
365261|Fort Lauderdale
365301|Denver
365305|Phoenix
365316|Key West
365347|Sedona
365387|Tampa
365400|Santa Barbara
365433|Anchorage
700010|Anaheim
700037|Palm Springs
700048|Minneapolis
700078|South Lake Tahoe
700145|Napa
700162|Page
700838|Charlotte
700842|Savannah
700852|Baltimore
700855|Monterey
700883|Cleveland
700931|Detroit
701608|Kissimmee
701807|Chicago
701850|Brooklyn
703335|Honolulu
703370|Waikīkī
705957|Manhattan`;

export interface KlookCity { id: number; name: string; }

export const KLOOK_CITIES: KlookCity[] = RIGHE.split('\n').map((r) => {
  const i = r.indexOf('|');
  return { id: Number(r.slice(0, i)), name: r.slice(i + 1).trim() };
}).filter((c) => Number.isFinite(c.id) && c.id > 0 && c.name);

const normKlook = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * La città Klook per un nome inglese (da Nominatim `name:en`): prima il
 * match esatto, poi «nome contenuto» (Fukuoka → Fukuoka Prefecture,
 * Chiang Mai → Chiang Mai Province). Null se Klook non copre la città.
 */
export function klookCityFor(nameEn: string): KlookCity | null {
  const n = normKlook(nameEn);
  if (!n || n.length < 3) return null;
  const esatto = KLOOK_CITIES.find((c) => normKlook(c.name) === n);
  if (esatto) return esatto;
  const parziale = KLOOK_CITIES.find((c) => {
    const cn = normKlook(c.name);
    return cn.startsWith(n + ' ') || cn.endsWith(' ' + n) || (n.length >= 5 && cn.includes(n));
  });
  return parziale || null;
}

/** Slug della pagina città di Klook: "beijing-things-to-do". */
export function klookCitySlug(c: KlookCity): string {
  return `${normKlook(c.name).replace(/\s+/g, '-')}-things-to-do`;
}

/** Locale Klook per la lingua dell'app. */
export const KLOOK_LOCALE: Record<string, string> = { it: 'it', en: 'en-US', fr: 'fr', es: 'es', de: 'de', ru: 'ru', zh: 'zh-CN' };
