import test from "node:test";
import assert from "node:assert/strict";
import { nativeModule } from "./native-host.mjs";

const element = (type, props, key) => Object.freeze({ type, props: Object.freeze(props), key });
const react = {
  isValidElement: node => !!node?.type,
  cloneElement: (node, props) => element(node.type, { ...node.props, ...props }, node.key),
  Fragment: "Fragment"
};
const jsx = { jsx: element, jsxs: element };

test("permission unions preserve high bits and detect incomplete role data", async () => {
  const { memberPermissions } = await nativeModule("runtime/src/plugins/permissionsViewer/permissions.ts", {});
  const table = { VIEW_CHANNEL: 1024, ADMINISTRATOR: 8n, MODERATE_MEMBERS: "1099511627776", SEND_POLLS: 1n << 49n };
  const roles = { guild: { id: "guild", name: "@everyone", permissions: "1024", position: 0 },
    mod: { id: "mod", name: "Moderator", permissions: 1099511627776n, position: 2 },
    polls: { id: "polls", name: "Polls", permissions: String(1n << 49n), position: 1 } };
  const result = memberPermissions("guild", "member", "owner", ["mod", "polls"], roles, table);
  assert.equal(result.complete, true);
  assert.deepEqual([...result.permissions], ["VIEW_CHANNEL", "MODERATE_MEMBERS", "SEND_POLLS"]);
  assert.deepEqual(result.roles.map(role => role.id).join(","), "mod,polls,guild");
  assert.equal(memberPermissions("guild", "member", "owner", ["missing"], roles, table).complete, false);
  const admin = { ...roles, mod: { ...roles.mod, permissions: "8" } };
  assert.equal(memberPermissions("guild", "member", "owner", ["mod"], admin, table).permissions.length, 4);
  assert.equal(memberPermissions("guild", "owner", "owner", [], roles, table).administrator, true);
  assert.equal(memberPermissions("guild", "member", "owner", [], roles, {}).complete, false);
});

async function menus() {
  const calls = [], warnings = [], toasts = [];
  const patcher = { after(key, holder, callback) {
    const original = holder[key];
    holder[key] = function (...args) { return callback(args, original.apply(this, args)); };
    return () => { holder[key] = original; };
  } };
  const common = await nativeModule("runtime/src/plugins/common.tsx", {
    "react/jsx-runtime": jsx, "@core/i18n": { Strings: {} }, "@lib/api/assets": { findAssetId: () => 1 },
    "@lib/api/flux": {}, "@lib/api/patcher": patcher, "@lib/utils": {}, "@metro": {}, "@metro/common": {}, "@ui/settings": {}
  });
  const sheetType = () => {};
  const sheetProxy = () => {};
  const ban = element("NativeBan", { onPress: () => calls.push("ban") }, "ban");
  const kick = element("NativeKick", { onPress: () => calls.push("kick") }, "kick");
  const moderatorTree = element("ProfileSection", { children: element("NativeTableRowGroup", { hasIcons: true, children: Object.freeze([ban, kick]) }) });
  const originalModerator = props => props.canModerate ? moderatorTree : null;
  const moderator = { default: { type: originalModerator } };
  const nativeItems = Object.freeze([Object.freeze([{ label: "Block", action: () => calls.push("block") }])]);
  const overflowTree = element("Provider", { children: element("ContextMenu", { items: nativeItems, children: () => null }) });
  const originalOverflow = () => overflowTree;
  const overflow = { default: { render: originalOverflow } };
  const originalMessage = () => element(sheetType, { children: Object.freeze([element("NativeReply", { onPress: () => calls.push("reply") })]) });
  const message = { default: { type: { render: originalMessage } } };
  const moduleAt = path => path.includes("ModeratorActions") ? moderator : path.includes("OverflowMenu") ? overflow : undefined;
  const assets = { findAssetId: () => 1 };
  const rows = { TableRow: Object.assign(() => {}, { Icon: () => {} }), TableRowGroup: () => {}, ActionSheet: sheetProxy,
    ActionSheetRow: Object.assign(() => {}, { Group: () => {}, Icon: () => {} }) };
  const getStore = () => undefined;
  const hooks = await nativeModule("runtime/src/plugins/hooks.tsx", {
    "react": react, "react/jsx-runtime": jsx, "react-native": {}, "@core/i18n": { t: text => text },
    "@lib/api/assets": assets, "@lib/api/commands": {}, "@lib/api/commands/types": { ApplicationCommandOptionType: {} },
    "@lib/api/flux": {}, "@lib/api/patcher": patcher, "@lib/ui/toasts": { showToast: text => toasts.push(text) },
    "@lib/utils/lazy": { getProxyFactory: object => object === sheetProxy ? () => sheetType : undefined },
    "@metro": { findByName: () => message, findByProps: () => null }, "@metro/common": {}, "@metro/common/components": rows,
    "./common": { ...common, moduleAt, getStore }
  });
  const api = await nativeModule("runtime/src/plugins/userActions.tsx", {
    "react": react, "react/jsx-runtime": jsx, "react-native": { View: "View" }, "@lib/api/assets": assets,
    "@metro": { findByProps: () => ({ hideActionSheet: () => calls.push("close") }) },
    "@metro/common/components": rows, "./common": { ...common, moduleAt }, "./hooks": hooks
  }, { console: { ...console, error: (...args) => warnings.push(args), warn: (...args) => warnings.push(args) } });
  return { api, calls, warnings, toasts, moderator, overflow, message, moderatorTree, nativeItems,
    originalModerator, originalOverflow, originalMessage, ban, kick };
}

