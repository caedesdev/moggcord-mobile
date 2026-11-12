import assert from "node:assert/strict";
import test from "node:test";
import spitroast from "spitroast";
import { nativeModule } from "./native-host.mjs";

async function host(nativeIcons = true) {
  const cleanups = [];
  const events = new Map();
  const presence = { desktop: "dnd", web: "idle", mobile: "online", embedded: "invisible", vr: "offline" };
  const sessions = { desktop: { clientInfo: { client: "desktop" }, status: "idle" } };
  class RowManager {
    generate({ row }) { return row; }
  }
  const original = RowManager.prototype.generate;
  const renderer = await nativeModule("runtime/src/plugins/platformIndicators/render.ts", {
    "@core/i18n": { t: text => text },
    "@lib/api/patcher": {
      after(key, object, callback) {
        const original = object[key];
        object[key] = function (...args) {
          const result = original.apply(this, args);
          return callback(args, result) ?? result;
        };
        return () => { object[key] = original; };
      }
    },
    "@metro": { findByName: () => RowManager }
  }, { __MOGGCORD_PLATFORM_ICONS__: nativeIcons ? { apiVersion: 1 } : undefined });
  const { default: plugin } = await nativeModule("runtime/src/plugins/platformIndicators/index.tsx", {
    "@core/i18n": { tx: text => text },
    "./render": renderer,
    "../api": { definePlugin: definition => ({ ...definition, store: { messages: true, self: false, offline: true } }) },
    "../common": {
      currentUserId: () => "self",
      getStore(name) {
        if (name === "PresenceStore") return { getClientStatus: () => presence };
        if (name === "SessionsStore") return { getSessions: () => sessions };
      },
      subscribe(name, callback) { events.set(name, callback); return () => events.delete(name); }
    }
  });
  const start = () => plugin.start({ store: plugin.store, cleanup: (...callbacks) => cleanups.push(...callbacks) });
  const row = { type: 1, message: { timestamp: "10:42" } };
  const render = (author = { id: "other" }, target = row) =>
    new RowManager().generate({ message: { author }, row: target });
  return { plugin, start, render, row, events, presence, sessions, RowManager, original, renderer,
    stop: () => cleanups.reverse().forEach(cleanup => cleanup()) };
}

test("native platform indicators encode each device's status without adding emoji to the timestamp", async () => {
  const state = await host();
  state.start();
  assert.equal(state.render().message.timestamp, "10:42  ⁣mcpi|d2w1m0⁣");
  assert.equal(state.render().message.timestamp, "10:42  ⁣mcpi|d2w1m0⁣");
  state.plugin.store.offline = false;
  assert.equal(state.render().message.timestamp, "10:42  ⁣mcpi|d2w1m0c3v3⁣");
  state.presence.desktop = "online";
  state.events.get("PRESENCE_UPDATES")();
  assert.equal(state.render().message.timestamp, "10:42  ⁣mcpi|d0w1m0c3v3⁣");
  state.stop();
  assert.equal(state.RowManager.prototype.generate, state.original);
  assert.equal(state.events.size, 0);
});

test("message filters remove old indicators and self sessions use the same device icons", async () => {
  const state = await host();
  state.start();
  state.render();
  state.plugin.store.messages = false;
  assert.equal(state.render().message.timestamp, "10:42");
  state.plugin.store.messages = true;
  assert.equal(state.render({ id: "bot", bot: true }).message.timestamp, "10:42");
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42");
  state.plugin.store.self = true;
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|d1m0⁣");
  state.sessions.desktop.status = "dnd";
  state.events.get("SESSIONS_REPLACE")();
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|d2m0⁣");
  const system = { type: 2, message: { timestamp: "10:42" } };
  assert.equal(state.render({ id: "other" }, system), system);
  assert.equal(system.message.timestamp, "10:42");
  state.stop();
});

test("older apps report the required native update before a timestamp is modified", async () => {
  const state = await host(false);
  assert.throws(state.start, /Install the latest Moggcord Mobile app once/);
  assert.equal(state.RowManager.prototype.generate, state.original);
  assert.equal(state.row.message.timestamp, "10:42");
});

