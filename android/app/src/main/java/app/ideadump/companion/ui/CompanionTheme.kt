package app.ideadump.companion.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val colors = lightColorScheme(
    primary = Color(0xFF191917), onPrimary = Color(0xFFFFFDF6),
    background = Color(0xFFF3ECD9), surface = Color(0xFFFFFDF6),
    onSurface = Color(0xFF1B1B18), onBackground = Color(0xFF1B1B18),
    outline = Color(0xFFD7D0C1), outlineVariant = Color(0xFFD7D0C1),
    secondary = Color(0xFF191917), onSecondary = Color(0xFFFFFDF6), secondaryContainer = Color(0xFFDFE8C2),
    tertiaryContainer = Color(0xFFFAE0EE), error = Color(0xFF9A3838),
)

@Composable
fun CompanionTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
