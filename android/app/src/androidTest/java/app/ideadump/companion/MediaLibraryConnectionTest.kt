package app.ideadump.companion

import android.content.ComponentName
import android.media.browse.MediaBrowser as PlatformBrowser
import androidx.media3.session.MediaBrowser
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.SessionToken
import androidx.test.platform.app.InstrumentationRegistry
import app.ideadump.companion.lyrics.LyricsMediaService
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class MediaLibraryConnectionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    @Test fun platformBrowserReceivesRootChildren() {
        val connected = CountDownLatch(1)
        val loaded = CountDownLatch(1)
        var connectionFailed = false
        var items: List<PlatformBrowser.MediaItem>? = null
        lateinit var browser: PlatformBrowser
        instrumentation.runOnMainSync {
            browser = PlatformBrowser(context, ComponentName(context, LyricsMediaService::class.java),
                object : PlatformBrowser.ConnectionCallback() {
                    override fun onConnected() { connected.countDown() }
                    override fun onConnectionFailed() { connectionFailed = true; connected.countDown() }
                }, null)
            browser.connect()
        }
        try {
            assertTrue("Browser connection timed out", connected.await(10, TimeUnit.SECONDS))
            assertFalse("Browser connection rejected", connectionFailed)
            instrumentation.runOnMainSync {
                browser.subscribe(browser.root, object : PlatformBrowser.SubscriptionCallback() {
                    override fun onChildrenLoaded(parentId: String, children: MutableList<PlatformBrowser.MediaItem>) {
                        items = children; loaded.countDown()
                    }
                    override fun onError(parentId: String) { loaded.countDown() }
                })
            }
            assertTrue("Root children never arrived", loaded.await(5, TimeUnit.SECONDS))
            assertEquals("spotify", items?.singleOrNull()?.mediaId)
        } finally { instrumentation.runOnMainSync { browser.disconnect() } }
    }

    @Test fun media3SubscriptionAnnouncesContent() {
        val changed = CountDownLatch(1)
        lateinit var connection: ListenableFuture<MediaBrowser>
        instrumentation.runOnMainSync {
            connection = MediaBrowser.Builder(context, SessionToken(context, ComponentName(context, LyricsMediaService::class.java)))
                .setListener(object : MediaBrowser.Listener {
                    override fun onChildrenChanged(browser: MediaBrowser, parentId: String, itemCount: Int, params: LibraryParams?) {
                        if (parentId == "root" && itemCount > 0) changed.countDown()
                    }
                }).buildAsync()
        }
        val browser = connection.get(10, TimeUnit.SECONDS)
        try {
            lateinit var subscribed: ListenableFuture<*>
            instrumentation.runOnMainSync { subscribed = browser.subscribe("root", null) }
            subscribed.get(5, TimeUnit.SECONDS)
            assertTrue("Subscription succeeded but content was never announced", changed.await(5, TimeUnit.SECONDS))
        } finally { instrumentation.runOnMainSync { browser.release() } }
    }
}
