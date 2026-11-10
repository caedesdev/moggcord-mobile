# iOS and iPadOS

Moggcord Mobile targets iOS 16 and later with arm64 Discord builds using the bridgeless React Native host. The build produces a **dylib** to test with a compatible Discord app.

## Build the loader

On a Mac with Xcode and the iOS SDK:

```sh
npm ci
npm run build
bash scripts/build-ios.sh
```

The result is `dist/ios/MoggcordMobile.dylib`. Successful [GitHub Actions runs](https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml) attach it as **Moggcord-Mobile-iOS-dev**.

## Build and install a test IPA

1. Download and unzip the [iOS build kit](https://github.com/caedesdev/moggcord-mobile/releases/tag/ios-v0.3.1).
2. In that folder, run the following command with Python 3.12 and an unencrypted ARM64 Discord 344.1 IPA (build 110861) you are allowed to modify.

```sh
python build-ipa.py "Discord.ipa"
```

3. Transfer the resulting **Moggcord-Mobile.ipa** to your device. Open it in an already configured [AltStore Classic](https://faq.altstore.io/altstore-classic/your-altstore) to sign and install it. On Windows or macOS, you can also select the IPA in [Sideloadly](https://sideloadly.io/).

When building from source, run `python scripts/build-ipa.py "Discord.ipa"` after compiling the loader. Use `--loader` to select a library in a different location.

Launch the app and find **Moggcord → Moggcord Mobile** in Discord settings. Report the iOS version and Discord build if the entry is missing. Sideloaded apps can have different availability for push notifications and other entitlement-dependent features.

Message Logger can retain messages received by the running app. iOS can suspend Discord in the background, and force-quitting stops its JavaScript runtime. Turning notifications on does not keep the plugin running or restore deleted messages that never reached it. The loader does not access notifications belonging to a separate Discord installation.

The loader attaches to the host's React Native runtime initialization and evaluates the bundled JavaScript through JSI. JSI is an internal interface, so a Discord update can require a compatibility check or loader update.
