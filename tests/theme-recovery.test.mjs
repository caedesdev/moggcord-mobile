import assert from "node:assert/strict";
import test from "node:test";
import { nativeModule } from "./native-host.mjs";

test("iOS recovery repairs only Moggcord theme aliases in Discord's appearance stores", async () => {
  const saved = new Map([
    ["ThemeStore", '{"_state":{"theme":"bn-theme-8","display":"bn-theme-8","fontScale":1.15}}'],
    ["SelectivelySyncedUserSettingsStore", '{"_state":{"appearance":{"theme": "bn-theme-4","sync":false}}}'],
    ["OtherStore", '{"theme":"bn-theme-2"}']
  ]);
  const changed = [];
  const { recoverDiscordTheme } = await nativeModule("runtime/src/lib/addons/themes/colors/recovery.ts", {
    "@lib/api/native/modules": {
      NativeCacheModule: {
        getItem: async key => saved.get(key),
        setItem: async (key, json) => { changed.push(key); saved.set(key, json); }
      }
    }
  });

  await recoverDiscordTheme();
  assert.deepEqual(JSON.parse(saved.get("ThemeStore")), {
    _state: { theme: "darker", display: "bn-theme-8", fontScale: 1.15 }
  });
  assert.deepEqual(JSON.parse(saved.get("SelectivelySyncedUserSettingsStore")), {
    _state: { appearance: { theme: "darker", sync: false } }
  });
  assert.equal(saved.get("OtherStore"), '{"theme":"bn-theme-2"}');
  await recoverDiscordTheme();
  assert.deepEqual(changed.sort(), ["SelectivelySyncedUserSettingsStore", "ThemeStore"]);
});

test("missing or corrupt appearance data does not prevent the app from continuing startup", async () => {
  const { recoverDiscordTheme } = await nativeModule("runtime/src/lib/addons/themes/colors/recovery.ts", {
    "@lib/api/native/modules": {
      NativeCacheModule: {
        async getItem(key) {
          if (key === "ThemeStore") throw new Error("Storage unavailable");
          return '{"theme":"bn-theme-8"';
        },
        setItem: () => assert.fail("Corrupt appearance data was overwritten")
      }
    }
  }, { console: { warn() {} } });
  await assert.doesNotReject(recoverDiscordTheme);
});

async function themeHost({ supported, start = () => () => {} }) {
  const saved = {};
  const settings = {};
  const writes = [];
  const hostUpdates = [];
  const manifest = { spec: 2, name: "Test theme", rawColors: { BLACK: "#000000" } };
  const module = await nativeModule("runtime/src/lib/addons/themes/index.ts", {
    "@core/i18n": { t: message => message },
    "@core/vendetta/storage": {
      awaitStorage: async () => {},
      createFileBackend: path => ({ set: async value => writes.push({ path, value }) }),
      createMMKVBackend: () => {},
      createStorage: () => saved,
      wrapSync: value => value
    },
    "@lib/api/native/fs": { writeFile: async () => {} },
    "@lib/api/native/loader": {
      getStoredTheme: () => null,
      getThemeFilePath: () => supported ? "vendetta_theme.json" : null,
      isPyonLoader: () => false,
      isThemeSupported: () => supported
    },
    "@lib/api/settings": { settings },
    "@lib/api/storage": { awaitStorage: async () => {} },
    "@lib/utils/addonUrl": { isAddonUrl: () => true },
    "react-native": { Platform: { OS: "ios" } },
    "./colors": { __esModule: true, default: start },
    "./colors/parser": { normalizeToHex: value => value },
    "./colors/preferences": { colorsPref: {} },
    "./colors/updater": { updateBunnyColor: value => hostUpdates.push(value) }
  }, {
    AbortController,
    clearTimeout() {},
    fetch: async () => ({ ok: true, text: async () => JSON.stringify(manifest) })
  });
  return { module, settings, writes, hostUpdates, manifest };
}

test("the current IPA cannot apply or persist an unsupported custom theme through either entry point", async () => {
  const { module, writes, hostUpdates, manifest } = await themeHost({ supported: false });
  await module.initThemes();
  assert.equal(module.canApplyThemes(), false);
  const theme = { id: "https://themes.example/theme.json", selected: false, data: manifest };
  assert.throws(() => module.selectTheme(theme), /Custom themes are unavailable/);
  assert.equal(theme.selected, false);
  await module.fetchTheme(theme.id, true);
  assert.equal(module.themes[theme.id].selected, false);
  assert.deepEqual(writes, []);
  assert.deepEqual(hostUpdates, []);
});

test("custom themes need initialized color patches and Safe Mode still keeps the stock appearance", async () => {
  let ready = false;
  const { module, settings, writes, hostUpdates, manifest } = await themeHost({
    supported: true,
    start() { ready = true; return () => { ready = false; }; }
  });
  const theme = { id: "https://themes.example/theme.json", selected: false, data: manifest };
  assert.throws(() => module.selectTheme(theme), /unavailable/);
  const stop = await module.initThemes();
  assert(ready && module.canApplyThemes());
  await module.selectTheme(theme);
  assert.equal(theme.selected, true);
  assert.equal(writes[0].path, "vendetta_theme.json");
  assert.deepEqual(hostUpdates, [manifest]);
  settings.safeMode = { enabled: true };
  assert.throws(() => module.selectTheme(theme), /unavailable/);
  await module.selectTheme(null);
  assert.equal(Object.keys(writes[1].value).length, 0);
  assert.deepEqual(hostUpdates, [manifest]);
  stop();
  assert.equal(ready, false);
});
