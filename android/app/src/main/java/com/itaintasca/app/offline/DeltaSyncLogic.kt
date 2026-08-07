package com.itaintasca.app.offline

/**
 * Contratto del delta sync, in forma pura e testabile su JVM.
 * PackageDownloadManager lo implementa contro Room con lo stesso ordine di
 * applicazione: per ogni pagina PRIMA le tombstone (delete), POI gli upsert.
 * Conseguenza voluta: un POI cancellato e ricreato con lo stesso id nella
 * stessa finestra di sync resta presente (l'upsert vince sulla tombstone).
 */
object DeltaSyncLogic {

    fun applyDelta(
        localIds: Set<String>,
        tombstoneIds: Collection<String>,
        upsertIds: Collection<String>
    ): Set<String> = (localIds - tombstoneIds.toSet()) + upsertIds

    /**
     * Il timestamp di sync da persistere è il generatedAt catturato dal server
     * PRIMA della query della prima pagina: ciò che cambia durante il download
     * viene ripreso dal delta successivo, mai perso. In sua assenza (delta
     * vuoto senza pagine) si conserva il precedente.
     */
    fun nextSyncStamp(serverGeneratedAt: String?, previous: String?): String? =
        serverGeneratedAt ?: previous
}