test("the local platform preview coexists with real indicators and changes only the current user's rendered icon", async () => {
  const state = await host();
  const { default: preview } = await nativeModule("runtime/src/plugins/platformSpoofer/index.tsx", {
    "@core/i18n": { tx: text => text },
    "@lib/api/patcher": spitroast,
    "@metro": {},
    "react-native": { Platform: { OS: "ios" } },
    "../api": { definePlugin: definition => ({ ...definition, store: { device: "browser" } }) },
    "../common": { currentUserId: () => "self" },
    "../platformIndicators/render": state.renderer
  });
  const cleanups = [];
  preview.start({ store: preview.store, cleanup: callback => cleanups.push(callback) });
  assert.equal(state.render().message.timestamp, "10:42");
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|w0⁣");

  state.start();
  state.plugin.store.self = true;
  assert.equal(state.render().message.timestamp, "10:42  ⁣mcpi|d2w1m0⁣");
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|w0⁣");
  preview.store.device = "mobile";
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|m0⁣");
  cleanups.forEach(cleanup => cleanup());
  assert.equal(state.render({ id: "self" }).message.timestamp, "10:42  ⁣mcpi|d1m0⁣");
  assert.equal(state.sessions.desktop.clientInfo.client, "desktop");
  state.stop();
  assert.equal(state.RowManager.prototype.generate, state.original);
});

async function platformPresence(os, { missingFastConnect = false } = {}) {
  const stock = Object.freeze({ browser: os === "ios" ? "Discord iOS" : "Discord Android", os, locale: "en" });
  const getSuperProperties = () => stock;
  const properties = { getSuperProperties, getSuperPropertiesBase64() {} };
  const socket = {
    handleIdentify() {
      assert.equal(this, socket);
      return { properties: properties.getSuperProperties(), presence: { status: "idle" } };
    }
  };
  const fastConnect = {
    identifyWebSocket(fail = false) {
      assert.equal(this, fastConnect);
      if (fail) throw new Error("Connection failed");
      return JSON.stringify({ op: 2, d: { properties: properties.getSuperProperties(), capabilities: 7 } });
    }
  };
  const cleanups = [];
  const { default: plugin } = await nativeModule("runtime/src/plugins/platformSpoofer/index.tsx", {
    "@core/i18n": { t: text => text, tx: text => text },
    "@lib/api/patcher": spitroast,
    "@metro": { findByProps: () => properties },
    "react-native": { Platform: { OS: os } },
    "../api": { definePlugin: def => def },
    "../common": { moduleAt: path => path === "modules/gateway/GatewaySocketSingleton.tsx"
      ? { socket } : missingFastConnect ? {} : fastConnect },
    "../platformIndicators/render": { installPlatformIconProvider() { assert.fail("Presence must not install a local preview"); } }
  });
  const store = { device: "browser", visibleToOthers: true };
  const start = () => plugin.start({ store, cleanup: callback => cleanups.push(callback) });
  return { stock, getSuperProperties, properties, socket, fastConnect, store, start,
    stop: () => cleanups.reverse().forEach(cleanup => cleanup()) };
}

for (const os of ["ios", "android"]) {
  test(`platform presence changes only the browser field during both ${os} connection paths`, async () => {
    const state = await platformPresence(os);
    state.start();
    assert.equal(state.properties.getSuperProperties(), state.stock);
    const normal = state.socket.handleIdentify();
    assert.equal(JSON.stringify(normal), JSON.stringify({
      properties: { ...state.stock, browser: "Discord Web" }, presence: { status: "idle" }
    }));
    assert.deepEqual(JSON.parse(state.fastConnect.identifyWebSocket()), {
      op: 2, d: { properties: { ...state.stock, browser: "Discord Web" }, capabilities: 7 }
    });
    assert.throws(() => state.fastConnect.identifyWebSocket(true), /Connection failed/);
    assert.equal(state.properties.getSuperProperties(), state.stock);
    state.store.device = "invalid";
    assert.equal(state.socket.handleIdentify().properties, state.stock);
    state.store.device = "desktop";
    state.store.visibleToOthers = false;
    assert.equal(state.socket.handleIdentify().properties, state.stock);
    state.stop();
    assert.equal(state.properties.getSuperProperties, state.getSuperProperties);
  });
}

test("platform presence leaves the connection untouched when Discord's hooks are unavailable", async () => {
  const state = await platformPresence("ios", { missingFastConnect: true });
  assert.throws(state.start, /does not support reporting a different platform/);
  assert.equal(state.properties.getSuperProperties, state.getSuperProperties);
  assert.equal(state.socket.handleIdentify().properties, state.stock);
});
