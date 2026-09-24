# Android Companion Guide

- Apply the repository guide and this guide to android/.
- Keep Kotlin domain types in their native owning feature. Web domain types remain in lib/types.ts.
- Use the checked-in Gradle wrapper, JDK 17 or 21, SDK 36, and pinned dependencies.
- Run ./gradlew :app:lintDebug :app:testDebugUnitTest :app:assembleDebug before handing off Android changes (gradlew.bat on Windows).
- Keep Finance and Lyrics data, network clients, storage, and failures isolated.
- Never commit local.properties, credentials, signing keys, build output, or captured bank notifications.
- Use Android Keystore for secrets and notification-payload encryption. Never log notification text or tokens.
- Preserve Spotify audio focus. Do not synthesize audio to keep the car service alive.
- Treat hardware two-field validation and UOB examples as explicit outstanding acceptance work.
- Commit completed, checked feature slices throughout implementation.
- Update this guide and README.md when build, architecture, or validation changes.
