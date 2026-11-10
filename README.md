<div align="center">
  <img src="docs/assets/moggcord-logo.png" width="100" alt="Moggcord logo">
  <h1>Moggcord Mobile</h1>
  <p>A native Moggcord settings panel for Discord on Android, iPhone and iPad.</p>
  <p><a href="https://moggcord.cc">Website</a> · <a href="https://github.com/caedesdev/moggcord">Desktop</a> · <a href="https://github.com/caedesdev/moggcord-mobile/releases/tag/ios-v0.1.0">iOS build kit</a> · <a href="https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml">Development builds</a></p>
</div>

Moggcord Mobile is a separate project with a shared React Native payload. Open Discord settings and choose **Moggcord Mobile** in the **Moggcord** section.

- **Community library.** Search Moggcord's public plugins and themes and save favorites on your device.
- **Color profiles.** Switch between Midnight, Cobalt and Dusk for the Moggcord panel.
- **Backup & Restore.** Export your color profile and favorites as JSON or restore a backup.
- **Quick actions.** Open the community, website and service status from your phone.

The catalog shows public metadata and links to the website. Desktop plugins and CSS themes need a mobile port before they can run inside the React Native Discord app. Color profiles style the Moggcord panel.

## Platforms

| Platform | Development artifact | Setup |
| --- | --- | --- |
| Android 9+ | Xposed-compatible loader APK with the Moggcord bundle embedded | [Android guide](android/README.md) |
| iOS and iPadOS 16+ | arm64 dylib with the same embedded bundle | [iOS guide](ios/README.md) |

These are development builds. The APK is a loader module for a compatible Discord installation. The dylib needs to be added to a compatible Discord app and signed for the device. Builds contain Moggcord code and its embedded assets. Device compatibility still needs testing on Discord itself.

## Build

Install Node.js 24. Use the platform guide to build the native artifact after building the shared payload.

```sh
npm ci
npm test
```

`shared/` holds the UI, catalog client and settings adapter. `android/` and `ios/` contain the two loaders. Each packages `dist/moggcord-mobile.js` inside the artifact, so the loader does not fetch executable code at startup.

Moggcord Mobile is an independent project. See [credits and licenses](NOTICE.md).
