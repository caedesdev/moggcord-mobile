import assert from "node:assert/strict";
import test from "node:test";
import { createMobileUpdater } from "../shared/updates.js";
import { nativeModule } from "./native-host.mjs";

test("plugin changes queue independently and restart only after saved settings", async () => {
  const first = "moggcord.first";
  const second = "moggcord.second";
  const enabled = new Set();
  const actions = [];
  const settings = {};
  let runtime;
  let rejectWrite = true;
  const { initMoggcordSettings } = await nativeModule("runtime/src/moggcord/index.ts", {
    react: { createElement: (_type, props) => props },
    "react-native": {},
    "../../../shared/screen": { createMobileScreen: (_react, _native, _prefs, adapter) => { runtime = adapter; } },
    "../../../shared/preferences": { createPreferenceStore: () => ({ load: async () => ({ enabledPlugins: [] }) }) },
    "../../../shared/updates": { createMobileUpdater },
    "@lib/api/native/modules": { BundleUpdaterManager: { reload: () => actions.push("reload") } },
    "@lib/api/storage": { flushStorages: async () => actions.push("switches saved") },
    "@core/vendetta/storage": { flushStorage: async store => {
      assert.equal(store, settings);
      if (rejectWrite) throw Error("Write failed");
      actions.push("options saved");
    } },
    "@ui/settings": { registerSection() {} },
    "@lib/addons/plugins": {
      registeredPlugins: new Set([first, second]), pluginSettings: {},
      isPluginEnabled: id => enabled.has(id),
      enablePlugin: async id => { enabled.add(id); },
      disablePlugin: id => enabled.delete(id)
    },
    "@plugins": { loadMoggcordPlugin: () => ({}) },
    "@plugins/api": { isMoggcordPluginRunning: id => enabled.has(id) },
    "@plugins/manifest": { manifest: [{ id: first, name: "First" }, { id: second, name: "Second" }] },
    "@plugins/ui/PluginSettings": { default: () => {} },
    "@plugins/descriptions.json": {},
    "./BrandIcon": {},
    "./accounts": {}
  }, { MOGGCORD_MOBILE_VERSION: "0.0.1" });
  await initMoggcordSettings();
  assert.equal(runtime.snapshot().pluginRestart, "idle");
  await runtime.setPluginEnabled(first, false);
  assert.equal(runtime.snapshot().pluginRestart, "idle");

  await Promise.all([runtime.setPluginEnabled(first, true), runtime.setPluginEnabled(second, true)]);
  assert.deepEqual([...enabled], [first, second]);
  assert.equal(runtime.snapshot().pluginRestart, "pending");
  runtime.settingsComponent(first)().onChange(settings);

  await runtime.restartForPluginChanges();
  assert.equal(runtime.snapshot().pluginRestart, "failed");
  assert.deepEqual(actions, ["switches saved"]);
  rejectWrite = false;
  await Promise.all([runtime.restartForPluginChanges(), runtime.restartForPluginChanges()]);
  assert.deepEqual(actions, ["switches saved", "switches saved", "options saved", "reload"]);
});
