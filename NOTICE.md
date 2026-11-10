# Credits and licenses

Moggcord Mobile code is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).

- [Endcord Mobile at 0891b7c](https://github.com/Endcord/endcord-mobile/tree/0891b7c079bac1543bc23bf0a661da56422453fc) was the technical reference for the Android React Native bundle hook, iOS runtime initialization, mobile settings integration and the mobile dispatcher and voice-state interfaces used by Message Logger, Call Timer and Fake Deafen. Its upstream contributors include Team Vendetta, pylixonly, Team Revenge and the RainTweak contributors. See the reference project's [upstream history](https://github.com/Endcord/endcord-mobile/blob/0891b7c079bac1543bc23bf0a661da56422453fc/UPSTREAM.md).
- The two vendored JSI headers in `ios/vendor/jsi/` are Meta's MIT-licensed headers from that reference revision. Their notices are retained and the [MIT license](ios/vendor/LICENSE-META) accompanies them.
- Android uses [Xposed API 82](https://api.xposed.info/) as a compile-time interface and [DexKit](https://github.com/LuckyPray/DexKit) under Apache-2.0. The Android guide links to [LSPatch](https://github.com/LSPosed/LSPatch), which is distributed separately.
- The Moggcord mark and community links are from [Moggcord](https://moggcord.cc).

Discord is a product of Discord Inc. This project is independent of Discord Inc., Apple and Google.

## Bundled mobile framework and plugins

The runtime is adapted from Endcord Mobile revision
0891b7c079bac1543bc23bf0a661da56422453fc. The framework retains its original
BSD-3-Clause license in [runtime/LICENSE](runtime/LICENSE), with notices for
Team Vendetta, pylixonly and Team Revenge. Marked plugin files retain the
copyright of rootpoi and contributors and their GPL-3.0-or-later notices.
Message Logger also credits PalmDevs' GPL-3.0 message-logger approach.

Moggcord changes include branding, settings integration, bundled plugin
management, the compact voice control, update behavior and storage integration.
