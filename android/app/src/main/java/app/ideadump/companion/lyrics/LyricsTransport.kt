package app.ideadump.companion.lyrics

interface LyricsTransport {
    fun playPause(play: Boolean)
    fun next()
    fun previous()
    fun seek(position: Long)
}
