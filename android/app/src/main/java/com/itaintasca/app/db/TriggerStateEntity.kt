package com.itaintasca.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters

enum class TriggerState { PENDING, APPROACH_FIRED, ARRIVED_FIRED }

@Entity(tableName = "trigger_state")
data class TriggerStateEntity(
    @PrimaryKey val poiId: String,
    val state: TriggerState,
    val updatedAt: Long = System.currentTimeMillis()
)
