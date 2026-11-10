# Android

Moggcord Mobile targets Android 9 and later and the bridgeless React Native version of Discord. The APK built here is a module that loads the bundled Moggcord UI inside Discord.

## Build the loader

Use JDK 17, Gradle 8.13 and Android SDK 36 with Build Tools 35.0.0. From the project root:

```sh
npm ci
npm run build
gradle -p android :loader:assembleDebug
```

The debug APK is in `android/loader/build/outputs/apk/debug/loader-debug.apk`. Successful [GitHub Actions runs](https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml) also attach it as **Moggcord-Mobile-Android-dev**.

## Try it with Discord

- With LSPosed, install the module APK, enable it for Discord (`com.discord`) and relaunch Discord.
- For a rootless test, use a compatible [LSPatch](https://github.com/LSPosed/LSPatch) setup and embed the module into your own compatible Discord APK with **local** patch mode. Use a test device or emulator for this first build. Android requires matching signatures to update an existing install, so a repacked APK may need an isolated app installation. Use a patcher that supports your Discord APK layout if it uses splits.

In Discord settings, look for **Moggcord → Moggcord Mobile**. If the section is missing, capture the `MoggcordMobile` lines from `adb logcat` and include the Android version, Discord build and loader version in a GitHub issue.

The loader looks for the React Native bundle delegate in the Discord process. DexKit is used to find that delegate when the class name is obfuscated. It runs a copy of the APK's embedded payload before Discord's own bundle.
