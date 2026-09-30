package app.ideadump.companion

import android.app.Application
import app.ideadump.companion.core.*
import app.ideadump.companion.finance.*
import app.ideadump.companion.lyrics.LyricsController
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class CompanionApplication : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var settings: CompanionSettings
    lateinit var snapshot: StateFlow<SettingsSnapshot>
    lateinit var finance: FinanceController
    lateinit var lyrics: LyricsController
    override fun onCreate() {
        super.onCreate()
        settings = CompanionSettings(this)
        snapshot = settings.flow.stateIn(scope,SharingStarted.Eagerly,SettingsSnapshot())
        finance = FinanceController(this,settings,SecureVault(this),FinanceQueue.create(this))
        lyrics = LyricsController(this)
        scope.launch { snapshot.collect { lyrics.configure(it.lyricsEnabled,it.offsetMs) } }
    }
}
