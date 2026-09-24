package app.ideadump.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.ideadump.companion.ui.CompanionTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CompanionTheme {
                Scaffold { padding ->
                    Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("IdeaDump Companion", style = MaterialTheme.typography.headlineMedium)
                        Text("Connect Android features to IdeaDump.")
                        OutlinedButton(onClick = { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) {
                            Text("Notification access")
                        }
                        Button(onClick = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.IDEADUMP_ORIGIN))) }) {
                            Text("Open IdeaDump")
                        }
                    }
                }
            }
        }
    }
}
