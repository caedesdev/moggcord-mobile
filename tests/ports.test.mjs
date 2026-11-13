import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import vm from "node:vm";
import { replaceVideoControl } from "../shared/voice-controls.js";

async function nativeModule(entryPoint, modules) {
  const output = await build({
    entryPoints: [entryPoint],
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
  return context.module.exports;
}

const port = async (name, modules) => (await nativeModule("runtime/src/plugins/" + name + "/index.tsx", modules)).default;

test("every bundled plugin ID resolves to its own implementation", async () => {
  const manifest = await readFile("runtime/src/plugins/manifest.ts", "utf8");
  const ids = JSON.parse(await readFile("shared/mobile-plugin-ids.json", "utf8"));
  const loaders = new Map([...manifest.matchAll(/"(moggcord\.[a-z0-9-]+)": \(\) => require\("\.\/([^"]+)"\)/g)]
    .map(match => [match[1], match[2]]));
  assert.equal(ids.length, 304);
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


test("Silent Typing centers its slash on the native keyboard image at the chat button's icon size", async () => {
  const jsx = (type, props) => ({ type, props });
  const nativeIcon = () => {};
  const store = { isEnabled: true, button: "right" };
  let control;
  const plugin = await port("silentTyping", {
    "@core/i18n": { t: value => value, tx: value => value },
    "@core/vendetta/storage": { useProxy: value => value },
    "@lib/api/assets": { findAssetId: () => 1 },
    "@lib/api/commands": { registerCommand: () => () => {} },
    "@lib/api/commands/types": { ApplicationCommandOptionType: { BOOLEAN: 5 } },
    "@lib/ui/toasts": { showToast() {} },
    "@metro/common": { messageUtil: {} },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      View: "View",
      StyleSheet: {
        create: styles => styles,
        flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style,
        absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }
      }
    },
    "../api": { definePlugin: definition => ({ ...definition, store }) },
    "../common": {
      moduleAt: () => ({ KeyboardIcon: nativeIcon }),
      getChatInputActionButton: () => "ChatInputActionButton",
      addChatButton: button => { control = button; return () => {}; },
      onAction: () => () => {}
    }
  });
  plugin.start({ store, cleanup() {} });
  const button = control.render();
  for (const size of [20, 24]) {
    const style = [{ width: size, height: size }, { tintColor: "#b0b0b5" }];
    const component = button.props.IconComponent({ style, size: "custom" });
    const frame = component.type(component.props);
    const [keyboard, overlay] = frame.props.children;
    assert.equal(keyboard.type, nativeIcon);
    assert.equal(keyboard.props.size, "custom");
    assert.equal(keyboard.props.style[0], style);
    assert.equal(keyboard.props.style[1], frame.props.style);
    assert.equal(frame.props.style.width, size);
    assert.equal(frame.props.style.height, size);
    assert.deepEqual({ ...overlay.props.style }, {
      position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center"
    });
    assert.equal(overlay.props.children.props.style[1].width, size * 0.9);
  }
  button.props.onPress();
  assert.equal(control.render().props.IconComponent, nativeIcon);
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

for (const [platform, socketExport] of [["ios", "socket"], ["ios", "default"], ["android", "store"]]) {
  test(`Fake Deafen updates ${platform} calls through the ${socketExport} gateway export`, async () => {
    const android = platform === "android";
    let channel = "existing-call", muted = !android, deafened = false;
    let refreshes = 0;
    const updates = [], cleanups = [];
    const audioQueue = [];
    const flushAudio = async () => {
      await new Promise(resolve => setImmediate(resolve));
      while (audioQueue.length) {
        audioQueue.splice(0).forEach(run => run());
        await new Promise(resolve => setImmediate(resolve));
      }
    };
    class GatewaySocket {
      voiceStateUpdate(state, extra) { updates.push({ ...state, extra }); }
    }
    const connection = new GatewaySocket();
    const settings = { mute: muted };
    const audio = {
      setSelfMute(context, value, playSound) {
        assert.equal(context, "default");
        assert.equal(playSound, false);
        audioQueue.push(() => { settings.mute = muted = value; });
      },
      toggleSelfDeaf(options) {
        assert.equal(options.syncRemote, false);
        assert.equal(settings.mute, true);
        audioQueue.push(() => { deafened = !deafened; });
      }
    };
    const icons = { withLocalSelfMuteDeaf: state => state };
    const stores = {
      SelectedChannelStore: { getVoiceChannelId: () => channel },
      ChannelStore: { getChannel: id => ({ guild_id: id + "-server" }) },
      GatewayConnectionStore: android ? { getSocket: () => connection } : undefined,
      MediaEngineStore: { isSelfMute: () => muted || deafened, isSelfDeaf: () => deafened, isVideoEnabled: () => false, getSettings: () => settings },
      VoiceStateStore: { emitChange: () => { refreshes++; } },
    };
    let toggle, changed;
    const store = new Proxy({ fakeDeafen: android, fakeMute: false, button: "none" }, {
      set(target, key, value) {
        target[key] = value;
        changed?.(key);
        return true;
      }
    });
    const plugin = await port("fakeMute", {
      "@core/i18n": { t: text => text, tx: text => text },
      "react/jsx-runtime": {},
      "react-native": { Platform: { OS: platform } },
      "@core/vendetta/storage": {},
      "@lib/api/assets": { findAssetId() {} },
      "@lib/api/commands": { registerCommand: () => () => {} },
      "@lib/api/commands/types": { ApplicationCommandOptionType: { BOOLEAN: 5 } },
      "@lib/api/patcher": { after(key, target, patch) {
        const original = target[key];
        target[key] = (...args) => {
          const result = original(...args);
          return patch(args, result) ?? result;
        };
        return () => { target[key] = original; };
      }, before(key, target, patch) {
        const original = target[key];
        target[key] = function (...args) { return original.apply(this, patch.call(this, args) ?? args); };
        return () => { target[key] = original; };
      } },
      "@lib/ui/toasts": { showToast() {} },
      "@metro/common": { FluxDispatcher: { wait: callback => audioQueue.push(callback) } },
      "../api": {
        definePlugin: definition => ({ ...definition, store }),
        onSettingChange(_store, callback) { changed = callback; return () => { changed = undefined; }; }
      },
      "../common": {
        addChatButton: () => () => {},
        currentUserId: () => "me",
        getStore: name => stores[name],
        moduleAt(path) {
          if (path.includes("Singleton")) return android ? undefined : { [socketExport]: connection };
          if (path.includes("AudioActionCreators")) return { default: audio };
          if (path.includes("useLocalSelfMuteDeaf")) return icons;
          return { default: GatewaySocket };
        }
      },
      "../shared/calls": { myVoiceChannel: () => channel },
      "../silentTyping": {},
      "./controls": { installFakeDeafenControls(_plugin, callback) { toggle = callback; return () => {}; } }
    });
    plugin.start({ store, cleanup: (...callbacks) => cleanups.push(...callbacks), logger: { warn: assert.fail } });
    assert.equal(store.fakeDeafen, false);
    assert.equal(muted, !android);
    toggle();
    if (android) {
      assert.equal(updates.length, 0);
      assert.equal(muted, false);
      await flushAudio();
    }
    assert.equal(updates.length, 1);
    assert.equal(updates[0].channelId, channel);
    assert.equal(updates[0].selfMute, true);
    assert.equal(updates[0].selfDeaf, true);
    const row = {
      channelId: channel, userId: "me", sessionId: "session", selfMute: true, selfDeaf: false,
      merge(update) { return { ...this, ...update }; }
    };
    const local = { sessionId: row.sessionId };
    assert.equal(icons.withLocalSelfMuteDeaf(row, local).selfDeaf, android);
    assert.equal(icons.withLocalSelfMuteDeaf(row, { sessionId: "different" }), row);
    const other = { ...row, userId: "someone-else" };
    assert.equal(icons.withLocalSelfMuteDeaf(other, local), other);
    assert.equal(row.selfDeaf, false);
    toggle();
    assert.equal(updates[1].selfDeaf, false);
    assert.equal(icons.withLocalSelfMuteDeaf(row, local).selfDeaf, false);
    assert.equal(refreshes, android ? 2 : 0);
    muted = settings.mute = false;
    channel = "other-call";
    deafened = android;
    toggle();
    if (android) await flushAudio();
    assert.equal(updates[2].channelId, channel);
    assert.equal(updates[2].selfMute, android);
    assert.equal(updates[2].selfDeaf, android);
    assert.equal(deafened, false);
    if (android) {
      const payload = Object.freeze({ channelId: channel, guildId: "server", selfMute: true, selfDeaf: false, flags: 4 });
      connection.voiceStateUpdate(payload, "preserved");
      assert.equal(payload.selfDeaf, false);
      assert.equal(updates.at(-1).extra, "preserved");
      muted = false;
      toggle();
      assert.equal(updates.at(-1).selfMute, false);
      assert.equal(updates.at(-1).selfDeaf, false);
      assert.equal(updates.at(-1).flags, 4);
      deafened = true;
      toggle();
      toggle();
      await flushAudio();
      assert.equal(deafened, true);
      assert.equal(store.fakeDeafen, false);
    }
    const previous = updates.length;
    channel = undefined;
    store.fakeDeafen = false;
    cleanups.reverse().forEach(stop => stop());
    assert.equal(updates.length, previous);
  });
}

test("the real fake control follows native muted styles and keeps its slash inside its icon", async () => {
  const patches = new Map();
  const buttonProps = Object.freeze({ width: 48, height: 48 });
  const wrapperSpecs = { value: { drawerMode: false } };
  let openedCamera = 0;
  let activeChannel = "voice-room";
  const camera = () => { openedCamera++; };
  const tree = { type: "AnimatedButtonWrapper", props: { props: buttonProps, onPress: camera, style: { backgroundColor: "white" } } };
  const styles = {
    iconBg: { backgroundColor: "transparent" },
    iconBgVoiceMuted: { backgroundColor: "native-muted-background", borderWidth: 1 },
    iconFill: { color: "native-normal" }, iconFillRed: { color: "native-muted-red" }
  };
  const video = { default() {} }, hooks = { useControlsButtons() {} };
  const voiceRows = { HideSelfVideo() {}, AudioRouteButton() {} };
  const groups = { TableRowGroup() {} };
  const modules = {
    "modules/voice_panel/native/controls/useControlsButtons.tsx": hooks,
    "modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx": video,
    "modules/voice_panel/native/controls/VoicePanelVoiceControlsButtons.tsx": voiceRows,
    "design/components/TableRow/native/TableRowGroup.native.tsx": groups,
    "modules/voice_panel/native/controls/buttons/VoicePanelStyles.tsx": {
      useVoicePanelButtonStyles(specs) { assert.equal(specs, wrapperSpecs); return styles; }
    }
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const api = await nativeModule("runtime/src/plugins/fakeMute/controls.tsx", {
    "@core/i18n": { t: value => value },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react": {
      createContext: () => ({ Consumer: "Consumer", Provider: "Provider" }),
      isValidElement: value => !!value?.type,
      cloneElement: (value, props) => ({ ...value, props: { ...value.props, ...props } })
    },
    "react-native": { Text: "Text", StyleSheet: { flatten: value => value } },
    "@core/vendetta/storage": { useProxy: value => value },
    "@lib/api/assets": { findAssetId: () => 123 },
    "@lib/api/patcher": {
      after: () => () => {},
      before(key, target, callback) {
        assert.equal(key, "TableRowGroup");
        assert.equal(target, groups);
        patches.set(target, callback);
        return () => patches.delete(target);
      }
    },
    "@metro": { findByProps: () => ({ Svg: "Svg", Path: "Path" }) },
    "@metro/common/components": { TableRow: Object.assign(() => {}, { Arrow: "Arrow", Icon: "RowIcon" }) },
    "@lib/utils": { findInReactTree: () => null },
    "../../../../shared/voice-controls": { replaceVideoControl },
    "../shared/calls": { myVoiceChannel: () => activeChannel },
    "../common": {
      moduleAt: path => modules[path],
      afterRender(module, key, callback) { patches.set(module, callback); return () => patches.delete(module); }
    }
  });
  const stop = api.installFakeDeafenControls({ store: {} }, () => {});
  const consumer = patches.get(video)({ wrapperSpecs }, tree);
  assert.equal(consumer.props.children(null), tree);
  for (const on of [false, true]) {
    let toggles = 0;
    const element = consumer.props.children({ on, toggle: () => toggles++ });
    const button = element.type(element.props);
    assert.equal(button.type, tree.type);
    assert.equal(button.props.props, buttonProps);
    assert.equal(button.props.style.at(-1), on ? styles.iconBgVoiceMuted : styles.iconBg);
    button.props.onPress();
    assert.equal(toggles, 1);
    const icon = button.props.children;
    assert.equal(icon.props.color, on ? "native-muted-red" : "native-normal");
    const svg = icon.type(icon.props);
    assert.equal(svg.type, "Svg");
    assert.equal(typeof svg.props.width, "number");
    assert(svg.props.width > 24 && svg.props.width < buttonProps.width);
    assert.equal(svg.props.height, svg.props.width);
    assert.equal(svg.props.children.filter(Boolean).length, on ? 2 : 1);
    assert(svg.props.children.filter(Boolean).every(child => child.type === "Path"));
  }
  const applyGroup = patches.get(groups);
  const ownCamera = jsx(voiceRows.HideSelfVideo, {});
  const audioOutput = jsx(voiceRows.AudioRouteButton, { channel: { id: activeChannel }, connected: true });
  const invite = jsx("InviteButton", {});
  const group = Object.freeze({ title: "Sprach-Einstellungen", children: Object.freeze([audioOutput, ownCamera, invite]) });
  const [modified] = applyGroup([group]);
  const row = modified.children[2];
  assert.equal(modified.children[1], ownCamera);
  assert.equal(modified.children[3], invite);
  assert.equal(group.children.length, 3);
  assert.equal(row.props.label, "Camera");
  assert.equal(row.props.icon.props.source, 123);
  assert.equal(row.props.disabled, false);
  row.props.onPress();
  assert.equal(openedCamera, 1);
  assert.equal(applyGroup([modified]), undefined);
  assert.equal(applyGroup([{ children: [audioOutput, invite] }]), undefined);
  activeChannel = "different-room";
  const [disconnected] = applyGroup([{ children: [jsx(voiceRows.AudioRouteButton, {
    channel: { id: "voice-room" }, connected: false
  }), ownCamera] }]);
  assert.equal(disconnected.children[2].props.disabled, true);
  row.props.onPress();
  assert.equal(openedCamera, 1);
  stop();
  assert.equal(patches.size, 0);
  assert.equal(tree.props.onPress, camera);
});
