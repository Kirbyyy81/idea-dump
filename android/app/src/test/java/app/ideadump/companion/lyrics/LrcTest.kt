package app.ideadump.companion.lyrics

import org.junit.Assert.*
import org.junit.Test

class LrcTest {
    @Test fun timingBoundariesSeekingAndUnicode() {
        val cues=Lrc.parse("[ar:artist]\n[00:01.50]你好\n[00:03.00]안녕\n[00:05.000]こんにちは")
        assertEquals(CuePair("","你好"),Lrc.select(cues,1499,0))
        assertEquals(CuePair("你好","안녕"),Lrc.select(cues,1500,0))
        assertEquals(CuePair("こんにちは",""),Lrc.select(cues,10000,0))
        assertEquals(CuePair("你好","안녕"),Lrc.select(cues,1500,0))
    }
    @Test fun duplicateTimestampsAreOneCue() {
        val cues=Lrc.parse("[00:01.0][00:02.0]repeat\n[00:01.000]repeat\n[00:01]same time\n[00:03]next")
        assertEquals(3,cues.size)
        assertEquals(CuePair("repeat · same time","repeat"),Lrc.select(cues,1000,0))
    }
    @Test fun offsetsAndBlankCue() {
        val cues=Lrc.parse("[offset:100]\n[00:01]line\n[00:02]\n[00:03]next")
        assertEquals(900L,cues.first().atMs)
        assertEquals("line",Lrc.select(cues,800,100).current)
        assertEquals("",Lrc.select(cues,900,-100).current)
        assertEquals(CuePair("","next"),Lrc.select(cues,1900,0))
    }
    @Test fun invalidAndUntimedInput() {
        assertTrue(Lrc.parse("[ar:artist]\nplain text\n[00:99]invalid").isEmpty())
        assertThrows(IllegalArgumentException::class.java) { Lrc.parse("x".repeat(262145)) }
    }
    @Test fun pauseSpeedDurationAndInvalidAnchors() {
        assertEquals(5000L,PlaybackAnchor(1000,1000,2f,true).position(3000,10000))
        assertEquals(1000L,PlaybackAnchor(1000,1000,2f,false).position(3000,10000))
        assertEquals(2000L,PlaybackAnchor(1000,1000,2f,true).position(3000,2000))
        assertNull(PlaybackAnchor(-1,1000,1f,true).position(3000,null))
        assertNull(PlaybackAnchor(0,0,1f,true).position(3000,null))
        assertNull(PlaybackAnchor(0,1000,Float.NaN,true).position(3000,null))
    }
}
