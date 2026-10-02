package app.ideadump.companion.core

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.companionPreferences by preferencesDataStore("companion_settings")

data class SettingsSnapshot(
    val lyricsEnabled: Boolean = false,
    val financeEnabled: Boolean = false,
    val offsetMs: Int = 0,
    val mappings: Map<String, String> = emptyMap(),
)
class CompanionSettings(private val context: Context) {
    companion object {
        const val RYT = "my.rytbank.app"
        const val TNG = "my.com.tngdigital.ewallet"
        const val UOB = "com.uob.mightymy"
        val packages = linkedMapOf(RYT to "Ryt", TNG to "TNG", UOB to "UOB")
        private val lyrics = booleanPreferencesKey("lyrics")
        private val finance = booleanPreferencesKey("finance")
        private val offset = intPreferencesKey("offset_ms")
    }
    val flow = context.companionPreferences.data.map { data ->
        SettingsSnapshot(data[lyrics] ?: false, data[finance] ?: false, data[offset] ?: 0,
            packages.keys.filter { it != UOB }.mapNotNull { pkg -> data[stringPreferencesKey("source.$pkg")]?.let { pkg to it } }.toMap())
    }
    suspend fun lyrics(enabled: Boolean) { context.companionPreferences.edit { it[lyrics] = enabled } }
    suspend fun finance(enabled: Boolean) { context.companionPreferences.edit { it[finance] = enabled } }
    suspend fun offset(value: Int) { context.companionPreferences.edit { it[offset] = value.coerceIn(-5000,5000) / 100 * 100 } }
    suspend fun mapSource(pkg: String, sourceId: String?) {
        require(pkg in packages && pkg != UOB)
        context.companionPreferences.edit {
            if (sourceId == null) it.remove(stringPreferencesKey("source.$pkg"))
            else it[stringPreferencesKey("source.$pkg")] = sourceId
        }
    }
    suspend fun clearMappings() {
        context.companionPreferences.edit { data -> packages.keys.forEach { data.remove(stringPreferencesKey("source.$it")) }; data[finance] = false }
    }
}
