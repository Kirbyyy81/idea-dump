package app.ideadump.companion.lyrics

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import app.ideadump.companion.core.CompanionNotificationListener
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class LyricsState(
    val track: SpotifyTrack? = null,val pair: CuePair? = null,val anchor: PlaybackAnchor? = null,
    val playing: Boolean = false,val actions: Long = 0,val status: String = "Lyrics disabled",
)
class LyricsController(private val context: Context) {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val manager=context.getSystemService(MediaSessionManager::class.java)
    private val listenerComponent=ComponentName(context,CompanionNotificationListener::class.java)
    private val store=LyricsStore(context)
    private var controller: MediaController?=null
    private var registered=false
    private var enabled=false
    private var offset=0
    private var generation=0L
    private var lookup: Job?=null
    private var cues=emptyList<LyricCue>()
    private var resultStatus="Waiting for Spotify"
    val state=MutableStateFlow(LyricsState())
    private val callback=object: MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) { refresh() }
        override fun onPlaybackStateChanged(playbackState: PlaybackState?) { refresh() }
        override fun onSessionDestroyed() { attach(emptyList());accessChanged() }
    }
    private val sessions=MediaSessionManager.OnActiveSessionsChangedListener { attach(it ?: emptyList()) }
    init {
        scope.launch {
            while(isActive) {
                if(enabled) publishCue()
                delay(100)
            }
        }
    }
    fun configure(isEnabled: Boolean,offsetMs: Int) {
        offset=offsetMs
        if(enabled!=isEnabled) {
            enabled=isEnabled
            if(enabled) accessChanged() else {
                if(registered) manager.removeOnActiveSessionsChangedListener(sessions)
                registered=false;controller?.unregisterCallback(callback);controller=null;reset("Lyrics disabled")
            }
        }
        publishCue()
    }
    fun accessChanged() {
        if(!enabled) return
        try {
            if(!registered) { manager.addOnActiveSessionsChangedListener(sessions,listenerComponent,Handler(Looper.getMainLooper()));registered=true }
            attach(manager.getActiveSessions(listenerComponent))
        } catch(_: SecurityException) { accessLost() }
    }
    fun accessLost() {
        if(registered) manager.removeOnActiveSessionsChangedListener(sessions)
        registered=false;controller?.unregisterCallback(callback);controller=null
        reset(if(enabled) "Notification access required" else "Lyrics disabled")
    }
    private fun reset(message: String) {
        generation++;lookup?.cancel();cues=emptyList();resultStatus=message;state.value=LyricsState(status=message)
    }
    private fun attach(active: List<MediaController>) {
        if(!enabled) return
        val spotify=active.filter { it.packageName=="com.spotify.music" }
            .sortedByDescending { it.playbackState?.state==PlaybackState.STATE_PLAYING }.firstOrNull()
        if(controller?.sessionToken==spotify?.sessionToken) { refresh();return }
        controller?.unregisterCallback(callback);controller=spotify
        reset(if(spotify==null) "Waiting for Spotify" else "Reading Spotify")
        spotify?.registerCallback(callback,Handler(Looper.getMainLooper()))
        refresh()
    }
    private fun refresh() {
        if(!enabled) return
        val source=controller ?: return
        val metadata=source.metadata
        val title=metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.take(500).orEmpty()
        val artist=metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST)?.take(500).orEmpty()
        if(title.isBlank() || artist.isBlank()) { reset("Track metadata unavailable");return }
        val track=SpotifyTrack(title,artist,metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM)?.take(500).orEmpty(),
            metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?.takeIf { it>0 })
        val playback=source.playbackState
        val playing=playback?.state==PlaybackState.STATE_PLAYING
        val anchor=playback?.let { PlaybackAnchor(it.position,it.lastPositionUpdateTime,it.playbackSpeed,playing) }
        val changed=state.value.track?.key!=track.key
        if(changed) { generation++;lookup?.cancel();cues=emptyList();resultStatus="Looking up lyrics" }
        state.value=LyricsState(track,null,anchor,playing,playback?.actions ?: 0,resultStatus)
        publishCue()
        if(changed) resolve(track)
    }
    private fun resolve(track: SpotifyTrack) {
        val version=++generation
        lookup?.cancel()
        lookup=scope.launch {
            try {
                val result=store.resolve(track)
                if(version!=generation || state.value.track?.key!=track.key || !enabled) return@launch
                cues=result.cues;resultStatus=result.status;publishCue()
            } catch(cancelled: CancellationException) { throw cancelled }
            catch(_: Exception) {
                if(version==generation) { cues=emptyList();resultStatus="Lyrics lookup unavailable";publishCue() }
            }
        }
    }
    private fun publishCue() {
        if(!enabled) return
        val current=state.value
        val position=current.anchor?.position(SystemClock.elapsedRealtime(),current.track?.durationMs)
        val pair=if(position!=null && cues.isNotEmpty()) Lrc.select(cues,position,offset) else null
        val status=if(current.track!=null && position==null) "Playback timing unavailable" else resultStatus
        if(current.pair!=pair || current.status!=status) state.value=current.copy(pair=pair,status=status)
    }
    fun playPause(play: Boolean) {
        val source=controller ?: return
        val actions=source.playbackState?.actions ?: 0
        val action=if(play) PlaybackState.ACTION_PLAY else PlaybackState.ACTION_PAUSE
        if(actions and (action or PlaybackState.ACTION_PLAY_PAUSE)!=0L) {
            if(play) source.transportControls.play() else source.transportControls.pause()
        }
    }
    fun next() { if(state.value.actions and PlaybackState.ACTION_SKIP_TO_NEXT!=0L) controller?.transportControls?.skipToNext() }
    fun previous() { if(state.value.actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS!=0L) controller?.transportControls?.skipToPrevious() }
    fun seek(position: Long) {
        if(state.value.actions and PlaybackState.ACTION_SEEK_TO!=0L) controller?.transportControls?.seekTo(position.coerceAtLeast(0).let {
            state.value.track?.durationMs?.let { duration -> it.coerceAtMost(duration) } ?: it
        })
    }
    fun retry() { state.value.track?.let(::resolve) }
    suspend fun importLrc(track: SpotifyTrack,text: String) {
        check(track.key==state.value.track?.key) { "Track changed. Choose the file again." }
        val result=store.importLrc(track,text)
        if(track.key==state.value.track?.key) { generation++;lookup?.cancel();cues=result.cues;resultStatus=result.status;publishCue() }
    }
    suspend fun removeOverride() { state.value.track?.let { store.removeOverride(it);resolve(it) } }
    suspend fun clearCache() { store.clearCache() }
}
