package app.ideadump.companion.lyrics

data class LyricCue(val atMs: Long,val text: String)
data class CuePair(val current: String,val next: String)
data class PlaybackAnchor(val positionMs: Long,val elapsedAtMs: Long,val speed: Float,val playing: Boolean) {
    fun position(now: Long,duration: Long?): Long? {
        if(positionMs<0 || elapsedAtMs<=0 || now<elapsedAtMs || !speed.isFinite() || speed<0) return null
        val advanced=if(playing) ((now-elapsedAtMs)*speed).toLong() else 0L
        return (positionMs+advanced).coerceAtLeast(0).let { if(duration!=null && duration>0) it.coerceAtMost(duration) else it }
    }
}
object Lrc {
    private val timestamp=Regex("\\[(\\d{1,3}):([0-5]\\d)(?:[.:](\\d{1,3}))?]")
    private val offset=Regex("\\[offset:([+-]?\\d+)]",RegexOption.IGNORE_CASE)
    fun parse(text: String): List<LyricCue> {
        require(text.toByteArray(Charsets.UTF_8).size<=262144) { "LRC file is too large" }
        val fileOffset=offset.find(text)?.groupValues?.get(1)?.toLongOrNull()?.coerceIn(-600000,600000) ?: 0
        val cues=mutableListOf<LyricCue>()
        for(line in text.lineSequence().take(5000)) {
            val stamps=timestamp.findAll(line).toList()
            if(stamps.isEmpty()) continue
            val value=line.substring(stamps.last().range.last+1).trim().take(1000)
            for(stamp in stamps.take(20)) {
                val fraction=stamp.groupValues[3].padEnd(3,'0').take(3).toLong()
                val time=stamp.groupValues[1].toLong()*60000+stamp.groupValues[2].toLong()*1000+fraction-fileOffset
                cues.add(LyricCue(time.coerceAtLeast(0),value))
            }
        }
        return cues.groupBy { it.atMs }.toSortedMap().map { (time,entries) ->
            LyricCue(time,entries.map { it.text }.distinct().joinToString(" · "))
        }.take(10000)
    }
    fun select(cues: List<LyricCue>,positionMs: Long,offsetMs: Int): CuePair {
        val target=positionMs+offsetMs
        var low=0;var high=cues.lastIndex;var index=-1
        while(low<=high) {
            val mid=(low+high) ushr 1
            if(cues[mid].atMs<=target) { index=mid;low=mid+1 } else high=mid-1
        }
        return CuePair(cues.getOrNull(index)?.text ?: "",cues.getOrNull(index+1)?.text ?: "")
    }
}
