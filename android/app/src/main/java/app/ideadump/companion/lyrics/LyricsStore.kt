package app.ideadump.companion.lyrics

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class SpotifyTrack(val title: String,val artist: String,val album: String,val durationMs: Long?) {
    val key: String get() = MessageDigest.getInstance("SHA-256").digest("$title|$artist|$album|$durationMs".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
data class LyricsResult(val cues: List<LyricCue>,val status: String)
class LyricsStore(context: Context) {
    private val cache=File(context.filesDir,"lyrics-cache").apply { mkdirs() }
    private val local=File(context.filesDir,"lyrics-local").apply { mkdirs() }
    private fun write(file: File,text: String) {
        val atomic=AtomicFile(file);val output=atomic.startWrite()
        try { output.write(text.toByteArray(Charsets.UTF_8));atomic.finishWrite(output) }
        catch(failure: Exception) { atomic.failWrite(output);throw failure }
    }
    suspend fun importLrc(track: SpotifyTrack,text: String): LyricsResult = withContext(Dispatchers.IO) {
        val cues=Lrc.parse(text);require(cues.isNotEmpty()) { "No timed lyrics found" }
        write(File(local,track.key+".lrc"),text);LyricsResult(cues,"Local LRC")
    }
    suspend fun removeOverride(track: SpotifyTrack) = withContext(Dispatchers.IO) { File(local,track.key+".lrc").delete();Unit }
    suspend fun clearCache() = withContext(Dispatchers.IO) { cache.listFiles()?.forEach { it.delete() };Unit }
    private fun normalize(text: String)=java.text.Normalizer.normalize(text,java.text.Normalizer.Form.NFKC).trim().lowercase(java.util.Locale.ROOT)
    private fun matches(item: JSONObject,track: SpotifyTrack): Boolean =
        normalize(item.optString("trackName"))==normalize(track.title) &&
        normalize(item.optString("artistName"))==normalize(track.artist) &&
        (track.durationMs==null || kotlin.math.abs(item.optDouble("duration",Double.NaN)-track.durationMs/1000.0)<=2.0) &&
        (track.album.isBlank() || normalize(item.optString("albumName"))==normalize(track.album))
    suspend fun resolve(track: SpotifyTrack): LyricsResult = withContext(Dispatchers.IO) {
        val override=File(local,track.key+".lrc")
        if(override.exists()) return@withContext LyricsResult(Lrc.parse(override.readText(Charsets.UTF_8)),"Local LRC")
        val saved=File(cache,track.key+".json")
        val data=if(saved.exists() && System.currentTimeMillis()-saved.lastModified()<30L*24*60*60*1000) JSONObject(saved.readText(Charsets.UTF_8)) else {
            val uri=Uri.parse(if(track.durationMs!=null) "https://lrclib.net/api/get" else "https://lrclib.net/api/search").buildUpon()
                .appendQueryParameter("track_name",track.title).appendQueryParameter("artist_name",track.artist)
            if(track.album.isNotBlank()) uri.appendQueryParameter("album_name",track.album)
            track.durationMs?.let { uri.appendQueryParameter("duration",(it/1000.0).toString()) }
            val connection=URL(uri.build().toString()).openConnection() as HttpURLConnection
            val response=try {
                connection.connectTimeout=10000;connection.readTimeout=15000;connection.instanceFollowRedirects=false
                connection.setRequestProperty("User-Agent","IdeaDumpCompanion/0.1.0 (https://idea-dump-alpha.vercel.app)")
                if(connection.responseCode==404) return@withContext LyricsResult(emptyList(),"No matching lyrics")
                check(connection.responseCode in 200..299) { "Lyrics provider unavailable" }
                val bytes=connection.inputStream.use { it.readNBytes(524289) }
                require(bytes.size<=524288)
                bytes.toString(Charsets.UTF_8)
            } finally { connection.disconnect() }
            ensureActive()
            val item=if(track.durationMs!=null) JSONObject(response).takeIf { matches(it,track) }
            else {
                val array=JSONArray(response)
                (0 until array.length()).map { array.getJSONObject(it) }.filter { matches(it,track) }.singleOrNull()
            } ?: return@withContext LyricsResult(emptyList(),"No unambiguous lyric match")
            write(saved,item.toString())
            cache.listFiles()?.sortedByDescending { it.lastModified() }?.drop(100)?.forEach { it.delete() }
            item
        }
        val synced=if(data.isNull("syncedLyrics")) "" else data.optString("syncedLyrics")
        val cues=Lrc.parse(synced)
        LyricsResult(cues,when { cues.isNotEmpty()->"Synchronized lyrics";data.optBoolean("instrumental")->"Instrumental";!data.isNull("plainLyrics")->"Unsynchronized lyrics";else->"No synchronized lyrics" })
    }
}
