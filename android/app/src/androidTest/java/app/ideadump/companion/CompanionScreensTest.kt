package app.ideadump.companion

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test

class CompanionScreensTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun financeIsOptInUobIsDisabledAndOffsetControlsPersist() {
        val app=compose.activity.application as CompanionApplication
        runBlocking { app.settings.offset(0);app.settings.finance(false) }
        compose.onNodeWithText("Finance").performClick()
        compose.onNodeWithText("Awaiting notification sample").assertExists()
        compose.onNodeWithContentDescription("UOB notification capture").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Capture notifications").assertIsOff()
        compose.onNodeWithText("Lyrics").performClick()
        compose.onNodeWithText("Earlier").performScrollTo().performClick()
        compose.waitUntil(5000) { compose.onAllNodesWithText("100 ms earlier").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("100 ms earlier").assertIsDisplayed()
        compose.onNodeWithText("Later").performClick()
        compose.waitUntil(5000) { compose.onAllNodesWithText("No timing offset").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("No timing offset").assertIsDisplayed()
    }
}
