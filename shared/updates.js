const manifestUrl = "https://moggcord.cc/mobile/updates/ios/manifest.json";
const maximumBundle = 8 * 1024 * 1024;

function compare(a, b) {
  const valid = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
  if (!valid.test(a) || !valid.test(b)) throw Error("The update version is invalid.");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

/** Network reads stay in JS; signature verification, integrity and atomic installation stay in the native loader. */
export function createMobileUpdater({ version, bridge, request = (...args) => fetch(...args), reload,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const supported = bridge?.apiVersion === 1 && bridge.platform === "ios" &&
    [bridge.verify, bridge.stage, bridge.confirm].every(method => typeof method === "function");
  let state = { supported, phase: supported ? "idle" : "unsupported", version, availableVersion: "",
    message: supported ? "Update plugins and Moggcord without reinstalling Discord." : "This loader does not support in-app updates yet.",
    recoveryNotice: supported ? String(bridge.recoveryNotice || "") : "" };
  let available = null;
  const listeners = new Set();
  const set = patch => { state = { ...state, ...patch }; for (const update of listeners) update(); };
  const failed = error => set({ phase: "error", message: String(error?.message || "The update could not be loaded. Try again.").slice(0, 240) });

  async function read(url, max) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await request(url, { credentials: "omit", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw Error("The update service is unavailable. Try again shortly.");
      if (Number(response.headers?.get?.("content-length")) > max) throw Error("The update download is too large.");
      const text = await response.text();
      if (!text || text.length > max) throw Error("The update download has an invalid size.");
      return text;
    } finally { clearTimeout(timer); }
  }

  async function restart() {
    if (state.phase !== "pending") return;
    set({ phase: "restarting", message: "Restarting Discord to apply the update…" });
    await wait(400);
    try {
      if (typeof reload !== "function") throw Error("Restart unavailable");
      await reload();
    } catch {
      set({ phase: "pending", message: "The update is saved. Fully close and reopen Discord to apply it." });
    }
  }

  return {
    snapshot: () => ({ ...state }),
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    async check() {
      if (!supported || ["checking", "downloading", "restarting", "pending"].includes(state.phase)) return;
      available = null;
      set({ phase: "checking", availableVersion: "", message: "Checking for updates…" });
      try {
        const envelope = await read(manifestUrl, 16384);
        const manifest = JSON.parse(bridge.verify(envelope));
        const expected = "https://moggcord.cc/mobile/updates/ios/" + manifest.version + "/moggcord-mobile.js";
        if (manifest.platform !== "ios" || manifest.bundle !== expected || !Number.isSafeInteger(manifest.bytes) ||
            manifest.bytes < 1 || manifest.bytes > maximumBundle) throw Error("The update manifest is invalid.");
        if (compare(manifest.version, version) <= 0) set({ phase: "current", message: "Moggcord is up to date." });
        else {
          available = { envelope, manifest };
          set({ phase: "available", availableVersion: manifest.version, message: "Version " + manifest.version + " is available." });
        }
      } catch (error) { failed(error); }
    },
    async install() {
      if (!supported || state.phase !== "available" || !available) return;
      const { manifest, envelope } = available;
      set({ phase: "downloading", message: "Downloading Moggcord " + manifest.version + "…" });
      try {
        const source = await read(manifest.bundle, maximumBundle);
        if (bridge.stage(envelope, source) !== true) throw Error("The update could not be saved.");
        available = null;
        set({ phase: "pending", message: "Update saved. Preparing to restart…" });
        await restart();
      } catch (error) { failed(error); }
    },
    restart
  };
}
