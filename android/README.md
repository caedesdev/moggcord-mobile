# Android

Moggcord for Android is a launcher and a bundled Moggcord module in one APK. It targets Android 9 and later and the bridgeless React Native version of Discord.

## Install and open

1. Install the signed Moggcord for Android APK and open it from your home screen.
2. Choose **Set up Moggcord**. If you already use LSPosed, enable **Moggcord for Android** for Discord in its Modules screen.
3. Fully close Discord and use **Open Discord**. In Discord settings, look for **Moggcord Mobile**.

The launcher opens your existing Discord installation. Its separate Android package, `cc.moggcord.mobile.launcher`, can be installed alongside the previous loader. If you switch modules, disable **Moggcord Mobile Loader** in LSPosed first and keep the same Discord app to retain its data. A normal Android installation needs a compatible, user-configured module environment. The launcher can detect the Discord package, but only Discord can show whether the module loaded successfully.

## Build the launcher

Use JDK 17, Gradle 8.13 and Android SDK 36 with Build Tools 35.0.0. From the project root:

```sh
npm ci
npm run build
gradle -p android :loader:assembleDebug :loader:assembleRelease
```

Successful [GitHub Actions runs](https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml) attach both APKs under **Moggcord-Mobile-Android-dev**. The debug APK has the `.debug` package suffix. Sign the unsigned release APK with the existing Android launcher keystore before distributing it. Use the same signing key for future releases and keep it outside the repository so Android can install updates in place.

The loader looks for the React Native bundle delegate in the Discord process. DexKit is used to find that delegate when the class name is obfuscated. It runs a copy of the APK's embedded payload before Discord's own bundle.
