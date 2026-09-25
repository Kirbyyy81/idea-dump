package app.ideadump.companion.finance

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.ideadump.companion.CompanionApplication
import kotlinx.coroutines.CancellationException

class FinanceUploadWorker(context: Context,parameters: WorkerParameters): CoroutineWorker(context,parameters) {
    override suspend fun doWork(): Result {
        val finance=(applicationContext as CompanionApplication).finance
        return try { if(finance.upload()) Result.retry() else Result.success() }
        catch(cancelled: CancellationException) { throw cancelled }
        catch(_: Exception) { finance.reportFailure();Result.failure() }
    }
}
