import assert from "node:assert/strict";
import test from "node:test";
import { accountIdentity, createAccountBackup, createAccountBackupStore, readAccountBackup } from "../shared/account-backups.js";
import { nativeModule } from "./native-host.mjs";

const first = { id: "123456789012345678", username: "first" };
const second = { id: "234567890123456789", username: "second" };
const createdAt = 1760000000000;

test("account backups save settings separately and reject imports under a different account", async () => {
  const records = new Map();
  const store = createAccountBackupStore(() => ({ getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) }));
  const backup = createAccountBackup(first, { palette: "cobalt", enabledPlugins: ["moggcord.platform-spoofer"] }, createdAt);
  await Promise.all([store.save(backup, first.id), store.save(createAccountBackup(second, { palette: "dusk" }, createdAt), second.id)]);
  assert.deepEqual(await store.load(first.id), backup);
  assert.equal((await store.load(second.id)).settings.palette, "dusk");
  assert.throws(() => readAccountBackup(JSON.stringify(backup), second.id), /different Discord account/);
  await assert.rejects(store.save(backup, second.id), /different Discord account/);
  assert.equal(await store.load("345678901234567890"), null);
  await assert.rejects(store.load("../../other"), /Sign in/);
});

test("account exports retain only account identity and normalized Moggcord preferences", async () => {
  const account = { ...first, token: "private-session", email: "private@example.invalid" };
  const backup = createAccountBackup(account, {
    palette: "midnight", token: "private-settings", enabledPlugins: ["unknown-plugin"]
  }, createdAt);
  const restored = readAccountBackup(JSON.stringify({ ...backup, credentials: "private-import", account }), first.id);
  assert.deepEqual(restored, {
    kind: "moggcord-mobile-account", schema: 1, account: first, savedAt: createdAt,
    settings: { schema: 1, palette: "midnight", saved: [], enabledPlugins: [] }
  });
  assert(!JSON.stringify(restored).includes("private"));
  assert.throws(() => readAccountBackup("x".repeat(65537), first.id), /too large/);
  assert.throws(() => readAccountBackup("{", first.id), /valid Moggcord/);
  assert.throws(() => readAccountBackup(JSON.stringify({ ...backup, savedAt: 0 }), first.id), /valid Moggcord/);
});

test("the account shortcut delegates to Discord's modal only when the stock mobile feature is available", async () => {
  let user = first;
  let allowed = false;
  let opened = 0;
  let modulePresent = true;
  let listener;
  const users = {
    getCurrentUser: () => user,
    addChangeListener: value => { listener = value; },
    removeChangeListener: value => { assert.equal(value, listener); listener = undefined; }
  };
  const { discordAccounts } = await nativeModule("runtime/src/moggcord/accounts.ts", {
    "../../../shared/account-backups": { accountIdentity, createAccountBackupStore },
    "@lib/api/native/modules": { NativeCacheModule: null },
    "@metro": { findByProps: name => {
      assert.equal(name, "canUseMultiAccountMobile");
      return { canUseMultiAccountMobile: () => allowed };
    } },
    "@plugins/common": {
      getStore: name => {
        assert.equal(name, "UserStore");
        return users;
      },
      moduleAt: path => {
        assert.equal(path, "modules/multi_account/native/openManageAccountsModal.tsx");
        return modulePresent ? { default: () => { opened++; } } : undefined;
      }
    }
  });
  const unsubscribe = discordAccounts.subscribe(() => {});
  assert.equal(typeof listener, "function");
  unsubscribe();
  assert.equal(listener, undefined);
  assert.deepEqual(discordAccounts.current(), first);
  assert.equal(await discordAccounts.openManager(), false);
  assert.equal(opened, 0);
  allowed = true;
  assert.equal(await discordAccounts.openManager(), true);
  assert.equal(opened, 1);
  modulePresent = false;
  assert.equal(await discordAccounts.openManager(), false);
  user = null;
  assert.equal(discordAccounts.current(), null);
  assert.equal(await discordAccounts.openManager(), false);
  assert.equal(opened, 1);
});
