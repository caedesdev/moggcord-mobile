import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { loadLibrary, libraryUrl } from "../shared/community.js";
import { createPreferenceStore, normalizePreferences, readBackup, toggleSaved } from "../shared/preferences.js";
import { observeMetro } from "../shared/settings.js";
import { createPluginRuntime } from "../shared/plugins.js";
import { loadPluginCatalog } from "../shared/catalog.js";

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
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(context.__MOGGCORD_MOBILE__, version);

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

test("the message logger records visible edits and deletes without changing Discord actions", () => {
  const runtime = createPluginRuntime(error => assert.fail(error), () => 1000);
  const callbacks = [];
  const dispatcher = { _interceptors: callbacks, dispatch() {}, subscribe() {}, unsubscribe() {} };
  let account = "123456789012345678";
  const author = { username: "Friend" };
  const messages = new Map([["1", { author, content: "Before" }], ["2", { author, content: "Second" }]]);
  runtime.setEnabled(["messagelogger", "desktop-code", "messagelogger"]);
  assert.equal(runtime.snapshot().plugins[0].active, false);
  runtime.observe({ exports: { default: dispatcher } });
  runtime.observe({ exports: { default: { getMessage: (_, id) => messages.get(id), getMessages() {} } } });
  runtime.observe({ exports: { default: { getCurrentUser: () => ({ id: account }), getUser() {} } } });
  assert.equal(callbacks.length, 1);
  assert.equal(runtime.snapshot().plugins[0].active, true);

  const update = Object.freeze({ type: "MESSAGE_UPDATE", message: Object.freeze({ id: "1", channel_id: "3", content: "After" }) });
  assert.equal(callbacks[0](update), false);
  assert.equal(callbacks[0]({ type: "MESSAGE_DELETE_BULK", ids: ["2", "4"], channelId: "3" }), false);
  assert.equal(callbacks[0]({ type: "MESSAGE_UPDATE", id: "1", channelId: "3" }), false);
  assert.deepEqual(runtime.snapshot().log.map(({ kind, before, after }) => [kind, before, after]), [
    ["Deleted", "Second", null], ["Edited", "Before", "After"]
  ]);
  assert.equal(update.message.content, "After");
  assert.equal(messages.get("1").content, "Before");
  account = "987654321098765432";
  assert.deepEqual(runtime.snapshot().log, []);
  runtime.setEnabled([]);
  assert.equal(callbacks.length, 0);
});

test("voice plugins track calls and restore genuine flags when disabled", () => {
  let time = 100;
  let channel;
  const subscribers = new Map();
  const states = [];
  class Gateway {
    voiceStateUpdate(state) { states.push(state); return "sent"; }
  }
  const original = Gateway.prototype.voiceStateUpdate;
  const runtime = createPluginRuntime(error => assert.fail(error), () => time);
  runtime.observe({ exports: {
    _interceptors: [],
    dispatch() {},
    subscribe(name, cb) { subscribers.set(name, cb); },
    unsubscribe(name, cb) { if (subscribers.get(name) === cb) subscribers.delete(name); }
  } });
  runtime.observe({ exports: { default: { getVoiceChannelId: () => channel } } });
  runtime.observe({ exports: { default: Gateway } });
  runtime.setEnabled(["calltimer", "fakedeafen"]);
  assert.equal(runtime.snapshot().callStarted, null);
  channel = "123";
  subscribers.get("VOICE_CHANNEL_SELECT")({ channelId: channel });
  time = 200;
  subscribers.get("VOICE_CHANNEL_SELECT")({ channelId: channel });
  assert.equal(runtime.snapshot().callStarted, 100);

  const socket = new Gateway();
  const unmuted = Object.freeze({ channelId: channel, selfMute: false, selfDeaf: false, selfVideo: true });
  const muted = Object.freeze({ ...unmuted, selfMute: true });
  assert.equal(socket.voiceStateUpdate(unmuted), "sent");
  assert.equal(states[0], unmuted);
  assert.equal(socket.voiceStateUpdate(muted), "sent");
  assert.deepEqual(states[1], { ...muted, selfDeaf: true });
  assert.equal(muted.selfDeaf, false);
  runtime.setEnabled([]);
  assert.equal(Gateway.prototype.voiceStateUpdate, original);
  assert.deepEqual(states[2], muted);
  assert.equal(runtime.snapshot().callStarted, null);
  assert.equal(subscribers.size, 0);
});

test("mobile backups accept only implemented plugin switches and read older backups", () => {
  const older = { schema: 1, palette: "cobalt", saved: [] };
  assert.deepEqual(readBackup(JSON.stringify(older)).enabledPlugins, []);
  const restored = readBackup(JSON.stringify({
    ...older, enabledPlugins: ["messagelogger", "desktop-code", "fakedeafen", "messagelogger"]
  }));
  assert.deepEqual(restored.enabledPlugins, ["messagelogger", "fakedeafen"]);
  assert.equal(restored.palette, "cobalt");
});

test("the desktop catalog pages public metadata and strips installable payloads", async () => {
  const result = await loadPluginCatalog("moggcord", "Message logger", 30, {
    request: async (url, options) => {
      assert.match(url, /^https:\/\/moggcord\.cc\/api\/plugins\?source=moggcord&limit=30&offset=30&q=Message%20logger$/);
      assert.equal(options.credentials, "omit");
      return {
        ok: true,
        json: async () => ({ offset: 30, total: 380, data: [
          { id: "messagelogger", name: "MessageLogger", source: "moggcord", description: "Logs edits", source_code: "throw Error()" },
          { id: "../invalid", name: "Invalid" },
          { id: "webrichpresence (arrpc)", name: "WebRichPresence (arRPC)", source: "vencord" },
          { id: "translate+", name: "Translate+", source: "equicord" }
        ] })
      };
    }
  });
  assert.deepEqual(result, {
    total: 380, next: 34,
    entries: [
      { id: "messagelogger", title: "MessageLogger", source: "moggcord", description: "Logs edits" },
      { id: "webrichpresence (arrpc)", title: "WebRichPresence (arRPC)", source: "vencord", description: "" },
      { id: "translate+", title: "Translate+", source: "equicord", description: "" }
    ]
  });
});
