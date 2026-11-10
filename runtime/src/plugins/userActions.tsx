/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { findAssetId } from "@lib/api/assets";
import { findByProps } from "@metro";
import { TableRow, TableRowGroup } from "@metro/common/components";
import { cloneElement, Fragment, isValidElement } from "react";
import { View } from "react-native";
import { afterRender, moduleAt } from "./common";
import { addMessageAction, getChannel, getUser, mapMenuTree, toastError } from "./hooks";

export interface UserActionContext {
    guildId?: string;
    channel?: any;
    /** Present only when opened from an actual message. */
    message?: any;
}

export interface UserAction {
    key: string;
    icon: string;
    danger?: boolean;
    label(user: any, context: UserActionContext): string;
    visible?(user: any, context: UserActionContext): boolean;
    onPress(user: any, context: UserActionContext): unknown;
}

const actions = new Map<string, UserAction>();
let unpatchMenus: (() => void) | undefined;
const prefix = "moggcord-user-";

/** The profile's explicit server wins. A selected server elsewhere in the app is never a fallback. */
function profileContext(props: any): { user: any; context: UserActionContext; } | undefined {
    const user = props?.user ?? getUser(props?.userId);
    if (!user?.id) return;
    let channel = props.channel ?? getChannel(props.channelId);
    const guildId = props.guildId ?? props.displayProfile?.guildId ?? channel?.guild_id ?? undefined;
    if (guildId && channel?.guild_id !== guildId) channel = undefined;
    return { user, context: { guildId, channel } };
}

function available(user: any, context: UserActionContext) {
    return [...actions.values()].filter(action => {
        try { return !action.visible || action.visible(user, context); }
        catch (error) {
            console.error(`[Moggcord] ${action.key} couldn't be shown`, error);
            return false;
        }
    });
}

function invoke(action: UserAction, user: any, context: UserActionContext) {
    if (actions.get(action.key) !== action) return;
    try {
        if (action.visible && !action.visible(user, context)) return;
        findByProps("openLazy", "hideActionSheet")?.hideActionSheet?.();
        Promise.resolve(action.onPress(user, context)).catch(toastError);
    } catch (error) { toastError(error); }
}

function rowsFor(user: any, context: UserActionContext) {
    return available(user, context).flatMap(action => {
        try {
            const source = findAssetId(action.icon);
            return [<TableRow key={prefix + action.key} label={action.label(user, context)}
                icon={source == null ? undefined : <TableRow.Icon source={source} />}
                variant={action.danger ? "danger" : undefined}
                onPress={() => invoke(action, user, context)} />];
        } catch (error) {
            console.error(`[Moggcord] ${action.key} couldn't be shown`, error);
            return [];
        }
    });
}

function patchUserMenus() {
    if (unpatchMenus) return;
    const undos: (() => unknown)[] = [];
    const attach = (name: string, callback: (props: any, tree: any) => any) => {
        try {
            const module = moduleAt(`modules/user_profile/native/${name}.tsx`);
            const undo = afterRender(module, "default", (props, tree) => {
                try { return callback(props, tree); }
                catch (error) {
                    console.error(`[Moggcord] ${name} actions couldn't be shown`, error);
                    return tree;
                }
            });
            if (undo) undos.push(undo);
        } catch (error) { console.warn(`[Moggcord] ${name} isn't available`, error); }
    };

    // The native menu behind the profile's three dots: item arrays, not React action-sheet rows.
    attach("UserProfileOverflowMenu", (props, tree) => {
        const target = profileContext(props);
        if (!target) return tree;
        const { user, context } = target;
        const items = available(user, context).flatMap(action => {
            try {
                return [{ key: prefix + action.key, label: action.label(user, context),
                    variant: action.danger ? "destructive" : undefined, iconSource: findAssetId(action.icon),
                    action: () => invoke(action, user, context) }];
            } catch (error) { console.error(`[Moggcord] ${action.key} couldn't be shown`, error); return []; }
        });
        if (!items.length) return tree;
        return mapMenuTree(tree, node => Array.isArray(node.props.items), node =>
            cloneElement(node, { items: [...node.props.items.filter((group: any) =>
                !Array.isArray(group) || !group.some(item => item?.key?.startsWith(prefix))), items] }));
    });

    // Add alongside native Kick/Ban rows. Non-moderators still get their enabled read-only plugin actions.
    attach("UserProfileModeratorActions", (props, tree) => {
        const target = profileContext(props);
        if (!target) return tree;
        const rows = rowsFor(target.user, target.context);
        if (!rows.length) return tree;
        let inserted = false;
        const next = mapMenuTree(tree, node => !inserted && node.props.hasIcons === true, node => {
            inserted = true;
            return cloneElement(node, { children: [...[node.props.children].flat().filter(child =>
                !child?.key?.startsWith(prefix)), ...rows] });
        });
        if (inserted) return next;
        const Section = moduleAt<any>("modules/user_profile/native/UserProfileSection.tsx")?.default;
        const group = <TableRowGroup hasIcons>{rows}</TableRowGroup>;
        const extra = Section ? <Section title="Moggcord" style={props.style}>{group}</Section>
            : <View style={[{ marginTop: 12 }, props.style]}>{group}</View>;
        return isValidElement(tree) ? <Fragment>{tree}{extra}</Fragment> : extra;
    });
    if (!undos.length) throw new Error("Discord's user menus weren't found");
    unpatchMenus = () => { for (const undo of undos.reverse()) undo(); unpatchMenus = undefined; };
}

/** One registration for a user's profile, native user menu and the author's message menu. */
export function addUserAction(action: UserAction) {
    patchUserMenus();
    actions.set(action.key, action);
    let removeMessage: (() => void) | undefined;
    try {
        const contextOf = (message: any, channel: any): UserActionContext => ({
            guildId: channel?.guild_id ?? message.guild_id, channel, message
        });
        removeMessage = addMessageAction({
            key: action.key, icon: action.icon, danger: action.danger,
            label: (message, channel) => action.label(message.author, contextOf(message, channel)),
            visible: (message, channel) => !!message.author?.id && (!action.visible || action.visible(message.author, contextOf(message, channel))),
            onPress: (message, channel) => {
                if (actions.get(action.key) === action) return action.onPress(message.author, contextOf(message, channel));
            }
        });
    } catch (error) {
        console.warn(`[Moggcord] ${action.key}: message menu unavailable; profile actions remain available`, error);
    }
    return () => {
        removeMessage?.();
        if (actions.get(action.key) === action) actions.delete(action.key);
        if (!actions.size) unpatchMenus?.();
    };
}
