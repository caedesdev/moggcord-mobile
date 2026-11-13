import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base64 } from "@scure/base";

const directory = "moggcord-updates/";
const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const normalizePath = path => path.replace(/^\/data\/data\//, "/data/user/0/").replace(/\/+$/, "");

export function createAndroidUpdaterBridge(config, files, write) {
  if (config?.apiVersion !== 1 || typeof files?.writeFile !== "function") return;
  try {
    const documents = files.getConstants?.()?.DocumentsDirPath ?? files.DocumentsDirPath;
    if (typeof documents !== "string" || typeof config.filesDir !== "string" ||
        normalizePath(documents) !== normalizePath(config.filesDir)) return;
  } catch { return; }

  function verify(envelope) {
    if (envelope.length > 16384) throw Error("The Android update manifest is too large.");
    const fields = JSON.parse(envelope);
    const payload = base64.decode(fields.payload);
    const signature = base64.decode(fields.signature);
    if (payload.length > 8192 || !p256.verify(signature, payload, base64.decode(config.publicKey), {
      format: "der", prehash: true, lowS: false,
    })) throw Error("The Android update signature is invalid.");
    const text = String.fromCharCode(...payload);
    const manifest = JSON.parse(text);
    if (manifest.schema !== 1 || manifest.platform !== "android" ||
        !Number.isSafeInteger(manifest.minLoader) || manifest.minLoader < 1 || manifest.minLoader > config.apiVersion ||
        manifest.discordBuild !== config.discordBuild || !versionPattern.test(manifest.version) ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256) || !/^[a-f0-9]{40}$/.test(manifest.revision) ||
        !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 8 * 1024 * 1024 ||
        manifest.bundle !== "https://moggcord.cc/mobile/updates/android/" + manifest.version + "/moggcord-mobile.js") {
      throw Error("There is no runtime update for this Discord build. Check Downloads for a newer launcher.");
    }
    return text;
  }

  return {
    apiVersion: 1,
    platform: "android",
    recoveryNotice: config.recoveryNotice,
    verify,
    async stage(envelope, source) {
      const manifest = JSON.parse(verify(envelope));
      // The shared build emits ASCII so the hash is over the exact published file bytes.
      if (source.length !== manifest.bytes || /[^\x00-\x7f]/.test(source) ||
          bytesToHex(sha256(Uint8Array.from(source, character => character.charCodeAt(0)))) !== manifest.sha256) {
        throw Error("The Android update failed its integrity check.");
      }
      await write(directory + "pending.json", JSON.stringify({ envelope, source }));
      return true;
    },
    async confirm(version) {
      if (version === config.candidateVersion) {
        await write(directory + "confirmed.txt", config.candidateHash);
      }
    },
  };
}
