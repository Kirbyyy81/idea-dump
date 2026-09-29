package app.ideadump.companion.lyrics

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.*
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import app.ideadump.companion.CompanionApplication
import app.ideadump.companion.MainActivity
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.*

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class LyricsMediaService : MediaLibraryService() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private lateinit var player: SpotifyProxyPlayer
    private var session: MediaLibrarySession?=null
    override fun onCreate() {
        super.onCreate()
        val lyrics=(application as CompanionApplication).lyrics
        player=SpotifyProxyPlayer(lyrics)
        session=MediaLibrarySession.Builder(this,player,LibraryCallback())
            .setSessionActivity(PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build()
        scope.launch { lyrics.state.collect { player.update(it) } }
        lyrics.accessChanged()
    }
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        if(controllerInfo.isTrusted || controllerInfo.packageName==packageName || controllerInfo.packageName=="com.google.android.projection.gearhead") session else null
    override fun onDestroy() { scope.cancel();session?.release();player.release();super.onDestroy() }
    private inner class LibraryCallback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(session: MediaLibrarySession,browser: MediaSession.ControllerInfo,params: LibraryParams?): ListenableFuture<LibraryResult<MediaItem>> {
            val root=MediaItem.Builder().setMediaId("root").setMediaMetadata(MediaMetadata.Builder().setTitle("Spotify lyrics").setIsBrowsable(true).setIsPlayable(false).build()).build()
            return Futures.immediateFuture(LibraryResult.ofItem(root,params))
        }
        override fun onGetChildren(session: MediaLibrarySession,browser: MediaSession.ControllerInfo,parentId: String,page: Int,pageSize: Int,params: LibraryParams?): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if(parentId!="root" || page<0 || pageSize<=0) return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
            return Futures.immediateFuture(LibraryResult.ofItemList(if(page==0) listOf(player.item()) else emptyList(),params))
        }
        override fun onGetItem(session: MediaLibrarySession,browser: MediaSession.ControllerInfo,mediaId: String): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(if(mediaId=="spotify") LibraryResult.ofItem(player.item(),null) else LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
        override fun onAddMediaItems(mediaSession: MediaSession,controller: MediaSession.ControllerInfo,mediaItems: List<MediaItem>): ListenableFuture<List<MediaItem>> =
            Futures.immediateFuture(mediaItems.filter { it.mediaId=="spotify" }.map { player.item() })
        // This proxy exposes the current Spotify session only; catalog voice search is unsupported.
        override fun onSearch(session: MediaLibrarySession,browser: MediaSession.ControllerInfo,query: String,params: LibraryParams?): ListenableFuture<LibraryResult<Void>> =
            Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_NOT_SUPPORTED))
        override fun onSubscribe(session: MediaLibrarySession,browser: MediaSession.ControllerInfo,parentId: String,params: LibraryParams?): ListenableFuture<LibraryResult<Void>> =
            Futures.immediateFuture(LibraryResult.ofVoid())
    }
}
