import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../runtime/src/entry.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "cjs" });
const settle = () => new Promise(resolve => setImmediate(resolve));

function startupHost({ initCache = async () => {}, initRuntime = async () => {}, appRegistry, hasTimers = true } = {}) {
  const calls = [];
  let started = false;
  let entryRequests = 0;
  const bridge = {
    getCallableModule: name => started && name === "AppRegistry",
    __callFunction(name, method, application) {
      calls.push(`bridge ${name}.${method} ${application}`);
    },
    flushedQueue: () => null,
    callFunctionReturnFlushedQueue(...args) {
      this.__callFunction(...args);
      return this.flushedQueue();
    }
  };
  const registry = appRegistry ?? { runApplication: name => calls.push(`RN runApplication ${name}`) };
  const originalBridgeCall = bridge.callFunctionReturnFlushedQueue;
  const originalRunApplication = registry.runApplication;
  const modules = {
    "bunny-build-info": { version: "test" },
    spitroast: require("spitroast"),
    "@core/timings": { step: (_name, run) => run() },
    "@metro/internals/caches": { initMetroCache() {
      calls.push("Metro cache");
      return initCache();
    } },
    "@lib/addons/themes/colors/recovery": { recoverDiscordTheme: async () => { calls.push("theme recovery"); } },
    ".": { default: async () => {
      calls.push("Moggcord runtime");
      return initRuntime(context.__r);
    } }
  };
  let elapsed = 0;
  let nextTimer = 0;
  const timers = new Map();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(modules, name)) throw new Error(`Native dependency is unavailable: ${name}`);
      return modules[name];
    },
    Date: class extends Date { static now() { return elapsed; } },
    setTimeout: hasTimers ? (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, at: elapsed + delay });
      return id;
    } : undefined,
    clearTimeout: hasTimers ? id => timers.delete(id) : undefined,
    __vendetta_loader: { name: "Moggcord Mobile" },
    __fbBatchedBridge: bridge,
    RN$AppRegistry: registry
  });
  vm.runInContext(code, context, { filename: "runtime/src/entry.ts" });
  context.__r = id => {
    if (id !== 0) return id;
    entryRequests++;
    if (!started) {
      started = true;
      calls.push("Discord entry");
    }
    return "Discord module exports";
  };
  return {
    calls,
    get entryRequests() { return entryRequests; },
    start: () => context.__r(0),
    callBridge: () => bridge.callFunctionReturnFlushedQueue("AppRegistry", "runApplication", "Discord"),
    callRegistry: () => registry.runApplication("Discord"),
    advance(ms) {
      elapsed += ms;
      for (const [id, timer] of timers) {
        if (timer.at > elapsed) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    assertRestored() {
      assert.equal(bridge.callFunctionReturnFlushedQueue, originalBridgeCall);
      assert.equal(registry.runApplication, originalRunApplication);
    }
  };
}

const nativeReplay = ["bridge AppRegistry.runApplication Discord", "RN runApplication Discord"];
const discordStartup = ["Discord entry", ...nativeReplay];

test("Discord starts after Moggcord initialization and then replays deferred native calls", async () => {
  const cache = Promise.withResolvers();
  const host = startupHost({ initCache: () => cache.promise });
  host.start();
  host.callBridge();
  host.callRegistry();
  await settle();
  assert.deepEqual(host.calls, ["Metro cache"]);

  cache.resolve();
  await settle();
  assert.deepEqual(host.calls, ["Metro cache", "theme recovery", "Moggcord runtime", ...discordStartup]);
  host.assertRestored();
});

test("Moggcord can require Discord's entry during initialization without releasing native calls early", async () => {
  const runtime = Promise.withResolvers();
  let discordExports;
  const host = startupHost({ initRuntime(requireMetro) {
    discordExports = requireMetro(0);
    return runtime.promise;
  } });
  host.start();
  host.callBridge();
  host.callRegistry();
  await settle();
  assert.equal(discordExports, "Discord module exports");
  const initializing = ["Metro cache", "theme recovery", "Moggcord runtime", "Discord entry"];
  assert.deepEqual(host.calls, initializing);

  runtime.resolve();
  await settle();
  assert.deepEqual(host.calls, [...initializing, ...nativeReplay]);
  host.assertRestored();
});

test("the startup deadline releases Discord once and ignores late Metro cache completion", async () => {
  const cache = Promise.withResolvers();
  const host = startupHost({ initCache: () => cache.promise });
  host.start();
  host.callBridge();
  host.callRegistry();
  await settle();

  host.advance(9_999);
  await settle();
  assert.deepEqual(host.calls, ["Metro cache"]);
  host.advance(1);
  await settle();
  assert.deepEqual(host.calls, ["Metro cache", ...discordStartup]);
  assert.equal(host.entryRequests, 1);
  host.assertRestored();

  cache.resolve();
  await settle();
  assert.deepEqual(host.calls, ["Metro cache", ...discordStartup]);
  assert.equal(host.entryRequests, 1);
});

test("startup errors release Discord when native diagnostics are unavailable", async () => {
  const host = startupHost({ initCache: async () => { throw new Error("Native cache is unavailable"); } });
  host.start();
  host.callBridge();
  host.callRegistry();
  await settle();
  assert.deepEqual(host.calls, ["Metro cache", ...discordStartup]);
  host.assertRestored();
});

test("a React Native registry without runApplication cannot block the Discord entry or bridge", async () => {
  const host = startupHost({ appRegistry: {} });
  host.start();
  host.callBridge();
  await settle();
  assert.deepEqual(host.calls.filter(call => /^(Discord|bridge) /.test(call)), discordStartup.slice(0, 2));
  host.assertRestored();
});

test("Discord starts when the runtime does not have global timers yet", async () => {
  const host = startupHost({ hasTimers: false, initCache: () => new Promise(() => {}) });
  host.start();
  host.callBridge();
  host.callRegistry();
  await settle();
  assert.deepEqual(host.calls, discordStartup);
  host.assertRestored();
});
