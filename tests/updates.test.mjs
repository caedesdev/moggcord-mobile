import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createMobileUpdater } from "../shared/updates.js";
import { createAndroidUpdaterBridge } from "../shared/android-updates.js";

function host(options = {}) {
  const requests = [], stages = [], reloads = [];
  const manifest = { platform: "ios", version: "0.4.1", bytes: 18,
    bundle: "https://moggcord.cc/mobile/updates/ios/0.4.1/moggcord-mobile.js", ...options.manifest };
  const bridge = { apiVersion: 1, platform: "ios", confirm() {},
    verify(text) { assert.equal(text, "signed-envelope"); if (options.invalidSignature) throw Error("Signature failed"); return JSON.stringify(manifest); },
    stage(envelope, source) { stages.push({ envelope, source }); if (options.invalidPayload) throw Error("Payload hash mismatch"); return true; }
  };
  const updater = createMobileUpdater({ version: "0.4.0", bridge, wait: async () => {},
    reload() { reloads.push(true); if (options.failedReload) throw Error("Native reload unavailable"); },
    async request(url, config) {
      requests.push(url);
      assert.equal(config.credentials, "omit");
      assert.equal(config.cache, "no-store");
      assert(config.signal instanceof AbortSignal);
      assert.equal(Object.hasOwn(config, "headers"), false);
      return { ok: !options.unavailable, headers: { get: () => options.oversized ? String(9 * 1024 * 1024) : null },
        text: async () => url.endsWith("manifest.json") ? "signed-envelope" : "/* valid update */" };
    }
  });
  return { updater, requests, stages, reloads };
}

test("mobile updates verify metadata before downloading, stage once, then use native restart", async () => {
  const { updater, requests, stages, reloads } = host();
  let changes = 0;
  const stop = updater.subscribe(() => changes++);
  assert.equal(requests.length, 0);
  await updater.install();
  assert.equal(reloads.length, 0);
  await updater.check();
  assert.equal(updater.snapshot().phase, "available");
  assert.equal(updater.snapshot().availableVersion, "0.4.1");
  await Promise.all([updater.install(), updater.install()]);
  assert.equal(requests.length, 2);
  assert.equal(stages.length, 1);
  assert.equal(stages[0].envelope, "signed-envelope");
  assert.equal(stages[0].source, "/* valid update */");
  assert.equal(reloads.length, 1);
  assert.equal(updater.snapshot().phase, "restarting");
  assert(changes >= 5);
  stop();
});

test("unverified, oversized and foreign-origin updates never stage or restart", async () => {
  for (const options of [{ invalidSignature: true }, { oversized: true },
    { manifest: { bundle: "https://example.com/code.js" } }, { unavailable: true }]) {
    const { updater, requests, stages, reloads } = host(options);
    await updater.check(); await updater.install();
    assert.equal(updater.snapshot().phase, "error");
    assert.equal(requests.length, 1);
    assert.equal(stages.length, 0);
    assert.equal(reloads.length, 0);
  }
});

test("native integrity failures keep the existing runtime; restart failures keep a verified pending update", async () => {
  const broken = host({ invalidPayload: true });
  await broken.updater.check(); await broken.updater.install();
  assert.equal(broken.updater.snapshot().phase, "error");
  assert.equal(broken.reloads.length, 0);
  const saved = host({ failedReload: true });
  await saved.updater.check(); await saved.updater.install();
  assert.equal(saved.updater.snapshot().phase, "pending");
  assert.match(saved.updater.snapshot().message, /saved/);
  await saved.updater.restart();
  assert.equal(saved.reloads.length, 2);
  assert.equal(saved.stages.length, 1);
});

test("current, older and unsupported loaders do not download updates", async () => {
  for (const version of ["0.4.0", "0.3.9"]) {
    const same = host({ manifest: { version, bundle: `https://moggcord.cc/mobile/updates/ios/${version}/moggcord-mobile.js` } });
    await same.updater.check(); await same.updater.install();
    assert.equal(same.updater.snapshot().phase, "current");
    assert.equal(same.stages.length + same.reloads.length, 0);
  }
  const unsupported = createMobileUpdater({ version: "0.3.1", bridge: null, request() { assert.fail("Unexpected network request"); } });
  await unsupported.check(); await unsupported.install();
  assert.equal(unsupported.snapshot().supported, false);
});

test("Android checks its own signed feed, verifies the download, then stages and restarts", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const source = "/* Android update */";
  const digest = createHash("sha256").update(source).digest("hex");
  const url = "https://moggcord.cc/mobile/updates/android/";
  const manifest = { schema: 1, platform: "android", version: "0.4.15", bytes: source.length, minLoader: 1,
    discordBuild: "353011", bundle: url + "0.4.15/moggcord-mobile.js", revision: "a".repeat(40), sha256: digest };
  function signed(fields) {
    const payload = Buffer.from(JSON.stringify(fields));
    return JSON.stringify({ payload: payload.toString("base64"),
      signature: sign("sha256", payload, privateKey).toString("base64") });
  }
  const envelope = signed(manifest);
  const writes = [], requests = [];
  const bridge = createAndroidUpdaterBridge({ apiVersion: 1, discordBuild: "353011",
    publicKey: publicKey.export({ type: "spki", format: "der" }).subarray(-65).toString("base64"),
    filesDir: "/data/user/0/cc.moggcord.mobile.discord/files", candidateVersion: manifest.version, candidateHash: digest },
  { getConstants: () => ({ DocumentsDirPath: "/data/data/cc.moggcord.mobile.discord/files" }), writeFile() {} },
  async (name, data) => { writes.push({ name, data }); });
  assert.throws(() => bridge.verify(signed({ ...manifest, discordBuild: "352017" })), /Discord build/);
  assert.throws(() => bridge.verify(signed({ ...manifest, platform: "ios" })), /Discord build/);
  const tampered = JSON.parse(envelope);
  tampered.payload = Buffer.from(JSON.stringify({ ...manifest, version: "0.4.16" })).toString("base64");
  assert.throws(() => bridge.verify(JSON.stringify(tampered)), /signature/);
  await assert.rejects(bridge.stage(envelope, "x".repeat(source.length)), /integrity/);
  let restarts = 0;
  const updater = createMobileUpdater({ version: "0.4.14", bridge, wait: async () => {}, reload: () => { restarts++; },
    request: async path => {
      requests.push(path);
      return { ok: true, text: async () => path.endsWith("manifest.json") ? envelope : source };
    } });
  await updater.check();
  assert.equal(updater.snapshot().availableVersion, manifest.version);
  await updater.install();
  assert.deepEqual(requests, [url + "manifest.json", manifest.bundle]);
  assert.deepEqual(writes, [{ name: "moggcord-updates/pending.json", data: JSON.stringify({ envelope, source }) }]);
  assert.equal(restarts, 1);
  await bridge.confirm("0.4.14");
  await bridge.confirm(manifest.version);
  assert.deepEqual(writes[1], { name: "moggcord-updates/confirmed.txt", data: digest });
});
