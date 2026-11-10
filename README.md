<div align="center">
  <img src="docs/assets/moggcord-logo.png" width="100" alt="Moggcord logo">
  <h1>Moggcord Mobile</h1>
  <p>A native Moggcord settings panel for Discord on Android, iPhone and iPad.</p>
  <p><a href="https://moggcord.cc">Website</a> · <a href="https://github.com/caedesdev/moggcord">Desktop</a> · <a href="https://github.com/caedesdev/moggcord-mobile/releases/tag/ios-v0.1.0">iOS build kit</a> · <a href="https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml">Development builds</a></p>
</div>

Moggcord Mobile is a separate project with a shared React Native payload. Open Discord settings and choose **Moggcord Mobile** in the **Moggcord** section.

- **Mobile plugins.** Switch on Message Logger, Call Timer and experimental Fake Deafen from the Plugins tab. Available switches depend on the Discord build.
- **Desktop catalog.** Search Moggcord, Vencord and Equicord by name and description in the app.
- **Community library.** Search Moggcord's public plugins and themes and save favorites on your device.
- **Color profiles.** Switch between Midnight, Cobalt and Dusk for the Moggcord panel.
- **Backup & Restore.** Export your color profile, favorites and plugin switches as JSON in Settings.
- **Quick actions.** Open the community, website and service status from your phone.

Desktop plugin entries show metadata. Each desktop plugin needs a React Native port to run in Discord Mobile. Color profiles style the Moggcord panel.

Message Logger keeps up to 80 local text changes in memory for the current Discord account and session. Open its log from Plugins. Call Timer shows the current duration in Home and Plugins. Fake Deafen applies on the next voice-state update while the microphone is muted. It keeps Discord's actual microphone and audio controls in use.

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
