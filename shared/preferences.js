import { normalizeEntry } from "./community.js";
import { normalizePluginIds } from "./plugins.js";

export const palettes = Object.freeze({
  midnight: { name: "Midnight", background: "#080f1d", panel: "#101c30", accent: "#84a9ff", primary: "#205bf5", onPrimary: "#ffffff", border: "#2c4165", muted: "#abbad4", text: "#f4f7ff" },
  cobalt: { name: "Cobalt", background: "#081326", panel: "#10233e", accent: "#91b7ff", primary: "#225dff", onPrimary: "#ffffff", border: "#344f78", muted: "#b2c3e0", text: "#f2f7ff" },
  dusk: { name: "Dusk", background: "#140e20", panel: "#221831", accent: "#d9b4ff", primary: "#7944c4", onPrimary: "#ffffff", border: "#513a6c", muted: "#bfaecc", text: "#fbf4ff" }
});
const storageKey = "cc.moggcord.mobile.preferences.v1";
const maxBackupLength = 65536;
const maxSavedEntries = 48;

export function normalizePreferences(input) {
  const palette = typeof input?.palette === "string" && Object.prototype.hasOwnProperty.call(palettes, input.palette) ? input.palette : "midnight";
  const saved = [];
  const seen = new Set();
  if (Array.isArray(input?.saved)) {
    for (const value of input.saved.slice(0, maxSavedEntries)) {
      const entry = normalizeEntry(value);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      saved.push(entry);
    }
  }
  return { schema: 1, palette, saved, enabledPlugins: normalizePluginIds(input?.enabledPlugins) };
}

export function readBackup(text) {
  if (typeof text !== "string" || text.length > maxBackupLength) throw new Error("The backup is too large");
  const input = JSON.parse(text);
  if (input?.schema !== 1 || typeof input.palette !== "string" || !Array.isArray(input.saved)
    || !Object.prototype.hasOwnProperty.call(palettes, input.palette)) throw new Error("Choose a Moggcord Mobile backup");
  return normalizePreferences(input);
}

export function findNativeStorage(RN) {
  for (const name of ["NativeCacheModule", "MMKVManager"]) {
    try {
      const storage = RN?.TurboModuleRegistry?.get?.(name) ?? RN?.NativeModules?.[name];
      if (typeof storage?.getItem === "function" && typeof storage.setItem === "function") return storage;
    } catch {
      // Optional Discord storage modules vary between builds.
    }
  }
  return null;
}

export function createPreferenceStore(findStorage) {
  let stored = normalizePreferences();
  let pending;
  let writes = Promise.resolve();
  let persistence = false;
  return {
    get persistent() { return persistence; },
    async load() {
      pending ??= (async () => {
        const storage = findStorage();
        if (!storage) return stored;
        persistence = true;
        const data = await storage.getItem(storageKey);
        if (typeof data === "string" && data.length <= maxBackupLength) {
          try { stored = readBackup(data); }
          catch { stored = normalizePreferences(); }
        }
        return stored;
      })();
      await pending;
      return stored;
    },
    save(input) {
      const next = normalizePreferences(input);
      stored = next;
      const operation = writes.then(async () => {
        const storage = findStorage();
        if (!storage) {
          persistence = false;
          return;
        }
        await storage.setItem(storageKey, JSON.stringify(next));
        persistence = true;
      });
      writes = operation.catch(() => { persistence = false; });
      return operation;
    }
  };
}

export function toggleSaved(preferences, entry) {
  const saved = preferences.saved.some(item => item.id === entry.id)
    ? preferences.saved.filter(item => item.id !== entry.id)
    : [entry, ...preferences.saved];
  return normalizePreferences({ ...preferences, saved });
}
