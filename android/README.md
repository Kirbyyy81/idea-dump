# IdeaDump Android Companion

Native companion for [PRD 013](../document/prd/PRD_013.md). Minimum Android 13 (API 33); compile/target API 36.

## Build and install

Use JDK 17 or 21 and Android SDK platform 36. Set `ANDROID_HOME`, or put `sdk.dir` in an untracked `local.properties`. Run from this directory:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
adb devices
adb -s YOUR_DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
```

On Linux/macOS use `./gradlew`. The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. It is signed for sideload testing. Production signing and distribution are separate rollout tasks; keep signing keys outside Git.

The HTTPS origin defaults to `https://idea-dump-alpha.vercel.app`. For a compatible preview deployment, add `-PcompanionOrigin=https://your-preview.example` to Gradle. The origin must match the web application's `APP_ORIGIN`. No server secret belongs in the APK. Finance pairing requires the web changes and all migrations in [the rollout guide](../document/ANDROID_COMPANION.md).

## Download from GitHub

Android Studio is not needed to install a prebuilt APK.

1. Sign in to GitHub and open [the validation runs](https://github.com/Kirbyyy81/idea-dump/actions/workflows/validate.yml?query=branch%3Afeat%2Fandroid-companion-app).
2. Open the latest successful run for this branch and find **Artifacts**.
3. Download **ideadump-companion-debug** and extract the ZIP.
4. On an Android 13 or newer phone, open **app-debug.apk**. Allow installation from that browser or file manager if Android asks, then install.

GitHub requires a signed-in account with repository read access to download workflow artifacts. See [GitHub's download instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).

Each build is a debug APK. Stable release signing is not configured, so APKs built on different machines or CI runs may not install as updates over each other. Do not uninstall an existing installation with pending uploads just to bypass a signing mismatch.

Finance pairing still requires the companion backend and migrations at the configured origin.

## Use

- **Home:** grant notification access and enable Lyrics and Finance independently. Both start disabled.
- **Lyrics:** play a song in Spotify, enable Lyrics, then open the companion in Android Auto. LRCLIB receives track metadata only. Local LRC import asks you to confirm the current track; downloaded results are cached. Timing controls move cues earlier or later in 100 ms steps, up to five seconds.
- **Finance:** connect through your signed-in browser, compare the displayed code, and approve. Select one owned IdeaDump source for each enabled Ryt/TNG app, then enable capture. UOB remains disabled until its real notification sample is validated.
- **Uploads:** pending uploads counts events on this phone waiting for durable server acceptance. Finance Review is a separate backlog in the PWA. Pausing capture also pauses uploads. A full queue pauses new capture while existing uploads continue. Discarding the queue requires explicit confirmation.
- **Diagnostics:** inspect permissions, connectivity, playback timing, and upload status. Notification text and credentials are excluded.

Review and source management open the existing PWA or system browser. The companion has no WebView or native ledger. Account changes cannot reassign existing queued events.

## Architecture

`core/` owns encrypted preferences, settings, and the notification listener. `finance/` owns the encrypted Room queue, scoped API client, pairing, and WorkManager retries. `lyrics/` owns Spotify session observation, LRCLIB/local storage, timed cues, and the Media3 media-library proxy.

Spotify remains the audio source. The proxy publishes current/next cues in separate metadata fields and forwards supported controls. It does not create an audio player or request audio focus. Car catalog voice search is unsupported.

Finance notification payloads use Android Keystore AES-GCM with event/owner binding. Uploads retain stable event IDs across retries. The queue holds at most 1,000 events and never evicts older unsent events. Cloud backup and device transfer exclude companion data.

## Tests on a connected phone

Unlock the phone and authorize USB debugging. Use its explicit serial to avoid accidentally targeting an emulator or another phone:

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
adb -s YOUR_DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
adb -s YOUR_DEVICE_SERIAL install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s YOUR_DEVICE_SERIAL shell am instrument -w -r app.ideadump.companion.test/androidx.test.runner.AndroidJUnitRunner
```

Unit tests cover filtering, stable identities, Unicode LRC parsing, offsets, cue selection, and playback anchors. Device tests cover real Keystore encryption, queue reopening/deduplication/capacity, distinct media fields, transport forwarding, and screen controls. Storage tests use disposable test databases and synthetic events. The screen test leaves capture disabled and the timing offset at zero; use an unpaired test installation.

The GitHub validation job runs native unit tests, lint, and debug assembly, and uploads the debug APK. Instrumentation runs separately on the selected phone.

## Physical acceptance still required

Builds and synthetic device tests do not establish car compatibility. Record the Android Auto version, head unit, phone, and connection type when testing:

1. Verify Spotify keeps playing with the companion selected and both lyric fields remain usable.
2. Exercise pause, resume, skips, seeks, long lines, and English/Chinese/Korean/Japanese text.
3. On Android 13 and 16, test screen-off playback, permission revocation, process recreation, and battery management.
4. Against a deployed compatible backend, pair and test Ryt/TNG capture, offline recovery, revocation, and PWA review through confirmation/rejection/duplicate resolution.
5. Validate a sanitized UOB sample before enabling that package.

Current evidence and remaining acceptance work are recorded in [the rollout guide](../document/ANDROID_COMPANION.md).
