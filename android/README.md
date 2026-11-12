# Android

Moggcord for Android installs a separate app using the compatible Discord APK already on your device. The launcher bundles the Moggcord module and runs on Android 9 and later.

## Install and open

1. Install the signed Moggcord for Android APK and open it from your home screen.
2. Choose **Install in Discord**. If Android asks, allow installs from the launcher and return to it. Confirm the installation in Android's install dialog.
3. Choose **Open Moggcord**, sign in, then open **Moggcord Mobile** in the app's settings.

If Discord is missing, **Get Discord** opens its Play Store page. The launcher prepares a local copy and installs it as `cc.moggcord.mobile.discord`. Your original Discord app and its data stay on the device. The new app has its own sign-in and settings. A separate root or LSPosed setup is unnecessary for this path.

To refresh the copy, update Discord in the Play Store and choose **Reinstall Moggcord**. Keep the launcher installed so it can reuse the private signing key it created for this device. If you clear the launcher's data or remove it, Android may require you to uninstall the Moggcord copy before it will accept a fresh one.

## Build the launcher

Use JDK 21, Gradle 8.13 and Android SDK 36 with Build Tools 35.0.0. From the project root:

```sh
npm ci
npm run build
gradle -p android :loader:assembleDebug :loader:assembleRelease
```

Successful [GitHub Actions runs](https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml) attach both APKs under **Moggcord-Mobile-Android-dev**. The debug APK has the `.debug` package suffix. Sign the unsigned release APK with the existing Android launcher keystore before distributing it. Use the same signing key for future releases and keep it outside the repository so Android can install updates in place.

Starting with 0.4.14, select **Reinstall Moggcord** once to add the signed runtime updater to your Discord copy. Use **Moggcord Mobile → Settings → Moggcord updates** for compatible runtime updates. See [runtime updates and recovery](../docs/in-app-updates.md).

The build fetches the pinned LSPatch archive and verifies its SHA-256 digest. At installation, the launcher prepares only the local Discord APK and its installed splits, adds the bundled module, and signs the copy with its device-specific key. The loader uses DexKit to find Discord's React Native bundle delegate when its name is obfuscated and loads the embedded Moggcord payload before Discord's own bundle.
