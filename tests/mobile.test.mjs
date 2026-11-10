import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { loadLibrary, libraryUrl } from "../shared/community.js";
import { createPreferenceStore, normalizePreferences, readBackup, toggleSaved } from "../shared/preferences.js";
import { observeMetro } from "../shared/settings.js";

const plugin = Object.freeze({
  id: "17677319-0fd4-4c42-a3cc-b71413be0bf5",
  kind: "plugin",
  name: "Profile Sets",
  description: "Saved Discord profile presets.",
  version: "1.0.0",
  author_name: "Moggcord",
  source_code: "throw Error('Do not execute this');"
});

test("the shipped payload adds one native settings section and keeps the existing list intact", async () => {
  const bundle = await readFile(new URL("../dist/moggcord-mobile.js", import.meta.url), "utf8");
  const context = vm.createContext({ console, fetch() { throw new Error("Unexpected startup network request"); } });
  vm.runInContext(bundle, context);
  vm.runInContext(bundle, context);
  assert.equal(context.__MOGGCORD_MOBILE__, "0.1.0");

  const factories = new Map();
  context.__d = (factory, id) => factories.set(id, factory);
  const list = Object.freeze({
    createList(config, origin) {
      assert.equal(origin, "settings");
      return config.sections;
    }
  });
  const renderer = Object.freeze({ SETTING_RENDERER_CONFIG: Object.freeze({ ACCOUNT: { type: "route" } }) });
  function load(id, exported) {
    context.__d((scope, require, importDefault, importAll, module) => { module.exports = exported; }, id, []);
    const module = { exports: {} };
    factories.get(id)(context, undefined, undefined, undefined, module, module.exports, []);
    return module.exports;
  }
  const react = {
    Component: class {},
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState() {}
  };
  load(1, react);
  load(2, Object.freeze({ AppRegistry: {}, View: "View", Text: "Text" }));
  const settings = load(3, renderer);
  const createList = load(4, list).createList;
  const normal = Object.freeze([Object.freeze({ label: "Account", settings: Object.freeze(["ACCOUNT"]) })]);
  const output = createList(Object.freeze({ sections: normal }), "settings");
  assert.equal(normal.length, 1);
  assert.equal(output.length, 2);
  assert.equal(output[1].label, "Moggcord");
  assert.equal(output[1].settings[0], "MOGGCORD_MOBILE");
  assert.equal(createList({ sections: output }, "settings"), output);
  const unrelated = [{ settings: ["PRIVACY"] }];
  assert.equal(createList({ sections: unrelated }, "settings"), unrelated);
  assert.equal(settings.SETTING_RENDERER_CONFIG.ACCOUNT, renderer.SETTING_RENDERER_CONFIG.ACCOUNT);
  const route = settings.SETTING_RENDERER_CONFIG.MOGGCORD_MOBILE;
  assert.equal(route.useTitle(), "Moggcord Mobile");
  assert.equal(typeof route.screen.getComponent(), "function");
});

test("an unsupported or failing observer never replaces the Discord module's original behavior", () => {
  const existing = Object.defineProperty({}, "__d", { value: () => null });
  assert.equal(observeMetro(existing, () => {}, () => {}), false);
  const errors = [], calls = [];
  const scope = { __d(factory) { return factory("host", null, null, null, { exports: {} }); } };
  assert.equal(observeMetro(scope, () => { throw new Error("Module unavailable"); }, error => errors.push(error.message)), true);
  assert.equal(scope.__d((value) => { calls.push(value); return 42; }), 42);
  assert.deepEqual(calls, ["host"]);
  assert.deepEqual(errors, ["Module unavailable"]);
  assert.throws(() => scope.__d(() => { throw new Error("Host failure"); }), /Host failure/);
});

test("mobile preferences round-trip local favorites and ignore unrelated account or executable fields", async () => {
  const storage = new Map();
  const findStorage = () => ({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  const store = createPreferenceStore(findStorage);
  const empty = await store.load();
  assert.equal(empty.palette, "midnight");
  const first = toggleSaved({ ...empty, palette: "dusk" }, plugin);
  await store.save(first);
  assert.deepEqual(await store.load(), first);
  const loaded = await createPreferenceStore(findStorage).load();
  assert.equal(loaded.palette, "dusk");
  assert.equal(loaded.saved[0].name, "Profile Sets");
  assert.equal(loaded.saved[0].source_code, undefined);
  assert.equal(toggleSaved(loaded, plugin).saved.length, 0);
  assert.deepEqual(readBackup(JSON.stringify({ ...loaded, token: "ignore", saved: [plugin, plugin] })), loaded);
  assert.equal(normalizePreferences({ palette: "__proto__" }).palette, "midnight");
  assert.throws(() => readBackup('{"schema":99}'), /Moggcord Mobile backup/);
  assert.throws(() => readBackup(" ".repeat(65537)), /too large/);
});

test("the library reads bounded metadata on Moggcord's site without forwarding Discord credentials", async () => {
  const results = await loadLibrary("plugin", "profile & colors", {
    async request(url, options) {
      const target = new URL(url);
      assert.equal(target.origin, "https://moggcord.cc");
      assert.equal(target.searchParams.get("kind"), "plugin");
      assert.equal(target.searchParams.get("q"), "profile & colors");
      assert.equal(options.credentials, "omit");
      return { ok: true, json: async () => ({ data: [plugin, { ...plugin, kind: "theme" }, { ...plugin, id: "../invalid" }] }) };
    }
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].source_code, undefined);
  assert.equal(libraryUrl("plugin", results[0].name), "https://moggcord.cc/user-plugins?q=Profile%20Sets");
});
