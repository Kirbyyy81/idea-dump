# IdeaDump Android Companion

Native companion for PRD 13. Minimum Android 13 (API 33); compile/target API 36.

## Build

Install Android SDK platform 36 and use JDK 17 or 21. Set ANDROID_HOME to the SDK directory, or put sdk.dir in an untracked local.properties file.

Run from this directory:

```powershell
.\gradlew.bat :app:lintDebug :app:testDebugUnitTest :app:assembleDebug
```

On Linux/macOS use ./gradlew with the same tasks. The debug APK is app/build/outputs/apk/debug/app-debug.apk.

The HTTPS web origin defaults to the repository's production origin. Override it with -PcompanionOrigin=https://your-preview.example when testing a compatible backend. No server secret belongs in the APK.

## Acceptance

Automated builds do not establish physical acceptance. Test Android 13 and Android 16, and verify Spotify audio continuity and two distinct lyric fields on the actual Android Auto head unit. UOB remains disabled until its notification sample is validated.

Debug APKs are for sideload testing. Preserve signing keys outside Git and choose production signing/deployment separately.
