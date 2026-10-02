package app.ideadump.companion.finance

import app.ideadump.companion.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class FinanceHttpFailure(val status: Int) : Exception("Finance request failed ($status)")
class FinanceApi {
    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null, token: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(path.startsWith("/api/companion/") && !path.contains(".."))
        val connection = URL(BuildConfig.IDEADUMP_ORIGIN + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Accept", "application/json")
            token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            body?.let {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type","application/json")
                connection.outputStream.use { stream -> stream.write(it.toString().toByteArray(Charsets.UTF_8)) }
            }
            if (connection.responseCode !in 200..299) throw FinanceHttpFailure(connection.responseCode)
            val bytes = connection.inputStream.use { it.readNBytes(131_073) }
            check(bytes.size <= 131_072) { "Finance response is too large" }
            JSONObject(bytes.toString(Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
}
