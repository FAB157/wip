import Foundation

/**
 * (28/08/2026, SEC-09) UNICO punto di verità per la base dell'API nativa.
 *
 * Prima `https://wip.guide` era cablato in cinque file diversi (audioguida,
 * teaser, TTS, tile stradali, bundle offline): un cambio di dominio o di
 * redirect andava cercato a mano, e il 21-22/08 la produzione è passata a
 * `www.wip.guide` (vedi memoria "incidente API giù"). Il JS fa la stessa cosa
 * in src/lib/api.ts::getApiUrl(). `itainta.vercel.app` resta il dominio
 * secondario dello stesso progetto Vercel per le build già installate.
 */
enum WipApi {
    static let base = "https://www.wip.guide"
}
