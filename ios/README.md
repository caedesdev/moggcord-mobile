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

## Try it on a device

Use a compatible Discord IPA you are allowed to modify and an IPA installation tool that supports injecting dylibs. Add `MoggcordMobile.dylib`, then sign the resulting app for your device with your own Apple credentials. Consult the tool's instructions for provisioning and installation. A development dylib is not an installable IPA.

Launch the app and find **Moggcord → Moggcord Mobile** in Discord settings. Report the iOS version and Discord build if the entry is missing. Sideloaded apps can have different availability for push notifications and other entitlement-dependent features.

The loader attaches to the host's React Native runtime initialization and evaluates the bundled JavaScript through JSI. JSI is an internal interface, so a Discord update can require a compatibility check or loader update.
