# CloudFusion Android (Flutter)

A lightweight **remote control** for the CloudFusion relay.

## Zero-local contract

This app **never** downloads remote file bytes to the device:

- no Android `DownloadManager`, no `path_provider` staging files, no cache writes
- no whole-file `bodyBytes` / `readAsBytes` on large payloads — the API is JSON-only
- persisted state = server URL + session cookie (two strings in SharedPreferences)
- remote transfers run server-side: `SOURCE → backend → Google Drive`; this UI receives ids, sizes, progress, speed, status, errors and quotas only
- lists are lazy + paginated; polling is ~2 s **only while transfers are live** and stops when idle/backgrounded (no wakelocks, no background isolates)

If Android kills the process, transfers keep running on the backend and the UI re-syncs on launch.

## Build

CI (recommended): see `../.github/workflows/android-apk.yml` — produces a debug APK artifact.

Local:

```bash
flutter pub get
dart format .
flutter analyze
flutter test
flutter build apk --debug --split-per-abi
```

Run against a dev relay: `flutter run`, then set the URL to your backend
(emulator → host machine: `http://10.0.2.2:3000`).

> The demo-session button authenticates the sandbox profile. Google sign-in
> (OAuth 2.0) is performed in the web console and binds to the same account.

## Layout

```
lib/
  main.dart        app shell, Pool / Transfers / Library tabs, adaptive polling
  api_client.dart  JSON-only client, cookie persistence, typed errors
  models.dart      Drive / PoolStats / TransferJob / LibraryItem + byte formatters
test/
  models_test.dart parsing invariants (progress fraction, reservation math)
```
