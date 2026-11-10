import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import vm from "node:vm";
import { replaceVideoControl } from "../shared/voice-controls.js";

async function port(name, modules) {
  const output = await build({
    entryPoints: ["runtime/src/plugins/" + name + "/index.tsx"],
    bundle: true, write: false, platform: "node", format: "cjs", logLevel: "silent",
    plugins: [{
      name: "mock-native-host",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args =>
          args.kind === "entry-point" ? undefined : { path: args.path, external: true });
      }
    }]
  });
  const context = vm.createContext({
    module: { exports: {} }, exports: {}, console,
    require(name) {
      assert(Object.hasOwn(modules, name), "Unexpected native dependency " + name);
      return modules[name];
    },
    setTimeout(callback) { callback(); }
  });
  vm.runInContext(output.outputFiles[0].text, context);
  return context.module.exports.default;
}

test("every bundled plugin ID resolves to its own implementation", async () => {
  const manifest = await readFile("runtime/src/plugins/manifest.ts", "utf8");
  const ids = JSON.parse(await readFile("shared/mobile-plugin-ids.json", "utf8"));
  const loaders = new Map([...manifest.matchAll(/"(moggcord\.[a-z0-9-]+)": \(\) => require\("\.\/([^"]+)"\)/g)]
    .map(match => [match[1], match[2]]));
  assert.equal(ids.length, 303);
  assert.equal(loaders.size, ids.length);
  for (const id of ids) {
    const directory = loaders.get(id);
    assert(directory, id);
    let text;
    try { text = await readFile("runtime/src/plugins/" + directory + "/index.tsx", "utf8"); }
    catch { text = await readFile("runtime/src/plugins/" + directory + "/index.ts", "utf8"); }
    assert(text.includes('id: "' + id + '"'), "Incorrect implementation for " + id);
    assert.match(text, /\bstart\s*(?:\(|:)/, "No start operation for " + id);
  }
});

test("the shipped Message Logger keeps deleted messages and sends red native rows", async () => {
  const actions = new Map();
  const removals = [];
  const entries = new Map();
  const scheduled = [];
  const cleanups = [];
  let plugin;
  class RowManager {
    generate({ message }) {
      return { type: 1, message: { id: message.id, content: [{ type: "text", content: message.content }] } };
    }
  }
  const original = RowManager.prototype.generate;
  const current = "123456789";
  const store = { getMessage: (_, id) => entries.get(id) };
  const getStore = name => name === "MessageStore" ? store : undefined;
  plugin = await port("messageLogger", {
    "@core/i18n": { t: text => text, tx: text => text },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@lib/api/assets": { findAssetId: () => 1 },
    "@lib/api/patcher": {
      instead(key, target, callback) {
        const fn = target[key];
        target[key] = function (...args) { return callback.call(this, args, fn); };
        return () => { target[key] = fn; };
      }
    },
    "@lib/ui/toasts": { showToast() {} },
    "@metro": { findByName: name => name === "RowManager" ? RowManager : null },
    "@metro/common": { tokens: {} },
    "@metro/common/components": { Button() {} },
    "react-native": { processColor: () => 0xfff23f43 },
    "../api": { definePlugin(definition) {
      definition.store = Object.fromEntries(Object.entries(definition.settings).map(([key, setting]) => [key, setting.default]));
      return definition;
    } },
    "../common": {
      currentUserId: () => current, getStore,
      onAction(type, callback) {
        actions.set(type, callback);
        return () => actions.delete(type);
      },
      dispatchSoon(action) { scheduled.push(action); }
    },
    "../hooks": { addMessageAction() { return () => {}; } }
  });
  const item = { id: "1", channel_id: "2", author: { id: "987654321" }, content: "Keep this text", state: "SENT", flags: 0 };
  entries.set(item.id, item);
  plugin.start({ store: plugin.store, cleanup: (...fns) => cleanups.push(...fns.filter(fn => typeof fn === "function")) });
  const change = actions.get("MESSAGE_DELETE")({ id: "1", channelId: "2" });
  assert.equal(change.type, "MESSAGE_UPDATE");
  assert.equal(entries.get("1"), item);
  const row = new RowManager().generate({ message: item });
  assert.equal(row.message.textColor, 0xfff23f43);
  assert.equal(row.message.editedColor, 0xfff23f43);
  assert.equal(row.message.edited, "deleted");
  assert.equal(row.changeType, 2);

  actions.get("MESSAGE_UPDATE")({ message: { id: "1", channel_id: "2", content: "Edited text" } });
  item.content = "Edited text";
  const edited = new RowManager().generate({ message: item });
  assert(edited.message.content.some(part => part.content === "Keep this text"));
  assert(edited.message.content.some(part => part.content === "Edited text"));

  const bulk = actions.get("MESSAGE_DELETE_BULK")({ ids: ["1", "999"], channelId: "2" });
  assert.deepEqual([...bulk.ids], ["999"]);
  for (const cleanup of cleanups.reverse()) cleanup();
  assert.equal(RowManager.prototype.generate, original);
  assert(scheduled.some(action => action.type === "MESSAGE_DELETE" && action.id === "1"));
});

test("the mobile screen opens the real list without desktop catalog selectors", async () => {
  const screen = await readFile("shared/screen.js", "utf8");
  assert(!screen.includes("Desktop catalog"));
  assert(!screen.includes("Mobile ·"));
  assert(!screen.includes("loadPluginCatalog"));
  assert(screen.includes('heading("Plugins", "Find a plugin and make it yours.")'));
  assert(screen.includes("plugin.busy"));
});


test("the camera slot uses the fake control without changing other call buttons", () => {
  const camera = { key: "connected-video", width: 48, x: 16, render: () => "camera" };
  const mic = { key: "connected-mic", render: () => "microphone" };
  const hangup = { key: "connected-disconnect", render: () => "hangup" };
  const controls = Object.freeze([Object.freeze(camera), Object.freeze(mic), Object.freeze(hangup)]);
  let original;
  const next = replaceVideoControl(controls, render => {
    original = render;
    return () => "fake-deafen";
  });
  assert.equal(next.length, 3);
  assert.equal(next[0].render(), "fake-deafen");
  assert.equal(next[0].width, camera.width);
  assert.equal(next[0].x, camera.x);
  assert.equal(original(), "camera");
  assert.equal(next[1], mic);
  assert.equal(next[2], hangup);
  assert.equal(camera.render(), "camera");
});
