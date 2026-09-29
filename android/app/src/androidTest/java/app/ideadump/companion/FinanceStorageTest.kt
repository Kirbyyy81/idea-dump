package app.ideadump.companion

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.ideadump.companion.core.SecureVault
import app.ideadump.companion.finance.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import javax.crypto.AEADBadTagException

@RunWith(AndroidJUnit4::class)
class FinanceStorageTest {
    private val context=ApplicationProvider.getApplicationContext<Context>()
    @Test fun encryptedPayloadUsesFreshNoncesAndBindsOwner() {
        val vault=SecureVault(context)
        val text="Synthetic transfer RM 12.30"
        val first=vault.encrypt(text,"event:owner-one")
        val second=vault.encrypt(text,"event:owner-one")
        assertFalse(first.contentEquals(second))
        assertFalse(first.toString(Charsets.UTF_8).contains(text))
        assertEquals(text,vault.decrypt(first,"event:owner-one"))
        assertThrows(AEADBadTagException::class.java) { vault.decrypt(first,"event:owner-two") }
        val key="test-"+UUID.randomUUID()
        try {
            vault.write(key,text)
            assertEquals(text,vault.read(key))
            assertFalse(context.getSharedPreferences("companion_secrets",Context.MODE_PRIVATE).getString(key,"")!!.contains(text))
        } finally { vault.write(key,null) }
    }
    @Test fun queueSurvivesRestartDeduplicatesAndKeepsOwner() = runBlocking {
        val name="queue-test-"+UUID.randomUUID()+".db"
        var db=Room.databaseBuilder(context,FinanceQueue::class.java,name).build()
        val vault=SecureVault(context)
        val event=QueuedNotification("event","owner-one",vault.encrypt("synthetic","event:owner-one"),1L)
        try {
            assertTrue(db.enqueue(event))
            assertTrue(db.enqueue(event.copy(encryptedPayload=vault.encrypt("changed","event:owner-one"))))
            assertEquals(1,db.dao().count())
            db.close()
            db=Room.databaseBuilder(context,FinanceQueue::class.java,name).build()
            assertEquals("synthetic",vault.decrypt(db.dao().next()!!.encryptedPayload,"event:owner-one"))
            assertEquals(1,db.dao().foreignCount("owner-two"))
            assertEquals(0,db.dao().foreignCount("owner-one"))
            db.dao().remove("event")
            assertTrue(db.enqueue(event))
            assertEquals(0,db.dao().count())
        } finally { db.close();context.deleteDatabase(name) }
    }
    @Test fun fullQueueStopsWithoutDeletingOldEvents() = runBlocking {
        val db=Room.inMemoryDatabaseBuilder(context,FinanceQueue::class.java).build()
        try {
            repeat(1000) { db.dao().insert(QueuedNotification("event-$it","owner",byteArrayOf(1,2,3),it.toLong())) }
            assertFalse(db.enqueue(QueuedNotification("overflow","owner",byteArrayOf(4),1001)))
            assertEquals(1000,db.dao().count())
            assertEquals("event-0",db.dao().next()!!.eventId)
            db.dao().block("event-0",422)
            assertEquals(422,db.dao().next()!!.blockedStatus)
            db.dao().unblock()
            assertNull(db.dao().next()!!.blockedStatus)
        } finally { db.close() }
    }
}
