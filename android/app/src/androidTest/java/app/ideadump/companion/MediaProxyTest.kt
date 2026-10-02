package app.ideadump.companion

import android.os.SystemClock
import android.media.session.PlaybackState
import androidx.test.platform.app.InstrumentationRegistry
import app.ideadump.companion.lyrics.*
import org.junit.Assert.*
import org.junit.Test

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class MediaProxyTest {
    private class RecordingTransport : LyricsTransport {
        val calls=mutableListOf<String>()
        override fun playPause(play: Boolean) { calls.add(if(play) "play" else "pause") }
        override fun next() { calls.add("next") }
        override fun previous() { calls.add("previous") }
        override fun seek(position: Long) { calls.add("seek:$position") }
    }
    @Test fun transportCommandsAreForwardedExactlyOnce() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val source=RecordingTransport()
            val player=SpotifyProxyPlayer(source)
            try {
                val actions=PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_SEEK_TO or
                    PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS
                player.update(LyricsState(track=SpotifyTrack("Song","Artist","Album",10000),
                    anchor=PlaybackAnchor(0,SystemClock.elapsedRealtime(),1f,false),actions=actions))
                player.play()
                player.pause()
                player.seekToNextMediaItem()
                player.seekToPreviousMediaItem()
                player.seekTo(4000)
                assertEquals(listOf("play","pause","next","previous","seek:4000"),source.calls)
            } finally { player.release() }
        }
    }
    @Test fun twoDistinctFieldsAndTrackChangeFallback() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val source=RecordingTransport()
            val player=SpotifyProxyPlayer(source)
            try {
                player.update(LyricsState(SpotifyTrack("Synthetic song","Test artist","Album",10000),
                    CuePair("Current cue","Next cue"),PlaybackAnchor(1000,SystemClock.elapsedRealtime(),1f,false),false,0,"Local LRC"))
                assertEquals("Current cue",player.mediaMetadata.displayTitle.toString())
                assertEquals("Next cue",player.mediaMetadata.subtitle.toString())
                assertFalse(player.mediaMetadata.displayTitle.toString().contains("\n"))
                player.update(LyricsState(track=SpotifyTrack("Another song","Another artist","Album",10000),status="Looking up lyrics"))
                assertEquals("Another song",player.mediaMetadata.displayTitle.toString())
                assertEquals("Another artist",player.mediaMetadata.subtitle.toString())
            } finally { player.release() }
        }
    }
}
