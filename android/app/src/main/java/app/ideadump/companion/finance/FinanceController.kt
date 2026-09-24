package app.ideadump.companion.finance

import android.content.Context
import androidx.work.*
import app.ideadump.companion.core.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.security.SecureRandom
import java.time.Instant
import java.util.concurrent.TimeUnit

data class DeviceCredential(val token: String,val deviceId: String,val userId: String)
data class FinanceSource(val id: String,val name: String)
data class FinanceState(
    val connected: Boolean = false,val userId: String? = null,val pending: Int = 0,
    val message: String = "Not connected",val pairingCode: String? = null,val pairingUri: String? = null,
    val sources: List<FinanceSource> = emptyList(),val lastUpload: String? = null,
)
class FinanceController(
    private val context: Context,private val settings: CompanionSettings,
    private val vault: SecureVault,val queue: FinanceQueue,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val api = FinanceApi()
    private val mutex = Mutex()
    val state = MutableStateFlow(FinanceState())
    init {
        scope.launch {
            queue.dao().observeCount().collect { count -> state.update { it.copy(pending=count) } }
        }
        scope.launch {
            runCatching {
                val credential = credential()
                state.update { it.copy(connected=credential!=null,userId=credential?.userId,message=if(credential==null) "Not connected" else "Connected",lastUpload=vault.read("last-upload")) }
                vault.read("pairing")?.let { pending ->
                    val item=JSONObject(pending)
                    state.update { it.copy(pairingCode=item.optString("user_code").ifBlank { null },pairingUri=item.optString("verification_uri").ifBlank { null },message="Pairing in progress") }
                }
                if(credential!=null) schedule()
            }.onFailure { state.update { it.copy(message="Secure storage is unavailable. Reconnect or discard the local queue to recover.") } }
        }
    }
    fun credential(): DeviceCredential? = vault.read("device")?.let {
        val data=JSONObject(it);DeviceCredential(data.getString("token"),data.getString("device_id"),data.getString("user_id"))
    }
    private fun secret(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    suspend fun beginPairing() = mutex.withLock {
        settings.finance(false)
        val pending=JSONObject().put("verifier",secret()).put("token","idc_"+secret())
        vault.write("pairing",pending.toString())
        val response=api.request("/api/companion/pair","POST",JSONObject()
            .put("verifier_hash",NotificationFilter.hash(pending.getString("verifier")))
            .put("device_label","Android "+android.os.Build.VERSION.RELEASE+" "+android.os.Build.MODEL.take(50)))
        for(key in listOf("id","user_code","verification_uri","expires_at")) pending.put(key,response.getString(key))
        val uri=java.net.URI(pending.getString("verification_uri"))
        val origin=java.net.URI(app.ideadump.companion.BuildConfig.IDEADUMP_ORIGIN)
        check(uri.scheme==origin.scheme && uri.authority==origin.authority && uri.path=="/companion/pair") { "Unexpected pairing address" }
        vault.write("pairing",pending.toString())
        state.update { it.copy(pairingCode=pending.getString("user_code"),pairingUri=uri.toString(),message="Approve this code in your browser") }
    }
    suspend fun finishPairing(): Boolean = mutex.withLock {
        val pending=vault.read("pairing")?.let(::JSONObject) ?: return@withLock false
        if(!pending.has("id")) { state.update { it.copy(message="Start pairing again") };return@withLock false }
        val response=api.request("/api/companion/pair/complete","POST",JSONObject().put("id",pending.getString("id"))
            .put("verifier",pending.getString("verifier")).put("token",pending.getString("token")))
        if(response.optString("status")!="paired") return@withLock false
        val user=response.getString("user_id")
        val previous=vault.read("owner")
        if(previous!=user) settings.clearMappings()
        vault.write("device",response.put("token",pending.getString("token")).toString())
        vault.write("owner",user)
        vault.write("pairing",null)
        val mismatch=queue.dao().foreignCount(user)>0
        state.update { it.copy(connected=true,userId=user,pairingCode=null,pairingUri=null,
            message=if(mismatch) "Queued events belong to another account. Reconnect that account or discard them." else "Connected. Choose apps and sources before enabling capture.") }
        true
    }
    suspend fun cancelPairing() {
        vault.write("pairing",null)
        state.update { it.copy(pairingCode=null,pairingUri=null,message=if(it.connected) "Connected" else "Not connected") }
    }
    suspend fun refreshSources() {
        val device=credential() ?: return
        val result=api.request("/api/companion/finance-sources",token=device.token).getJSONArray("data")
        val sources=(0 until result.length()).map { result.getJSONObject(it).let { item -> FinanceSource(item.getString("id"),item.getString("name")) } }
        state.update { it.copy(sources=sources) }
    }
    suspend fun setEnabled(enabled: Boolean) {
        if(enabled) {
            val device=credential() ?: error("Connect your account first")
            check(queue.dao().foreignCount(device.userId)==0) { "Queued events belong to another account" }
            check(queue.dao().count()<1000) { "Queue is full. Upload or discard queued events first." }
            check(settings.flow.first().mappings.isNotEmpty()) { "Choose at least one app and source" }
            check(androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)) { "Grant notification access first" }
        }
        settings.finance(enabled)
        if(enabled) schedule() else WorkManager.getInstance(context).cancelUniqueWork("finance-upload")
        state.update { it.copy(message=if(enabled) "Capture enabled" else "Capture and uploads paused") }
    }
    suspend fun capture(pkg: String,key: String,postedAt: Long,title: String?,body: String,subtext: String?,summary: Boolean) {
        if(!NotificationFilter.accepts(pkg,title,body,subtext,summary)) return
        val config=settings.flow.first()
        if(!config.financeEnabled) return
        val source=config.mappings[pkg] ?: return
        val device=credential() ?: return
        if(queue.dao().foreignCount(device.userId)>0) return
        val eventId=NotificationFilter.eventId(pkg,key,postedAt)
        val capturedAt=System.currentTimeMillis()
        val payload=JSONObject().put("client_event_id",eventId).put("source_id",source).put("source_package",pkg)
            .put("captured_at",Instant.ofEpochMilli(capturedAt).toString()).put("notification_key_hash",NotificationFilter.hash("$pkg|$key|$postedAt"))
            .put("notification",JSONObject().put("title",title?:JSONObject.NULL).put("text",body).put("subtext",subtext?:JSONObject.NULL).put("posted_at",Instant.ofEpochMilli(postedAt).toString()))
        if(!queue.enqueue(QueuedNotification(eventId,device.userId,vault.encrypt(payload.toString(),"$eventId:${device.userId}"),capturedAt))) {
            settings.finance(false)
            state.update { it.copy(message="Queue full (1000). Capture stopped. Upload or discard events before enabling it again.") }
            return
        }
        schedule()
    }
    fun schedule() {
        WorkManager.getInstance(context).enqueueUniqueWork("finance-upload",ExistingWorkPolicy.APPEND_OR_REPLACE,
            OneTimeWorkRequestBuilder<FinanceUploadWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build())
    }
    suspend fun upload(): Boolean = mutex.withLock {
        repeat(1000) {
            if(!settings.flow.first().financeEnabled) return@withLock false
            val device=credential() ?: return@withLock false
            val item=queue.dao().next() ?: return@withLock false
            if(item.ownerId!=device.userId) { state.update { it.copy(message="Queued events belong to another account") };return@withLock false }
            if(item.blockedStatus!=null) { state.update { it.copy(message="An upload needs attention (${item.blockedStatus}). Check sources, retry, or discard queued events.") };return@withLock false }
            try {
                val body=JSONObject(vault.decrypt(item.encryptedPayload,"${item.eventId}:${item.ownerId}"))
                api.request("/api/companion/notifications","POST",body,device.token)
                queue.dao().remove(item.eventId)
                val time=Instant.now().toString()
                vault.write("last-upload",time)
                state.update { it.copy(lastUpload=time,message="Uploads accepted") }
            } catch(failure: FinanceHttpFailure) {
                if(failure.status==401 || failure.status==403) {
                    settings.finance(false)
                    state.update { it.copy(message="Connection needs renewal. Reconnect your account.",connected=false) }
                    return@withLock false
                }
                if(failure.status==429 || failure.status>=500) { state.update { it.copy(message="Server unavailable. Uploads will retry.") };return@withLock true }
                queue.dao().block(item.eventId,failure.status)
                state.update { it.copy(message="Upload needs attention (${failure.status}). Check sources or discard queued events.") }
                return@withLock false
            } catch(_: java.io.IOException) { state.update { it.copy(message="Offline. Uploads will retry.") };return@withLock true }
        }
        true
    }
    suspend fun retry() { queue.dao().unblock();schedule() }
    suspend fun discard() = mutex.withLock { queue.dao().discard();state.update { it.copy(message="Queued notifications discarded") } }
    suspend fun disconnect() = mutex.withLock {
        settings.finance(false)
        WorkManager.getInstance(context).cancelUniqueWork("finance-upload")
        val device=credential()
        val revoked=device==null || runCatching { api.request("/api/companion/devices/${device.deviceId}","DELETE",token=device.token) }.isSuccess
        vault.write("device",null);vault.write("pairing",null)
        state.update { it.copy(connected=false,pairingCode=null,pairingUri=null,sources=emptyList(),
            message=if(revoked) "Disconnected. Queued notifications kept." else "Disconnected locally. Revoke this device in Finance settings when online.") }
    }
    fun reportFailure() { state.update { it.copy(message="Finance operation failed. Your queued events are kept.") } }
}
