/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
export const mobilePlugins = Object.freeze([
  { id: "messagelogger", title: "Message Logger", mark: "ML", category: "Chat",
    description: "View deleted and edited text from this session in a private log." },
  { id: "calltimer", title: "Call Timer", mark: "CT", category: "Voice",
    description: "See how long you have been in your current voice channel." },
  { id: "fakedeafen", title: "Fake Deafen", mark: "FD", category: "Voice", experimental: true,
    description: "Report deafened while listening with your microphone muted." }
]);

const eventTypes = new Set(["MESSAGE_DELETE", "MESSAGE_DELETE_BULK", "MESSAGE_UPDATE"]);
const ids = new Set(mobilePlugins.map(plugin => plugin.id));
const maxLog = 80;
const isId = value => typeof value === "string" && /^\d{1,22}$/.test(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function normalizePluginIds(values) {
  return Array.isArray(values) ? [...new Set(values.filter(value => ids.has(value)))] : [];
}

export function createPluginRuntime(report, now = Date.now) {
  let dispatcher, messages, users, voice, gateway;
  let enabled = new Set();
  const stops = new Map();
  const failed = new Set();
  const listeners = new Set();
  let log = [];
  let logAccount;
  let logKey = 0;
  let callId;
  let callStarted = null;
  let fakeStatus = "Waiting for a voice update";

  function safely(action) {
    try { return action(); }
    catch (error) { report(error); }
  }

  function emit() {
    for (const listener of listeners) safely(listener);
  }

  function clearLog() {
    if (!log.length) return;
    log = [];
    emit();
  }

  function account() {
    try { return users?.getCurrentUser()?.id; }
    catch { return undefined; }
  }

  function voiceId() {
    try { return voice?.getVoiceChannelId(); }
    catch { return undefined; }
  }

  function messageLog() {
    const intercept = action => {
      if (action?.type === "LOGOUT") {
        logAccount = undefined;
        clearLog();
      }
      if (!eventTypes.has(action?.type)) return false;

      safely(() => {
        const current = account();
        if (current !== logAccount) {
          logAccount = current;
          clearLog();
        }
        if (!isId(current)) return;

        const edit = action.type === "MESSAGE_UPDATE";
        const update = edit ? action.message : null;
        if (edit && !update) return;
        const channel = update ? update.channel_id : action.channelId;
        const messageIds = action.type === "MESSAGE_DELETE_BULK"
          ? Array.isArray(action.ids) ? action.ids.slice(0, maxLog) : []
          : [update ? update.id : action.id];
        if (!isId(channel)) return;
        const changed = [];
        for (const id of messageIds) {
          if (!isId(id)) continue;
          const old = messages.getMessage(channel, id);
          if (typeof old?.content !== "string" || !old.content) continue;
          if (update && (typeof update.content !== "string" || update.content === old.content)) continue;
          const name = old.author?.globalName ?? old.author?.global_name ?? old.author?.username;
          changed.push({
            key: ++logKey,
            kind: update ? "Edited" : "Deleted",
            author: typeof name === "string" ? name.slice(0, 64) : "Unknown author",
            before: old.content.slice(0, 4000),
            after: update ? update.content.slice(0, 4000) : null,
            time: now()
          });
        }
        if (changed.length) {
          log = [...changed, ...log].slice(0, maxLog);
          emit();
        }
      });
      // Discord uses a truthy interceptor result to cancel the action.
      return false;
    };
    dispatcher._interceptors ??= [];
    dispatcher._interceptors.unshift(intercept);
    return () => {
      const callbacks = dispatcher._interceptors;
      const index = callbacks?.indexOf(intercept) ?? -1;
      if (index >= 0) callbacks.splice(index, 1);
      logAccount = undefined;
      clearLog();
    };
  }

  function callTimer() {
    function setChannel(id) {
      const next = isId(id) ? id : undefined;
      if (callId === next) return;
      callId = next;
      callStarted = next ? now() : null;
      emit();
    }
    const select = event => setChannel(event?.channelId);
    const logout = () => setChannel();
    dispatcher.subscribe("VOICE_CHANNEL_SELECT", select);
    try { dispatcher.subscribe("LOGOUT", logout); }
    catch (error) {
      dispatcher.unsubscribe("VOICE_CHANNEL_SELECT", select);
      throw error;
    }
    setChannel(voiceId());
    return () => {
      dispatcher.unsubscribe("VOICE_CHANNEL_SELECT", select);
      dispatcher.unsubscribe("LOGOUT", logout);
      setChannel();
    };
  }

  function fakeDeafen() {
    const descriptor = Object.getOwnPropertyDescriptor(gateway, "voiceStateUpdate");
    const original = descriptor.value;
    let live = true;
    let last;
    fakeStatus = "Waiting for a voice update";

    function setStatus(status) {
      if (status === fakeStatus) return;
      fakeStatus = status;
      emit();
    }

    function update(state, ...rest) {
      if (!live) return Reflect.apply(original, this, [state, ...rest]);
      if (!isId(state?.channelId) || typeof state.selfMute !== "boolean" || typeof state.selfDeaf !== "boolean") {
        last = undefined;
        const result = Reflect.apply(original, this, [state, ...rest]);
        setStatus("Waiting for a voice update");
        return result;
      }
      const spoof = state.selfMute && !state.selfDeaf;
      const result = Reflect.apply(original, this, [spoof ? { ...state, selfDeaf: true } : state, ...rest]);
      last = spoof ? { socket: this, state: { ...state }, rest } : undefined;
      setStatus(spoof ? "Reporting deafened" : state.selfDeaf ? "Discord deafen is on" : "Mute your microphone to apply");
      return result;
    }

    Object.defineProperty(gateway, "voiceStateUpdate", { ...descriptor, value: update });
    return () => {
      live = false;
      if (gateway.voiceStateUpdate === update) Object.defineProperty(gateway, "voiceStateUpdate", descriptor);
      if (last && last.state.channelId === voiceId()) {
        const { socket, state, rest } = last;
        Promise.resolve(Reflect.apply(original, socket, [state, ...rest])).catch(report);
      }
      last = undefined;
    };
  }

  function available(id) {
    if (id === "messagelogger") return !!(dispatcher && messages && users);
    if (id === "calltimer") return !!(dispatcher && voice);
    return !!(gateway && voice);
  }

  const start = { messagelogger: messageLog, calltimer: callTimer, fakedeafen: fakeDeafen };
  function reconcile() {
    for (const { id } of mobilePlugins) {
      if (!enabled.has(id) && stops.has(id)) {
        const stop = stops.get(id);
        stops.delete(id);
        safely(stop);
      }
      if (!enabled.has(id) || stops.has(id) || failed.has(id) || !available(id)) continue;
      try { stops.set(id, start[id]()); }
      catch (error) { failed.add(id); report(error); }
    }
    emit();
  }

  return {
    observe(module) {
      const exported = module?.exports;
      if (!exported || typeof exported !== "object" && typeof exported !== "function") return;
      if (dispatcher && messages && users && voice && gateway) return;
      const candidates = [exported];
      for (const name of ["default", "FluxDispatcher"]) {
        if (owns(exported, name)) safely(() => candidates.push(exported[name]));
      }
      let found = false;
      for (const value of candidates) {
        if (!value) continue;
        if (!dispatcher && owns(value, "_interceptors") && typeof value.dispatch === "function"
            && typeof value.subscribe === "function" && typeof value.unsubscribe === "function") {
          dispatcher = value;
          found = true;
        }
        if (!messages && typeof value.getMessage === "function" && typeof value.getMessages === "function") {
          messages = value;
          found = true;
        }
        if (!users && typeof value.getCurrentUser === "function" && typeof value.getUser === "function") {
          users = value;
          found = true;
        }
        if (!voice && typeof value.getVoiceChannelId === "function") {
          voice = value;
          found = true;
        }
        if (!gateway && typeof value === "function" && value.prototype) {
          const method = Object.getOwnPropertyDescriptor(value.prototype, "voiceStateUpdate");
          if (typeof method?.value === "function" && (method.writable || method.configurable)) {
            gateway = value.prototype;
            found = true;
          }
        }
      }
      if (found) reconcile();
    },
    setEnabled(values) {
      enabled = new Set(normalizePluginIds(values));
      failed.clear();
      reconcile();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        plugins: mobilePlugins.map(plugin => ({
          ...plugin, enabled: enabled.has(plugin.id), active: stops.has(plugin.id),
          available: available(plugin.id), failed: failed.has(plugin.id)
        })),
        log: logAccount === account() ? log : [],
        callStarted,
        fakeStatus
      };
    },
    clearLog
  };
}
