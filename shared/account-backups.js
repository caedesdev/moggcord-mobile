import { normalizePreferences, readBackup } from "./preferences.js";

const storagePrefix = "cc.moggcord.mobile.account-backup.v1.";
const backupKind = "moggcord-mobile-account";
export const maxAccountBackupLength = 65536;

export function accountIdentity(user) {
  if (typeof user?.id !== "string" || !/^[1-9][0-9]{16,19}$/.test(user.id)) return null;
  const username = typeof user.username === "string"
    ? user.username.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32)
    : "";
  return { id: user.id, username };
}

export function createAccountBackup(user, preferences, now = Date.now()) {
  const account = accountIdentity(user);
  if (!account) throw new Error("Sign in to Discord to save an account backup.");
  return { kind: backupKind, schema: 1, account, savedAt: now, settings: normalizePreferences(preferences) };
}

export function readAccountBackup(text, accountId) {
  if (typeof text !== "string" || text.length > maxAccountBackupLength) throw new Error("The account backup is too large.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Paste a valid Moggcord account backup.");
  }
  const account = accountIdentity(value?.account);
  if (value?.kind !== backupKind || value.schema !== 1 || !account
    || !Number.isSafeInteger(value.savedAt) || value.savedAt <= 0 || value.savedAt > 8.64e15) {
    throw new Error("Paste a valid Moggcord account backup.");
  }
  if (account.id !== accountId) throw new Error("This backup belongs to a different Discord account.");
  return {
    kind: backupKind, schema: 1, account, savedAt: value.savedAt,
    settings: readBackup(JSON.stringify(value.settings))
  };
}

export function createAccountBackupStore(findStorage) {
  let pending = Promise.resolve();

  function storageFor(accountId) {
    if (!accountIdentity({ id: accountId })) throw new Error("Sign in to Discord to manage an account backup.");
    const storage = findStorage();
    if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function") {
      throw new Error("Backup storage is unavailable on this device.");
    }
    return storage;
  }

  return {
    async load(accountId) {
      await pending;
      const text = await storageFor(accountId).getItem(storagePrefix + accountId);
      return text == null ? null : readAccountBackup(text, accountId);
    },
    async save(backup, accountId) {
      const next = readAccountBackup(JSON.stringify(backup), accountId);
      const task = pending.then(async () => {
        await storageFor(accountId).setItem(storagePrefix + accountId, JSON.stringify(next));
        return next;
      });
      pending = task.catch(() => {});
      return task;
    }
  };
}
