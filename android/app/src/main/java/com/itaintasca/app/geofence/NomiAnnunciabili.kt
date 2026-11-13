package com.itaintasca.app.geofence

import com.itaintasca.app.db.PoiEntity

/**
 * (25/10/2026) Quali righe possono PARLARE e quali nomi si possono ANNUNCIARE.
 * Port di `src/lib/geofencing/nomiAnnunciabili.ts` (regole del collaudo di 7
 * citta' del 23/10/2026): stesse espressioni regolari, stesse soglie. Chi cambia
 * una lista la cambia anche sul web e in `PoiModels.swift`.
 *
 *  1. `rigaNonParla`: una CITTA', un'entita' amministrativa (comune, provincia,
 *     regione, area metropolitana) o una METROPOLITANA non e' un luogo da
 *     raccontare (a Bruxelles parlava `wd-Q239` «Bruxelles»). Una gemma resta
 *     gemma, salvo che la sua categoria sia proprio amministrativa.
 *  2. `nomeDaAnnunciare`: l'avviso dei 150 m dice un NOME, mai un'etichetta
 *     grezza: numeri soli, pietre d'inciampo, targhe, descrizioni inglesi usate
 *     come nome («School building»), nomi in un alfabeto che la voce
 *     dell'utente non legge. null = niente avviso per quella riga.
 *  3. `alfabeto` / `stessoLuogoAltroAlfabeto`: il gemello in un altro alfabeto
 *     («Трг републике» dopo «Piazza della Repubblica»), o con lo stesso QID, e'
 *     lo stesso luogo: tace se chi ha gia' parlato sta entro 150 m.
 *  4. `teaserLeggibile`: il teaser da LEGGERE, o null (segnaposto «Apri l'app
 *     per scoprire…», testo inglese nella colonna italiana, alfabeto sbagliato).
 *
 * LIMITI DELLA CACHE ROOM (`PoiEntity`): non porta `name_translated`, `city`,
 * `wikidata` ne' le sette colonne teaser — il nome e' `nome`, la categoria e'
 * `poiType`, il QID si ricava dall'id (`wd-Q123`, `cine-Q34006`), il teaser e'
 * gia' quello della sola lingua dell'utente (SupabaseClient.parsePoiList), dove
 * il confronto con la colonna inglese si fa al momento della lettura.
 */
object NomiAnnunciabili {

    enum class Alfabeto { LATINO, CIRILLICO, GRECO, ARABO, EBRAICO, CJK, DEVANAGARI, THAI, ALTRO, NESSUNO }

    /** L'alfabeto prevalente di un testo (lettere soltanto). */
    fun alfabeto(testo: String?): Alfabeto {
        val s = testo ?: return Alfabeto.NESSUNO
        val conta = HashMap<Alfabeto, Int>()
        var i = 0
        while (i < s.length) {
            val c = s.codePointAt(i)
            i += Character.charCount(c)
            val a: Alfabeto? = when {
                (c in 0x41..0x5a) || (c in 0x61..0x7a) || (c in 0xc0..0x24f) || (c in 0x1e00..0x1eff) -> Alfabeto.LATINO
                c in 0x400..0x52f -> Alfabeto.CIRILLICO
                c in 0x370..0x3ff -> Alfabeto.GRECO
                c in 0x600..0x6ff -> Alfabeto.ARABO
                c in 0x590..0x5ff -> Alfabeto.EBRAICO
                (c in 0x3040..0x30ff) || (c in 0x4e00..0x9fff) || (c in 0xac00..0xd7af) -> Alfabeto.CJK
                c in 0x900..0x97f -> Alfabeto.DEVANAGARI
                c in 0xe00..0xe7f -> Alfabeto.THAI
                Character.isLetter(c) -> Alfabeto.ALTRO
                else -> null
            }
            if (a != null) conta[a] = (conta[a] ?: 0) + 1
        }
        var migliore = Alfabeto.NESSUNO
        var n = 0
        for ((k, v) in conta) if (v > n) { migliore = k; n = v }
        return migliore
    }

    /** L'alfabeto che la voce della lingua dell'utente sa leggere. */
    fun alfabetoDellaLingua(lingua: String?): Alfabeto =
        when ((lingua ?: "it").lowercase(java.util.Locale.ROOT).take(2)) {
            "ru" -> Alfabeto.CIRILLICO
            "zh" -> Alfabeto.CJK
            else -> Alfabeto.LATINO
        }

    private val CATEGORIE_AMMINISTRATIVE = Regex(
        "^(city|town|village|hamlet|municipality|comune|citta|città|administrative|admin|region|regione|province|provincia|state|country|county|district|borough|suburb|quarter|neighbourhood|neighborhood|locality|metropolitan_area|subway|subway_station|metro|metro_station|metropolitana)$",
        RegexOption.IGNORE_CASE
    )
    private val NOME_AMMINISTRATIVO = Regex(
        "\\b(area metropolitana|citt[aà] metropolitana|metropolitan (area|city|borough|county)|metropolitana di|metro(politana)? line|linea \\d+ della metropolitana|provincia di|province of|regione|r[ée]gion de|comune di|municipality of|municipio de|arrondissement|bezirk|landkreis|okrug|oblast|county of)\\b",
        RegexOption.IGNORE_CASE
    )
    private val NOME_METRO = Regex("^(metro|metropolitana|subway|u-?bahn|underground|métro)\\b", RegexOption.IGNORE_CASE)

