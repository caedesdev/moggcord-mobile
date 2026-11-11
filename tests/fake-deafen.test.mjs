import test from "node:test";
import assert from "node:assert/strict";
import { nativeModule } from "./native-host.mjs";

async function voiceHost(saved = {}) {
  const listeners = new Set(), cleanups = [], packets = [], commands = new Map(), buttons = new Map();
  const media = { channel: "voice-a", muted: false, deafened: false, video: false, available: true };
  const notices = [], warnings = [];
  let toggle, plugin;
  class Gateway {
    voiceStateUpdate(state, metadata) { packets.push({ state, metadata }); return "sent"; }
  }
  const original = Gateway.prototype.voiceStateUpdate;
  const gateway = new Gateway();
  const mediaStore = { isSelfMute: () => media.muted, isSelfDeaf: () => media.deafened, isVideoEnabled: () => media.video };
  const stores = {
    SelectedChannelStore: { getVoiceChannelId: () => media.channel },
    ChannelStore: { getChannel: id => ({ id, guild_id: id === "voice-a" ? "guild-a" : "guild-b" }) }
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    "@core/i18n": { t: value => value, tx: value => value },
    "@core/vendetta/storage": { useProxy: value => value },
    "@lib/api/assets": { findAssetId: value => value },
    "@lib/api/commands": { registerCommand(definition) { commands.set(definition.name, definition); return () => commands.delete(definition.name); } },
    "@lib/api/commands/types": { ApplicationCommandOptionType: { BOOLEAN: 5 } },
    "@lib/api/patcher": { before(key, target, callback) {
      const original = target[key];
      const patched = function (...args) { return Reflect.apply(original, this, callback.call(this, args) ?? args); };
      target[key] = patched;
      return () => { if (target[key] === patched) target[key] = original; };
    } },
    "@lib/ui/toasts": { showToast: value => notices.push(value) },
    "@metro/common": { messageUtil: { sendBotMessage() {} } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "../api": {
      definePlugin(definition) {
        const values = { ...Object.fromEntries(Object.entries(definition.settings).map(([key, value]) => [key, value.default])), ...saved };
        definition.store = new Proxy(values, { set(target, key, value) {
          const changed = target[key] !== value;
          target[key] = value;
          if (changed) for (const listener of listeners) listener(key);
          return true;
        } });
        return definition;
      },
      onSettingChange(_store, listener) { listeners.add(listener); return () => listeners.delete(listener); }
    },
    "../common": {
      getStore: name => name === "MediaEngineStore" ? media.available ? mediaStore : null : stores[name],
      moduleAt(path) {
        if (path === "modules/gateway/GatewaySocket.tsx") return { default: Gateway };
        if (path === "modules/gateway/GatewaySocketSingleton.tsx") return { default: gateway };
        if (path.includes("MicrophoneIcon.tsx")) return { MicrophoneIcon: "MicrophoneIcon" };
        if (path.includes("HeadphonesIcon.tsx")) return { HeadphonesIcon: "HeadphonesIcon" };
      },
      addChatButton(button) { buttons.set(button.key, button); return () => buttons.delete(button.key); },
      getChatInputActionButton: () => "ChatButton"
    },
    "../silentTyping": { SlashedIcon: "SlashedIcon" },
    "./controls": { installFakeDeafenControls(_plugin, callback) { toggle = callback; return () => { toggle = null; }; } }
  };
  plugin = (await nativeModule("runtime/src/plugins/fakeMute/index.tsx", modules)).default;
  const start = () => plugin.start({ store: plugin.store, logger: { warn: (...args) => warnings.push(args) }, cleanup: (...fns) => cleanups.push(...fns) });
  const stop = () => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); };
  const send = overrides => gateway.voiceStateUpdate(Object.freeze({ guildId: "guild-a", channelId: media.channel,
    selfMute: media.muted, selfDeaf: media.deafened, selfVideo: media.video, ...overrides }));
  return { plugin, media, gateway, original, packets, commands, buttons, notices, warnings, listeners,
    start, stop, send, toggle: () => toggle(), last: () => JSON.parse(JSON.stringify(packets.at(-1)?.state)) };
}

test("loading the real Fake Deafen plugin clears saved fake flags and advertises the real microphone state", async () => {
  const host = await voiceHost({ fakeMute: true, fakeDeafen: true, button: "right" });
  host.start();
  assert.equal(host.plugin.settings.fakeDeafen.default, false);
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.plugin.store.fakeDeafen, false);
  assert.equal(host.plugin.store.button, "right");
  assert.deepEqual(host.last(), { guildId: "guild-a", channelId: "voice-a", selfMute: false, selfDeaf: false, selfVideo: false });
  host.stop();
  assert.equal(host.gateway.voiceStateUpdate, host.original);
  assert.equal(host.listeners.size, 0);
});

