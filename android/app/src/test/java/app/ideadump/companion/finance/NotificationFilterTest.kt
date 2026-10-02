package app.ideadump.companion.finance

import app.ideadump.companion.core.CompanionSettings
import org.junit.Assert.*
import org.junit.Test

class NotificationFilterTest {
    @Test fun supportedExamples() {
        assertTrue(NotificationFilter.accepts(CompanionSettings.TNG,"TNG","陳 has transferred RM 12.30 to you. Tap here to check the transaction details",null,false))
        assertTrue(NotificationFilter.accepts(CompanionSettings.RYT,null,"You've sent RM 12.30 to Alex on 25 Sep 2026, 1:25pm (GMT+8) using your main account",null,false))
    }
    @Test fun excludesPrivateAndUnrelatedContent() {
        for(body in listOf("OTP 123456 for payment RM 12.30","Your TAC is 123456. Sent RM 12.30","Payment RM 12.30 failed","Special offer payment RM 12.30","Available balance RM 12.30","Sensitive content hidden")) {
            assertFalse(body,NotificationFilter.accepts(CompanionSettings.TNG,null,body,null,false))
        }
        assertFalse(NotificationFilter.accepts(CompanionSettings.UOB,null,"Payment RM 12.30",null,false))
        assertFalse(NotificationFilter.accepts("com.spotify.music",null,"Payment RM 12.30",null,false))
        assertFalse(NotificationFilter.accepts(CompanionSettings.TNG,null,"Payment RM 12.30",null,true))
        assertFalse(NotificationFilter.accepts(CompanionSettings.TNG,null,"Payment RM 12.30"+"a".repeat(8192),null,false))
    }
    @Test fun stableIdentityAndPackageIsolation() {
        assertEquals(NotificationFilter.eventId("tng","key",1),NotificationFilter.eventId("tng","key",1))
        assertNotEquals(NotificationFilter.eventId("tng","key",1),NotificationFilter.eventId("ryt","key",1))
        assertNotEquals(NotificationFilter.eventId("tng","key",1),NotificationFilter.eventId("tng","key",2))
        assertEquals(64,NotificationFilter.hash("secret").length)
    }
}
