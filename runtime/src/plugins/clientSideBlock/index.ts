/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, onAction } from "../common";
import { getChannel, hideLocally, onIncomingMessage } from "../hooks";
import { addUserAction } from "../userActions";
import { ids, isBlocked } from "../shared/filters";

export default definePlugin({
    id: "moggcord.client-side-block",
    name: "ClientSideBlock",
    description: tx("Allows you to locally hide almost all content from any user"),
    icon: "DenyIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        usersToBlock: {
            type: "string",
            label: tx("Hidden users"),
            description: tx("User IDs separated by a comma and a space"),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
        hideBlockedUsers: { type: "boolean", label: tx("Hide blocked users too"), description: tx("Should blocked users also be hidden everywhere"), default: false },
        hideReplies: { type: "boolean", label: tx("Hide replies to them"), description: tx("Hide messages that reply to someone you have hidden"), default: true },
        guildBlackList: { type: "string", label: tx("Servers to skip"), description: tx("Guild ids to disable functionality in"), default: "" },
    },
    start({ store, cleanup }) {
        const hidden = (userId?: string) => !!userId && (ids(store.usersToBlock).has(userId) || store.hideBlockedUsers && isBlocked(userId));
        cleanup(
            onIncomingMessage("client-side-block", message => {
                const guildId = message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (guildId && ids(store.guildBlackList).has(guildId)) return;
                if (hidden(message.author?.id)) return null;
                if (store.hideReplies && hidden(message.referenced_message?.author?.id)) return null;
            }),
            // Their typing isn't shown either
            onAction<{ userId: string; }>("TYPING_START", ({ userId }) => hidden(userId) ? false : undefined),
            addUserAction({
                key: "client-side-block",
                icon: "DenyIcon",
                danger: true,
                label: () => t("Hide this user's messages"),
                visible: user => !!user?.id && user.id !== currentUserId() && !ids(store.usersToBlock).has(user.id),
                onPress: (user, { channel, message }) => {
                    store.usersToBlock = [...ids(store.usersToBlock), user.id].join(", ");
                    if (message?.id) hideLocally(channel?.id ?? message.channel_id, message.id);
                    showToast(t("Messages from {user} are hidden. Reopen chats to hide older ones.", { user: user.username }), findAssetId("DenyIcon"));
                },
            }),
        );
    },
});
