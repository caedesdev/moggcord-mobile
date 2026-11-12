<div align="center">
  <img src="docs/assets/moggcord-logo.png" width="100" alt="Moggcord logo">
  <h1>Moggcord Mobile</h1>
  <p>A native Moggcord settings panel for Discord on Android, iPhone and iPad.</p>
  <p><a href="https://moggcord.cc">Website</a> · <a href="https://github.com/caedesdev/moggcord">Desktop</a> · <a href="https://github.com/caedesdev/moggcord-mobile/releases/tag/ios-v0.4.0">iOS build kit</a> · <a href="https://github.com/caedesdev/moggcord-mobile/actions/workflows/mobile.yml">Development builds</a></p>
</div>

Moggcord Mobile is a separate project with a shared React Native payload. Open Discord settings and choose **Moggcord Mobile** in the **Moggcord** section.

- **Mobile plugins.** 304 mobile implementations are bundled and available from the Plugins tab with search, switches and per-plugin settings. In **Platform Spoofer**, choose a platform and enable **Visible to others** to report it when Discord connects. Fully restart Discord after changing the setting. With the switch off, it previews the icon on your own messages.
- **Overview.** A cobalt-blue dashboard shows your enabled-plugin count and saved uploads. Four tiles open Plugins, Community, Appearance and Backup; a fixed bottom navigation stays within reach as the content scrolls.
- **Native user actions.** 21 user-related plugins share entries in profiles, the profile's three-dot menu and message menus. Only enabled plugins contribute actions. PermissionsViewer shows server roles and permission flags without truncating high bits.
- **In-app iOS updates.** In Moggcord settings, choose **Check for updates**, then **Update and restart**. Requires the 0.4.0 loader once; subsequent compatible plugin and UI updates do not require another IPA. Discord and native-loader changes still require a signed app update.
- **Community library.** Search Moggcord's public plugins and themes and save favorites on your device.
- **Mobile themes.** Open **Community → Themes → Open Theme Library** to download and apply mobile JSON color themes on Android and iOS. Restart Discord to apply a selection. Use **Use default theme** to reset the colors.
- **Color profiles.** Switch between Midnight, Cobalt and Dusk for the Moggcord panel.
- **Backup & Restore.** Export your color profile, favorites and plugin switches as JSON in Settings.
- **Account profiles.** In Settings, save, share and restore those preferences for the signed-in account. Switch accounts opens Discord's native picker when enabled for the current Discord session.
- **Quick actions.** Open update checking and the website from Home. Service status remains available in Settings.

The plugin list uses React Native implementations for Discord Mobile. Color profiles style the Moggcord panel.

Read about [signed runtime updates and recovery](docs/in-app-updates.md). PermissionsViewer reports [server permissions](https://docs.discord.com/developers/topics/permissions); channel overwrites and moderation role hierarchy can restrict individual actions.

Message Logger keeps received deleted messages in chat, marks them red and shows edit history. Logs stay in memory. Logging needs Discord to be running and receiving messages; mobile operating systems can suspend it in the background. Closing the app stops logging, and a notification cannot recover content the app never received. Call Timer adds a call-duration overlay. Fake Deafen uses a larger ghost in the camera slot, with Discord's native muted colors and a bounded slash. The camera remains available in the expanded controls. Moggcord's settings entry uses its original full-color logo.

## Platforms

| Platform | Development artifact | Setup |
| --- | --- | --- |
| Android 9+ | Launcher APK with the Moggcord module embedded | [Android guide](android/README.md) |
| iOS and iPadOS 16+ | arm64 dylib with the same embedded bundle | [iOS guide](ios/README.md) |

The Android launcher uses the installed Discord app to prepare a separate Moggcord copy and opens Android's installation prompt. The iOS dylib needs to be added to a compatible Discord app and signed for the device. Builds contain Moggcord code and its embedded assets.

## Build

Install Node.js 24. Use the platform guide to build the native artifact after building the shared payload.

```sh
npm ci
npm test
```

`shared/` holds the UI, catalog client and settings adapter. `android/` and `ios/` contain the two loaders. Each packages `dist/moggcord-mobile.js` inside the artifact, so the loader does not fetch executable code at startup.

Moggcord Mobile is an independent project. See [credits and licenses](NOTICE.md).
