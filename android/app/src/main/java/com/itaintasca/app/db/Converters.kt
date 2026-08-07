package com.itaintasca.app.db

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromTriggerState(value: TriggerState): String {
        return value.name
    }

    @TypeConverter
    fun toTriggerState(value: String): TriggerState {
        return TriggerState.valueOf(value)
    }
}