test("shared user actions extend native profiles and overflow menus without changing moderation", async () => {
  const host = await menus();
  const target = { id: "member" }, channel = { id: "channel", guild_id: "guild" };
  const seen = [];
  const remove = host.api.addUserAction({ key: "permissions", icon: "ShieldIcon", label: () => "View Roles and Permissions",
    visible: (user, context) => !!context.guildId, onPress: (user, context) => seen.push([user, context.guildId, context.channel]) });
  const tree = host.moderator.default.type({ user: target, guildId: "guild", channelId: "missing", canModerate: true });
  assert.equal(tree.props.children.props.children.length, 3);
  assert.equal(tree.props.children.props.children[0], host.ban);
  assert.equal(tree.props.children.props.children[1], host.kick);
  assert.equal(host.moderatorTree.props.children.props.children.length, 2);
  tree.props.children.props.children[2].props.onPress();
  assert.equal(seen[0][0], target);
  assert.equal(seen[0][1], "guild");
  const overflow = host.overflow.default.render({ user: target, displayProfile: { guildId: "guild" }, channel });
  const menuItems = overflow.props.children.props.items;
  assert.equal(menuItems[0], host.nativeItems[0]);
  assert.equal(menuItems[1][0].label, "View Roles and Permissions");
  menuItems[1][0].action();
  assert.equal(seen[1][2], channel);
  const nonModerator = host.moderator.default.type({ user: target, guildId: "guild", canModerate: false });
  assert(nonModerator);
  assert.equal(host.overflow.default.render({ user: target, channel: { id: "dm" } }).props.children.props.items.length, 1);
  remove();
  menuItems[1][0].action();
  assert.equal(seen.length, 2);
  assert.equal(host.moderator.default.type, host.originalModerator);
  assert.equal(host.overflow.default.render, host.originalOverflow);
  assert.equal(host.message.default.type.render, host.originalMessage);
});

test("memo and forwardRef message sheets share user actions; explicit profile context never crosses servers", async () => {
  const host = await menus();
  const contexts = [];
  const cleanup = host.api.addUserAction({ key: "copy", icon: "CopyIcon", label: () => "Copy",
    onPress: (user, context) => contexts.push({ user, context }) });
  const message = { id: "message", channel_id: "a", author: { id: "author" } };
  const channel = { id: "a", guild_id: "server-a" };
  const sheet = host.message.default.type.render({ message, channel });
  const rows = sheet.props.children.at(-1).type(sheet.props.children.at(-1).props);
  rows.props.children[0].props.onPress();
  assert.equal(contexts[0].user, message.author);
  assert.equal(contexts[0].context.message, message);
  const menu = host.overflow.default.render({ user: message.author, displayProfile: { guildId: "server-b" }, channel });
  menu.props.children.props.items[1][0].action();
  assert.equal(contexts[1].context.guildId, "server-b");
  assert.equal(contexts[1].context.channel, undefined);
  const wrong = host.api.addUserAction({ key: "broken", icon: "None", label: () => "Broken", visible() { throw Error("Unsupported action"); }, onPress() {} });
  const valid = host.overflow.default.render({ user: message.author, channel });
  assert.equal(valid.props.children.props.items[1].length, 1);
  assert(host.warnings.length > 0);
  wrong(); cleanup();
});
