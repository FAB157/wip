package com.itaintasca.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters

/**
 * Stati del ciclo di vita di un trigger POI.
 *
 * PASSED è stato aggiunto col geofencing predittivo: prima il geofence di
 * uscita a 1.5× resettava lo stato ma NON fermava l'audio, quindi la voce
 * continuava a raccontare un monumento che l'utente aveva già superato.
 *
 * Il Converter di Room serializza per NOME (TriggerState.valueOf), quindi
 * aggiungere un valore in coda non invalida le righe già salvate.
 */
enum class TriggerState { PENDING, APPROACH_FIRED, ARRIVED_FIRED, PASSED }

@Entity(tableName = "trigger_state")
data class TriggerStateEntity(
    @PrimaryKey val poiId: String,
    val state: TriggerState,
    val updatedAt: Long = System.currentTimeMillis()
)