test("the ghost can turn off either fake mode and never keeps a separate fake-mute flag enabled", async () => {
  const host = await voiceHost();
  host.start();
  host.plugin.store.fakeMute = true;
  assert.equal(host.last().selfMute, true);
  assert.equal(host.media.muted, false);
  host.toggle();
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.plugin.store.fakeDeafen, false);
  assert.equal(host.last().selfMute, false);
  assert.equal(host.last().selfDeaf, false);
  host.toggle();
  assert.equal(host.plugin.store.fakeDeafen, true);
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.last().selfMute, false);
  host.toggle();
  assert.equal(host.plugin.store.fakeDeafen, false);
  assert.equal(host.last().selfMute, false);
  assert.equal(host.notices.at(-1), "Fake Deafen disabled");
  host.stop();
});

test("native microphone and deafen controls keep working while the ghost switches fake deafen on and off", async () => {
  const host = await voiceHost();
  host.start();
  host.media.muted = true;
  host.send();
  host.toggle();
  assert.equal(host.last().selfMute, true);
  assert.equal(host.last().selfDeaf, true);
  assert.equal(host.media.deafened, false);
  host.media.muted = false;
  host.send();
  assert.equal(host.last().selfMute, false);
  assert.equal(host.last().selfDeaf, false);
  host.media.muted = true;
  host.send();
  host.toggle();
  assert.equal(host.last().selfMute, true);
  assert.equal(host.last().selfDeaf, false);
  host.media.deafened = true;
  host.send();
  host.toggle();
  host.toggle();
  assert.equal(host.last().selfMute, true);
  assert.equal(host.last().selfDeaf, true);
  assert.equal(host.media.deafened, true);
  host.stop();
});

test("settings, chat buttons and commands switch modes without leaving a hidden fake mute running", async () => {
  const host = await voiceHost();
  host.start();
  host.plugin.store.fakeMute = true;
  host.plugin.store.fakeDeafen = true;
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.last().selfMute, false);
  host.commands.get("fakemute").execute([{ name: "value", value: true }], { channel: { id: "text" } });
  assert.equal(host.plugin.store.fakeDeafen, false);
  assert.equal(host.last().selfMute, true);
  const render = host.buttons.get("fake-deafen").render();
  render.type(render.props).props.onPress();
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.plugin.store.fakeDeafen, true);
  assert.equal(host.last().selfMute, false);
  host.toggle();
  assert.equal(host.last().selfMute, false);
  host.stop();
});

test("turning off the plugin uses current native flags instead of replaying a stale cached mute", async () => {
  const host = await voiceHost();
  host.start();
  host.media.muted = true;
  host.send({ selfVideo: true, preferredRegion: "auto" });
  host.plugin.store.fakeMute = true;
  host.media.muted = false;
  host.media.video = false;
  host.stop();
  assert.deepEqual(host.last(), { guildId: "guild-a", channelId: "voice-a", selfMute: false, selfDeaf: false, selfVideo: false, preferredRegion: "auto" });
  assert.equal(host.plugin.store.fakeMute, false);
  assert.equal(host.plugin.store.fakeDeafen, false);
  assert.equal(host.gateway.voiceStateUpdate, host.original);
});

test("disconnects clear fake modes and stopping or toggling after leaving cannot rejoin an old call", async () => {
  for (const disconnected of [null, undefined]) {
    const host = await voiceHost();
    host.start();
    host.plugin.store.fakeMute = true;
    host.media.channel = null;
    host.gateway.voiceStateUpdate({ channelId: disconnected, selfMute: false, selfDeaf: false });
    assert.equal(host.plugin.store.fakeMute, false);
    assert.equal(host.plugin.store.fakeDeafen, false);
    const count = host.packets.length;
    host.toggle();
    host.stop();
    assert.equal(host.packets.length, count);
    host.media.channel = "voice-b";
    host.start();
    assert.equal(host.plugin.store.fakeDeafen, false);
    assert.equal(host.last().channelId, "voice-b");
    assert.equal(host.last().guildId, "guild-b");
    assert.equal(host.last().selfMute, false);
    host.stop();
  }
});

test("the gateway patch preserves unrelated payload fields and arguments and never mutates Discord's packet", async () => {
  const host = await voiceHost();
  host.start();
  host.plugin.store.fakeMute = true;
  const packet = Object.freeze({ channelId: "voice-a", selfMute: false, selfDeaf: false, selfVideo: true, preferredRegion: "auto" });
  const metadata = { source: "native-control" };
  assert.equal(host.gateway.voiceStateUpdate(packet, metadata), "sent");
  assert.equal(packet.selfMute, false);
  assert.equal(host.last().selfMute, true);
  assert.equal(host.last().selfVideo, true);
  assert.equal(host.last().preferredRegion, "auto");
  assert.equal(host.packets.at(-1).metadata, metadata);
  host.gateway.voiceStateUpdate(undefined, metadata);
  assert.equal(host.packets.at(-1).state, undefined);
  host.stop();
});
