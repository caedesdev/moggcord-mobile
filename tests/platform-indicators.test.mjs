import assert from "node:assert/strict";
import test from "node:test";
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
  const { default: plugin } = await nativeModule("runtime/src/plugins/platformIndicators/index.tsx", {
    "@core/i18n": { t: text => text, tx: text => text },
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
    "@metro": { findByName: () => RowManager },
    "../api": { definePlugin: definition => ({ ...definition, store: { messages: true, self: false, offline: true } }) },
    "../common": {
      currentUserId: () => "self",
      getStore(name) {
        if (name === "PresenceStore") return { getClientStatus: () => presence };
        if (name === "SessionsStore") return { getSessions: () => sessions };
      },
      subscribe(name, callback) { events.set(name, callback); return () => events.delete(name); }
    }
  }, { __MOGGCORD_PLATFORM_ICONS__: nativeIcons ? { apiVersion: 1 } : undefined });
  const start = () => plugin.start({ store: plugin.store, cleanup: (...callbacks) => cleanups.push(...callbacks) });
  const row = { type: 1, message: { timestamp: "10:42" } };
  const render = (author = { id: "other" }, target = row) =>
    new RowManager().generate({ message: { author }, row: target });
  return { plugin, start, render, row, events, presence, sessions, RowManager, original,
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
