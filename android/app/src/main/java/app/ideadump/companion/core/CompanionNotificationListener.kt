package app.ideadump.companion.core

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import app.ideadump.companion.CompanionApplication
import kotlinx.coroutines.*

class CompanionNotificationListener : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val app=application as CompanionApplication
        val settings=app.snapshot.value
        if(!settings.financeEnabled || sbn.packageName !in settings.mappings) return
        if(sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val extras=sbn.notification.extras
        val body=(extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: return
        val title=extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val subtext=extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
        scope.launch {
            try { app.finance.capture(sbn.packageName,sbn.key,sbn.postTime,title,body,subtext,false) }
            catch(cancelled: CancellationException) { throw cancelled }
            catch(_: Exception) { app.finance.reportFailure() }
        }
    }
    override fun onDestroy() { scope.cancel();super.onDestroy() }
}
