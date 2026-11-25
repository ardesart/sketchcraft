# Android (tablets, for now)

SketchCraft builds for Android with Tauri 2: the same engine, running inside the app as on a computer, and the
same web interface in Android's WebView. **Tablets come first**: the interface is the desktop one, which fits a
10–13" tablet (about 1280×800 and up). A phone needs its own touch-first interface; that is a separate project
(ROADMAP.md, "Phone and tablet"). Builds are a debug APK for now, shared on GitHub; a store listing comes later.

## What is different on Android

- **Where the model lives**: the app's private data folder (`app_data_dir()/live.sketchcraft`), not
  `~/Documents/SketchCraft` (`doc_for` in `app/src-tauri/src/lib.rs`). `$SKETCHCRAFT_DOC` still wins.
- **No self-update**: the updater plugin is desktop-only (a `cfg(desktop)` plugin, a desktop-only dependency in
  `app/src-tauri/Cargo.toml`, and the `default` capability lists only macOS, Windows and Linux; Android uses the
  `mobile` capability). The update card says new versions come as a new APK (`onMobileApp` in `app/src/engine.ts`).
- **Touch** (`app/src/touch.ts`, wired in `Viewport.tsx`): one finger is the tool, like the left mouse button
  (a tap is a move there plus a click, since a finger has no hover); two fingers orbit, and pinching zooms; with
  Orbit or Pan picked, one finger orbits or pans. A second finger landing cancels whatever the first had just
  started, but not an operation that was already under way.
- **Screen edges**: `MainActivity.kt` pads the app by the status bar, navigation bar and camera cutout in every
  orientation (the WebView alone reports only the cutout).
- **Large screens only** in the manifest (`<supports-screens>`): stores hide the app from phones; an APK installed
  by hand still runs anywhere.
- **Icon**: the beaver on the brand violet, from `brand/android-icon-1024.png`
  (`npx tauri icon ../brand/android-icon-1024.png -o <tmp>`, then copy only `android/*` into
  `app/src-tauri/gen/android/app/src/main/res/`, so the desktop icons stay as they are).

`app/src-tauri/gen/android` is the generated Android Studio project. It is tracked (we edit the manifest,
`MainActivity.kt` and the icons); its `build/` output is not.

## Setting up a Mac

1. Java 17 (`brew install openjdk@17`), and the Android command-line tools and platform tools
   (`brew install --cask android-commandlinetools android-platform-tools`).
2. The NDK: `sdkmanager --sdk_root=$HOME/Library/Android/sdk "ndk;27.3.13750724"` (r27, the LTS).
3. Rust's Android targets: `rustup target add aarch64-linux-android` (run in the repo, so it lands on the
   pinned toolchain; `tauri android init` adds the other three).
4. Every build needs:

   ```sh
   export PATH="$HOME/.cargo/bin:$PATH"      # rustup's cargo first: Homebrew's Rust can't build for Android
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export NDK_HOME="$ANDROID_HOME/ndk/27.3.13750724"
   export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
   ```

   If Homebrew's `rust` is installed, it sits before `~/.cargo/bin` in `PATH`; it has the same version but only
   the macOS standard library, so the Android build fails with "can't find crate for `core`".

## Building and running

```sh
cd app
CARGO_PROFILE_DEV_DEBUG=false npx tauri android build --debug --apk --target aarch64
# → app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk (about 50 MB)
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

`CARGO_PROFILE_DEV_DEBUG=false` leaves out debug symbols: the build is several GB smaller and runs the same.
The first build compiles the whole engine for ARM (about 10 minutes); later ones take a minute or two.

If Kotlin suddenly can't find AndroidX classes (`Unresolved reference 'activity'`, `Cannot access
'AppCompatActivity'`) after a build was interrupted, Gradle's state is stale:
`./gradlew --stop` in `gen/android`, delete `gen/android/{app/build,build,.gradle,buildSrc/build,buildSrc/.gradle}`,
build again.

### A device

Wireless debugging on the device: **Settings › Developer options › Wireless debugging**, then
**Pair device with pairing code**. `adb mdns services` shows the pairing address on the same network;
`adb pair <address> <code>`, then `adb connect` to the address the same screen shows at the top.

### The emulator (a tablet)

```sh
sdkmanager --sdk_root=$ANDROID_HOME "emulator" "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n sketchcraft-tablet -k "system-images;android-36;google_apis;arm64-v8a"
$ANDROID_HOME/emulator/emulator -avd sketchcraft-tablet -no-snapshot -no-boot-anim -no-audio &
adb shell wm size 1600x2560 && adb shell wm density 320      # a 2560×1600 tablet (Pixel Tablet)
adb shell cmd window user-rotation lock 1                    # landscape
adb shell svc power stayon true                              # the screen never sleeps
```

The emulator needs about 7 GB free for its storage (set `disk.dataPartition.size` lower in the AVD's
`config.ini` if space is short). `adb shell input tap` and `input swipe` drive one finger; two-finger gestures
need a real touchscreen.
