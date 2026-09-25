package app.ideadump.companion.lyrics

import android.media.session.PlaybackState
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.*
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class SpotifyProxyPlayer(private val source: LyricsTransport) : SimpleBasePlayer(Looper.getMainLooper()) {
    private var snapshot=LyricsState()
    fun update(state: LyricsState) { snapshot=state;invalidateState() }
    fun item(): MediaItem {
        val track=snapshot.track
        val pair=snapshot.pair
        val title=pair?.current?.takeIf { it.isNotBlank() } ?: track?.title ?: snapshot.status
        val subtitle=if(pair!=null) pair.next else track?.artist.orEmpty()
        return MediaItem.Builder().setMediaId("spotify")
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setDisplayTitle(title)
                .setSubtitle(subtitle).setArtist(subtitle).setAlbumTitle(track?.album)
                .setDescription(track?.let { "${it.title} · ${it.artist}" } ?: snapshot.status)
                .setIsBrowsable(false).setIsPlayable(track!=null).setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC).build()).build()
    }
    override fun getState(): State {
        val track=snapshot.track
        val commands=Player.Commands.Builder().addAll(
            Player.COMMAND_GET_CURRENT_MEDIA_ITEM,Player.COMMAND_GET_METADATA,Player.COMMAND_GET_TIMELINE)
        if(track!=null) {
            commands.addAll(Player.COMMAND_PREPARE,Player.COMMAND_SET_MEDIA_ITEM)
            if(snapshot.actions and (PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE)!=0L) commands.add(Player.COMMAND_PLAY_PAUSE)
            if(snapshot.actions and PlaybackState.ACTION_SEEK_TO!=0L) commands.add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
            if(snapshot.actions and PlaybackState.ACTION_SKIP_TO_NEXT!=0L) commands.addAll(Player.COMMAND_SEEK_TO_NEXT,Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            if(snapshot.actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS!=0L) commands.addAll(Player.COMMAND_SEEK_TO_PREVIOUS,Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
        }
        val position=PositionSupplier { snapshot.anchor?.position(SystemClock.elapsedRealtime(),track?.durationMs) ?: C.TIME_UNSET }
        val itemData=MediaItemData.Builder(track?.key ?: "idle").setMediaItem(item())
            .setDurationUs(track?.durationMs?.times(1000) ?: C.TIME_UNSET)
            .setIsSeekable(snapshot.actions and PlaybackState.ACTION_SEEK_TO!=0L).setIsDynamic(true).build()
        return State.Builder().setAvailableCommands(commands.build())
            .setPlaylist(listOf(itemData)).setCurrentMediaItemIndex(0)
            .setPlaybackState(if(track!=null) Player.STATE_READY else Player.STATE_IDLE)
            .setPlayWhenReady(snapshot.playing,Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackParameters(PlaybackParameters(snapshot.anchor?.speed?.takeIf { it.isFinite() && it>0 } ?: 1f))
            .setContentPositionMs(position).setDeviceInfo(DeviceInfo.Builder(DeviceInfo.PLAYBACK_TYPE_REMOTE).build()).build()
    }
    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        source.playPause(playWhenReady);return Futures.immediateVoidFuture()
    }
    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()
    override fun handleSetMediaItems(mediaItems: List<MediaItem>,startIndex: Int,startPositionMs: Long): ListenableFuture<*> =
        Futures.immediateVoidFuture()
    override fun handleSeek(mediaItemIndex: Int,positionMs: Long,seekCommand: Int): ListenableFuture<*> {
        when(seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT,Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> source.next()
            Player.COMMAND_SEEK_TO_PREVIOUS,Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> source.previous()
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> if(positionMs!=C.TIME_UNSET) source.seek(positionMs)
            else -> Unit
        }
        return Futures.immediateVoidFuture()
    }
}
