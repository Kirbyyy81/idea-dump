package app.ideadump.companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.ideadump.companion.core.CompanionSettings
import app.ideadump.companion.finance.FinanceHttpFailure
import app.ideadump.companion.lyrics.LyricsMediaService
import app.ideadump.companion.lyrics.SpotifyTrack
import app.ideadump.companion.ui.CompanionTheme
import kotlinx.coroutines.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CompanionTheme { CompanionScreens() } }
    }
    private fun open(uri: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(uri))) }
        catch(_: android.content.ActivityNotFoundException) { /* The screen keeps the code available for manual pairing. */ }
    }
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable private fun CompanionScreens() {
        val app=application as CompanionApplication
        val config by app.snapshot.collectAsStateWithLifecycle()
        val finance by app.finance.state.collectAsStateWithLifecycle()
        val lyrics by app.lyrics.state.collectAsStateWithLifecycle()
        val scope=rememberCoroutineScope()
        var tab by remember { mutableIntStateOf(0) }
        var busy by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        var hasAccess by remember { mutableStateOf(NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)) }
        var discard by remember { mutableStateOf(false) }
        var importTrack by remember { mutableStateOf<SpotifyTrack?>(null) }
        var importCandidate by remember { mutableStateOf<Pair<SpotifyTrack,String>?>(null) }
        fun action(work: suspend () -> Unit) {
            scope.launch {
                busy=true;error=null
                try { work() }
                catch(cancelled: CancellationException) { throw cancelled }
                catch(failure: FinanceHttpFailure) {
                    error=when(failure.status) {
                        401,403 -> "Reconnect your IdeaDump account."
                        404 -> "Companion support is not available on this IdeaDump server yet."
                        410 -> "Pairing code expired. Start pairing again."
                        429 -> "Please wait a minute before trying again."
                        else -> "IdeaDump could not complete the request. Try again."
                    }
                }
                catch(failure: IllegalStateException) { error=failure.message ?: "The operation could not finish." }
                catch(failure: IllegalArgumentException) { error=failure.message ?: "This file or setting is not supported." }
                catch(_: Exception) { error="Connection or storage is unavailable. Your queued events are kept." }
                finally { busy=false }
            }
        }
        val notificationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
        val filePicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val track=importTrack
            if(uri!=null && track!=null) action {
                val bytes=withContext(Dispatchers.IO) { contentResolver.openInputStream(uri)?.use { it.readNBytes(262145) } ?: error("Could not read this file") }
                require(bytes.size<=262144) { "Choose an LRC file smaller than 256 KB." }
                importCandidate=track to bytes.toString(Charsets.UTF_8)
            }
        }
        DisposableEffect(Unit) {
            val observer=LifecycleEventObserver { _,event ->
                if(event==Lifecycle.Event.ON_RESUME) {
                    hasAccess=NotificationManagerCompat.getEnabledListenerPackages(this@MainActivity).contains(packageName)
                    app.lyrics.accessChanged()
                }
            }
            lifecycle.addObserver(observer)
            onDispose { lifecycle.removeObserver(observer) }
        }
        LaunchedEffect(finance.connected) {
            if(finance.connected) runCatching { app.finance.refreshSources() }
        }
        LaunchedEffect(finance.pairingCode) {
            if(finance.pairingCode!=null) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while(isActive && app.finance.state.value.pairingCode!=null) {
                    try {
                        if(app.finance.finishPairing()) { app.finance.refreshSources();break }
                    } catch(failure: FinanceHttpFailure) {
                        if(failure.status==410) { app.finance.cancelPairing();error="Pairing code expired. Start again.";break }
                    } catch(cancelled: CancellationException) { throw cancelled }
                    catch(_: Exception) { error="Pairing will retry when connected." }
                    delay(5000)
                }
            }
        }
        fun enableLyrics(enabled: Boolean) = action {
            if(enabled) {
                check(hasAccess) { "Grant notification access before enabling lyrics." }
                if(checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                app.settings.lyrics(true)
                startService(Intent(this@MainActivity,LyricsMediaService::class.java))
            } else {
                app.settings.lyrics(false)
                stopService(Intent(this@MainActivity,LyricsMediaService::class.java))
            }
        }
        Scaffold(
            topBar={ CenterAlignedTopAppBar(title={ Text("IdeaDump Companion") }) },
            bottomBar={
                SecondaryScrollableTabRow(selectedTabIndex=tab,edgePadding=12.dp,modifier=Modifier.navigationBarsPadding()) {
                    listOf("Home","Lyrics","Finance","Diagnostics").forEachIndexed { index,label ->
                        Tab(selected=tab==index,onClick={ tab=index },text={ Text(label) })
                    }
                }
            },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement=Arrangement.spacedBy(16.dp)) {
                if(error!=null) Card(colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.errorContainer)) {
                    Text(error!!,Modifier.padding(16.dp),color=MaterialTheme.colorScheme.onErrorContainer)
                    TextButton(onClick={ error=null }) { Text("Dismiss") }
                }
                if(busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                when(tab) {
                    0 -> {
                        Section("Android access") {
                            Text(if(hasAccess) "Notification access allowed" else "Notification access required")
                            Text("Lyrics reads Spotify playback. Finance reads only the bank apps you enable.",style=MaterialTheme.typography.bodyMedium)
                            OutlinedButton(onClick={ startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) { Text("Manage notification access") }
                        }
                        Section("Spotify lyrics") {
                            ToggleRow("Lyrics",config.lyricsEnabled,!busy) { enableLyrics(it) }
                            Text(lyrics.status)
                            lyrics.track?.let { Text("${it.title} · ${it.artist}",style=MaterialTheme.typography.bodyMedium) }
                            TextButton(onClick={ tab=1 }) { Text("Lyrics settings") }
                        }
                        Section("Finance capture") {
                            ToggleRow("Capture notifications",config.financeEnabled,!busy) { action { app.finance.setEnabled(it) } }
                            Text(finance.message)
                            Text("Pending uploads: ${finance.pending}",style=MaterialTheme.typography.titleMedium)
                            if(finance.pending>0) Text("Waiting to reach IdeaDump.",style=MaterialTheme.typography.bodyMedium)
                            TextButton(onClick={ tab=2 }) { Text("Capture settings") }
                            OutlinedButton(onClick={ open(BuildConfig.IDEADUMP_ORIGIN+"/finance/review") }) { Text("Open Finance Review") }
                        }
                        Button(onClick={ open(BuildConfig.IDEADUMP_ORIGIN) },modifier=Modifier.fillMaxWidth()) { Text("Open IdeaDump") }
                    }
                    1 -> {
                        Section("Lyrics settings") {
                            ToggleRow("Lyrics",config.lyricsEnabled,!busy) { enableLyrics(it) }
                            Text(lyrics.status)
                            lyrics.track?.let { Text(it.title,style=MaterialTheme.typography.titleMedium);Text(it.artist) }
                            lyrics.pair?.let { pair ->
                                HorizontalDivider()
                                Text(pair.current.ifBlank { "..." },style=MaterialTheme.typography.titleLarge)
                                Text(pair.next,style=MaterialTheme.typography.bodyLarge)
                            }
                        }
                        Section("Timing") {
                            Text(when { config.offsetMs>0 -> "${config.offsetMs} ms earlier";config.offsetMs<0 -> "${-config.offsetMs} ms later";else -> "No timing offset" })
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(enabled=!busy && config.offsetMs<5000,onClick={ action { app.settings.offset(config.offsetMs+100) } },modifier=Modifier.weight(1f)) { Text("Earlier") }
                                OutlinedButton(enabled=!busy && config.offsetMs> -5000,onClick={ action { app.settings.offset(config.offsetMs-100) } },modifier=Modifier.weight(1f)) { Text("Later") }
                            }
                            TextButton(onClick={ action { app.settings.offset(0) } },enabled=!busy) { Text("Reset offset") }
                        }
                        Section("Lyric source") {
                            OutlinedButton(enabled=lyrics.track!=null && !busy,onClick={ importTrack=lyrics.track;filePicker.launch(arrayOf("*/*")) }) { Text("Choose local LRC file") }
                            TextButton(enabled=lyrics.track!=null && !busy,onClick={ action { app.lyrics.removeOverride() } }) { Text("Use LRCLIB for this track") }
                            TextButton(enabled=lyrics.track!=null,onClick={ app.lyrics.retry() }) { Text("Retry lyric lookup") }
                            TextButton(enabled=!busy,onClick={ action { app.lyrics.clearCache() } }) { Text("Clear downloaded lyric cache") }
                            Text("Open IdeaDump Companion in Android Auto to view the two lyric fields. Spotify continues playing the audio.",style=MaterialTheme.typography.bodyMedium)
                        }
                    }
                    2 -> {
                        Section("IdeaDump connection") {
                            Text(finance.message)
                            if(finance.pairingCode!=null) {
                                Text(finance.pairingCode!!,style=MaterialTheme.typography.headlineMedium)
                                Button(enabled=!busy,onClick={ finance.pairingUri?.let(::open) }) { Text("Approve in browser") }
                                TextButton(enabled=!busy,onClick={ action { app.finance.cancelPairing() } }) { Text("Cancel pairing") }
                            } else {
                                Button(enabled=!busy,onClick={ action { app.finance.beginPairing();app.finance.state.value.pairingUri?.let(::open) } }) {
                                    Text(if(finance.connected) "Reconnect account" else "Connect IdeaDump")
                                }
                            }
                            if(finance.connected) TextButton(enabled=!busy,onClick={ action { app.finance.disconnect() } }) { Text("Disconnect") }
                        }
                        Section("Apps and sources") {
                            Text("Choose a source to enable capture for that app. UOB is waiting for a notification sample.",style=MaterialTheme.typography.bodyMedium)
                            for((pkg,name) in CompanionSettings.packages) {
                                var expanded by remember(pkg) { mutableStateOf(false) }
                                val selected=config.mappings[pkg]
                                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                                    Text(name,Modifier.weight(1f).padding(top=12.dp),style=MaterialTheme.typography.titleMedium)
                                    Switch(modifier=Modifier.semantics { contentDescription="$name notification capture" },checked=selected!=null,enabled=pkg!=CompanionSettings.UOB && finance.connected && !busy,
                                        onCheckedChange={ enabled -> if(enabled) expanded=true else action { app.settings.mapSource(pkg,null) } })
                                }
                                if(pkg==CompanionSettings.UOB) Text("Awaiting notification sample",style=MaterialTheme.typography.bodySmall)
                                else Box {
                                    OutlinedButton(enabled=finance.connected && !busy,onClick={ expanded=true }) {
                                        Text(finance.sources.find { it.id==selected }?.name ?: if(selected==null) "Choose source" else "Source unavailable")
                                    }
                                    DropdownMenu(expanded=expanded,onDismissRequest={ expanded=false }) {
                                        DropdownMenuItem(text={ Text("Capture off") },onClick={ expanded=false;action { app.settings.mapSource(pkg,null) } })
                                        finance.sources.forEach { source -> DropdownMenuItem(text={ Text(source.name) },
                                            onClick={ expanded=false;action { app.settings.mapSource(pkg,source.id) } }) }
                                        if(finance.sources.isEmpty()) DropdownMenuItem(text={ Text("No sources. Add one in IdeaDump.") },onClick={ expanded=false;open(BuildConfig.IDEADUMP_ORIGIN+"/finance/settings?section=sources") })
                                    }
                                }
                            }
                            TextButton(enabled=finance.connected && !busy,onClick={ action { app.finance.refreshSources() } }) { Text("Refresh sources") }
                            ToggleRow("Capture notifications",config.financeEnabled,!busy) { action { app.finance.setEnabled(it) } }
                        }
                        Section("Uploads") {
                            Text("Pending uploads: ${finance.pending}",style=MaterialTheme.typography.titleMedium)
                            Text("Pausing capture also pauses uploads. Queued events stay on this device until accepted or discarded.",style=MaterialTheme.typography.bodyMedium)
                            OutlinedButton(enabled=!busy && config.financeEnabled && finance.pending>0,onClick={ action { app.finance.retry() } }) { Text("Retry uploads") }
                            TextButton(enabled=!busy && finance.pending>0,onClick={ discard=true }) { Text("Discard queued notifications") }
                            Button(onClick={ open(BuildConfig.IDEADUMP_ORIGIN+"/finance/review") }) { Text("Open Finance Review") }
                        }
                    }
                    3 -> {
                        val network=getSystemService(ConnectivityManager::class.java)
                        val online=network.getNetworkCapabilities(network.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)==true
                        Section("Device status") {
                            Text("Android ${android.os.Build.VERSION.RELEASE}")
                            Text("Notification access: "+if(hasAccess) "allowed" else "not allowed")
                            Text("Internet: "+if(online) "connected" else "unavailable")
                            Text("Background battery: "+if(getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)) "unrestricted" else "system managed")
                            OutlinedButton(onClick={ startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }) { Text("Battery settings") }
                        }
                        Section("Lyrics") {
                            Text(lyrics.status)
                            Text("Spotify: "+if(lyrics.track==null) "not active" else if(lyrics.playing) "playing" else "paused")
                            lyrics.track?.let { Text("${it.title} · ${it.artist}");Text("Duration: ${it.durationMs?.div(1000) ?: "unavailable"} s") }
                            Text("Position: ${lyrics.anchor?.position(SystemClock.elapsedRealtime(),lyrics.track?.durationMs)?.div(1000) ?: "unavailable"} s")
                            Text("Global offset: ${config.offsetMs} ms")
                        }
                        Section("Finance") {
                            Text(finance.message)
                            Text("Pending uploads: ${finance.pending}")
                            Text("Last accepted upload: ${finance.lastUpload ?: "none"}")
                            Text("Notification text and credentials are excluded from diagnostics.",style=MaterialTheme.typography.bodyMedium)
                        }
                        Text("Companion ${BuildConfig.VERSION_NAME}",style=MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        if(discard) AlertDialog(onDismissRequest={ discard=false },title={ Text("Discard queued notifications?") },
            text={ Text("This removes ${finance.pending} local events that have not reached IdeaDump. Capture will be paused.") },
            confirmButton={ TextButton(onClick={ discard=false;action { app.finance.setEnabled(false);app.finance.discard() } }) { Text("Discard") } },
            dismissButton={ TextButton(onClick={ discard=false }) { Text("Keep queue") } })
        importCandidate?.let { (track,text) -> AlertDialog(onDismissRequest={ importCandidate=null },title={ Text("Use these lyrics?") },
            text={ Text("Associate this local LRC file with ${track.title} by ${track.artist}?") },
            confirmButton={ TextButton(onClick={ importCandidate=null;action { app.lyrics.importLrc(track,text) } }) { Text("Use for this track") } },
            dismissButton={ TextButton(onClick={ importCandidate=null }) { Text("Cancel") } }) }
    }
}
@Composable private fun Section(title: String,content: @Composable ColumnScope.() -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
            Text(title,style=MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
@Composable private fun ToggleRow(label: String,checked: Boolean,enabled: Boolean,onCheckedChange: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
        Text(label,Modifier.weight(1f).padding(top=12.dp))
        Switch(modifier=Modifier.semantics { contentDescription=label },checked=checked,enabled=enabled,onCheckedChange=onCheckedChange)
    }
}
