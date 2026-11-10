# iOS and iPadOS

Moggcord Mobile targets iOS 16 and later with arm64 Discord builds using the bridgeless React Native host.

## Sign and install a prepared IPA

1. Save your prepared **Moggcord-Mobile.ipa** to Files on your iPhone or iPad.
2. Open [AltStore Classic](https://faq.altstore.io/altstore-classic). Under **My Apps**, tap **+** and pick the IPA. Keep AltServer running on your computer while AltStore signs and installs the app with your Apple Account.
3. Open the installed app and go to **Discord Settings → Moggcord Mobile**.

On Windows or macOS, you can also connect your device, load the IPA into [Sideloadly](https://sideloadly.io/), and sign it with your Apple Account there.

## Build a test IPA

1. Open [the iOS downloads](https://moggcord.cc/#download-panel-ios), expand **Need to build an IPA?** and unzip the build kit on your computer.
2. With Python 3.12, run the following command in that folder. Use an unencrypted arm64 Discord 344.1 IPA (build 110861) that you are allowed to modify.

```sh
python build-ipa.py "Discord.ipa"
```

Use the resulting **Moggcord-Mobile.ipa** with the signing steps above. When building from source, run `python scripts/build-ipa.py "Discord.ipa"` after compiling the loader. Use `--loader` to select a library in a different location.

## Build the loader

On a Mac with Xcode and the iOS SDK:

```sh
npm ci
npm run build
bash scripts/build-ios.sh
```

The result is `dist/ios/MoggcordMobile.dylib`. Successful [GitHub Actions runs](https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml) attach it as **Moggcord-Mobile-iOS-dev**.

## Using Moggcord Mobile

Report the iOS version and Discord build if the Moggcord entry is missing. Sideloaded apps can have different availability for push notifications and other entitlement-dependent features.

Open **Moggcord Mobile → Plugins**, search for **ProfileSets** and enable it. You can also enable it from its **Community** entry. The built-in version runs on mobile. Desktop ZIPs are for the desktop client.

Theme Library lets you browse custom themes on iOS. Applying one requires a loader with support for Discord's custom colors.

Message Logger can retain messages received by the running app. iOS can suspend Discord in the background, and force-quitting stops its JavaScript runtime. Turning notifications on does not keep the plugin running or restore deleted messages that never reached it. The loader does not access notifications belonging to a separate Discord installation.

The loader attaches to the host's React Native runtime initialization and evaluates the bundled JavaScript through JSI. JSI is an internal interface, so a Discord update can require a compatibility check or loader update.

## Update without reinstalling

Install the 0.4.5 loader once to enable the native Platform Indicators. Earlier loaders need a newly signed IPA for this feature. In **Moggcord Mobile → Settings → Moggcord updates**, check for updates and choose **Update and restart**. Compatible plugin and UI updates are downloaded, verified and staged in the app's private storage. Discord reloads to apply them; native-loader and Discord app updates still need a new signed IPA.

The loader pins a P-256 verification key and checks the manifest signature, payload hash, size, Discord build and loader compatibility before loading an update. An update that does not confirm startup rolls back on the next launch. See [update development](../docs/in-app-updates.md).