    /**
     * True se la riga non deve mai parlare: citta', entita' amministrative,
     * metropolitane. `citta` (facoltativo): il nome della citta' in cui si e'.
     * Le tappe di un giro non passano di qui: le ha scelte l'utente.
     */
    fun rigaNonParla(nome: String?, categoria: String?, isGem: Boolean, citta: String? = null): Boolean {
        val cat = (categoria ?: "").trim()
        if (isGem) return CATEGORIE_AMMINISTRATIVE.matches(cat)
        if (CATEGORIE_AMMINISTRATIVE.matches(cat)) return true
        val n = (nome ?: "").trim()
        if (n.isEmpty()) return false
        if (NOME_AMMINISTRATIVO.containsMatchIn(n) || NOME_METRO.containsMatchIn(n)) return true
        if (!citta.isNullOrBlank() && n.equals(citta.trim(), ignoreCase = true)) return true
        return false
    }

    fun rigaNonParla(poi: PoiEntity, citta: String? = null): Boolean =
        !poi.isFromItinerary && rigaNonParla(poi.nome, poi.poiType, poi.isGem, citta)

    private val SOLO_NUMERI = Regex("^[\\s\\d.,:/#№-]+$")
    private val PIETRA_O_TARGA = Regex(
        "\\b(stolperstein|pietra d'inciampo|pietre d'inciampo|struikelsteen|pav[ée] de m[ée]moire|plaque|targa|lapide|gedenktafel|placa conmemorativa|memorial plaque|blue plaque)\\b|^plaque\\s*№?",
        RegexOption.IGNORE_CASE
    )
    private val CATEGORIA_TARGA = Regex("stolperstein|plaque|targa", RegexOption.IGNORE_CASE)
    private val DESCRIZIONE_INGLESE = Regex(
        "^(a |an |the )?(school|office|residential|apartment|commercial|industrial|public|private|old|former|historic|small|large)?\\s*(building|house|statue|sculpture|monument|bust|fountain|church|chapel|shrine|memorial|tower|gate|wall|bridge|structure|artwork|mural|relief|sign|bench)( of [a-z ]+| building)?$",
        RegexOption.IGNORE_CASE
    )
    private val CODA_EDIFICIO = Regex(" - (school|residential|office) building$", RegexOption.IGNORE_CASE)

    /** Il nome da dire nell'avviso dei 150 m, o null se il nome e' grezzo (regola 2). */
    fun nomeDaAnnunciare(nome: String?, id: String?, categoria: String?, lingua: String?): String? {
        val grezzo = (nome ?: "").trim()
        if (grezzo.length < 3) return null
        if (SOLO_NUMERI.matches(grezzo)) return null
        if (PIETRA_O_TARGA.containsMatchIn(grezzo) || CATEGORIA_TARGA.containsMatchIn(categoria ?: "")) return null
        if ((id ?: "").startsWith("plaque-")) return null
        if (DESCRIZIONE_INGLESE.matches(grezzo) || CODA_EDIFICIO.containsMatchIn(grezzo)) return null
        val a = alfabeto(grezzo)
        if (a != Alfabeto.NESSUNO && a != alfabetoDellaLingua(lingua)) return null
        return grezzo
    }

    fun nomeDaAnnunciare(poi: PoiEntity, lingua: String?): String? =
        nomeDaAnnunciare(poi.nome, poi.id, poi.poiType, lingua)

    private val RE_QID = Regex("^Q\\d+$")
    private val RE_QID_IN_ID = Regex("(?:^|-)(Q\\d+)$")

    /** QID Wikidata della riga, se lo conosciamo (dall'id `wd-…Q123`; Room non porta la colonna). */
    fun qidDi(id: String?, wikidata: String? = null): String? {
        val q = (wikidata ?: "").trim()
        if (RE_QID.matches(q)) return q
        return RE_QID_IN_ID.find(id ?: "")?.groupValues?.get(1)
    }

    /** Due righe sono lo stesso luogo scritto in due alfabeti (o lo stesso QID)? `metri`: distanza fra le due. */
    fun stessoLuogoAltroAlfabeto(a: PoiEntity, b: PoiEntity, metri: Float): Boolean {
        val qa = qidDi(a.id)
        val qb = qidDi(b.id)
        if (qa != null && qb != null && qa == qb) return true
        if (!(metri <= GEMELLO_M)) return false
        val na = alfabeto(a.nome)
        val nb = alfabeto(b.nome)
        return na != Alfabeto.NESSUNO && nb != Alfabeto.NESSUNO && na != nb
    }

    const val GEMELLO_M = 150f

    private val SEGNAPOSTO = Regex(
        "apri l'app per scoprire|open the app to discover|ouvrez l'app|abre la app|öffne die app",
        RegexOption.IGNORE_CASE
    )

    /**
     * Il teaser da LEGGERE, o null (regola 4). `teaser` e' gia' la colonna della
     * lingua dell'utente (o `teaser_text` per l'italiano); `teaserEn` la colonna
     * inglese quando la si ha sotto mano: un testo «italiano» identico a quello
     * inglese e' inglese, e non si legge con voce italiana.
     */
    fun teaserLeggibile(teaser: String?, teaserEn: String?, lingua: String?): String? {
        val l = (lingua ?: "it").lowercase(java.util.Locale.ROOT).take(2)
        var t = teaser?.trim() ?: ""
        val en = teaserEn?.trim() ?: ""
        if (l != "en" && t.isNotEmpty() && en.isNotEmpty() && t == en) t = ""
        if (t.isEmpty() || SEGNAPOSTO.containsMatchIn(t)) return null
        val a = alfabeto(t)
        if (a != Alfabeto.NESSUNO && a != alfabetoDellaLingua(l)) return null
        return t
    }
}
