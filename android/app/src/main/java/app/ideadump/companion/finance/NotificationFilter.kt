package app.ideadump.companion.finance

import app.ideadump.companion.core.CompanionSettings
import java.security.MessageDigest
import java.util.UUID

object NotificationFilter {
    private val sensitive = Regex("\\b(otp|tac|one[- ]time (password|passcode)|verification code|security code|authentication code)\\b|sensitive (content|notification) (hidden|redacted)",RegexOption.IGNORE_CASE)
    private val irrelevant = Regex("\\b(cashback offer|promotion|promo code|special offer|payment reminder|payment due|unsuccessful|failed|declined|cancelled)\\b",RegexOption.IGNORE_CASE)
    private val transaction = Regex("\\b(transferred|sent|paid|payment|received|credited|debited|purchase|withdrawal|refund)\\b",RegexOption.IGNORE_CASE)
    private val amount = Regex("(RM|MYR)\\s*(\\d{1,3}(,\\d{3})+|\\d+)\\.\\d{2}(?![\\d.])",RegexOption.IGNORE_CASE)
    fun accepts(pkg: String, title: String?, body: String, subtext: String?, summary: Boolean): Boolean {
        if (summary || pkg !in setOf(CompanionSettings.RYT,CompanionSettings.TNG) ||
            body.isBlank() || body.length > 8192 || (title?.length ?: 0) > 1024 || (subtext?.length ?: 0) > 1024) return false
        val combined = listOfNotNull(title,body,subtext).joinToString("\n")
        return !combined.contains('\u0000') && !sensitive.containsMatchIn(combined) &&
            !irrelevant.containsMatchIn(combined) && transaction.containsMatchIn(combined) && amount.containsMatchIn(combined)
    }
    fun hash(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    fun eventId(pkg: String, key: String, postedAt: Long): String =
        UUID.nameUUIDFromBytes("$pkg|$key|$postedAt".toByteArray(Charsets.UTF_8)).toString()
}
