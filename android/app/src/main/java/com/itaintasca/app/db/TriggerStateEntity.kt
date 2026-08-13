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
 * EXITED sostituisce la cancellazione secca dello stato all'uscita: il suo
 * timestamp fa da cooldown anti-rimbalzo (il GPS che rientra/esce dall'isteresi
 * fra le chiome non deve rifare banner+annuncio ogni pochi metri). Port di
 * BackgroundPoiManager.swift (stato .exited + approachRetriggerCooldown /
 * arrivalAfterExitCooldown).
 *
 * Il Converter di Room serializza per NOME (TriggerState.valueOf), quindi
 * aggiungere un valore in coda non invalida le righe già salvate.
 */
enum class TriggerState { PENDING, APPROACH_FIRED, ARRIVED_FIRED, PASSED, EXITED }

@Entity(tableName = "trigger_state")
data class TriggerStateEntity(
    @PrimaryKey val poiId: String,
    val state: TriggerState,
    val updatedAt: Long = System.currentTimeMillis()
)
