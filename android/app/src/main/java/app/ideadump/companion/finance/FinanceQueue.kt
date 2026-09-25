package app.ideadump.companion.finance

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "notification_uploads")
data class QueuedNotification(
    @PrimaryKey val eventId: String, val ownerId: String, val encryptedPayload: ByteArray,
    val createdAt: Long, val blockedStatus: Int? = null,
)
@Entity(tableName = "notification_receipts")
data class NotificationReceipt(@PrimaryKey val eventId: String, val seenAt: Long)

@Dao
interface QueueDao {
    @Query("SELECT * FROM notification_uploads ORDER BY createdAt LIMIT 1") suspend fun next(): QueuedNotification?
    @Query("SELECT COUNT(*) FROM notification_uploads") suspend fun count(): Int
    @Query("SELECT COUNT(*) FROM notification_uploads") fun observeCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM notification_uploads WHERE ownerId != :owner") suspend fun foreignCount(owner: String): Int
    @Query("SELECT * FROM notification_receipts WHERE eventId = :id") suspend fun receipt(id: String): NotificationReceipt?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(event: QueuedNotification)
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun remember(receipt: NotificationReceipt)
    @Query("DELETE FROM notification_receipts WHERE eventId NOT IN (SELECT eventId FROM notification_receipts ORDER BY seenAt DESC LIMIT 10000)") suspend fun trimReceipts()
    @Query("DELETE FROM notification_uploads WHERE eventId = :id") suspend fun remove(id: String)
    @Query("UPDATE notification_uploads SET blockedStatus = :status WHERE eventId = :id") suspend fun block(id: String,status: Int)
    @Query("UPDATE notification_uploads SET blockedStatus = NULL") suspend fun unblock()
    @Query("DELETE FROM notification_uploads") suspend fun discard()
}
@Database(entities = [QueuedNotification::class,NotificationReceipt::class],version = 1,exportSchema = true)
abstract class FinanceQueue : RoomDatabase() {
    abstract fun dao(): QueueDao
    companion object {
        fun create(context: Context) = Room.databaseBuilder(context,FinanceQueue::class.java,"finance-queue.db").build()
    }
    suspend fun enqueue(event: QueuedNotification): Boolean = withTransaction {
        if (dao().receipt(event.eventId) != null) return@withTransaction true
        if (dao().count() >= 1000) return@withTransaction false
        dao().insert(event)
        dao().remember(NotificationReceipt(event.eventId,event.createdAt))
        dao().trimReceipts()
        true
    }
}
