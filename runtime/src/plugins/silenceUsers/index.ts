/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { getChannel, onIncomingMessage } from "../hooks";
import { addUserAction } from "../userActions";
import { ids } from "../shared/filters";

export default definePlugin({
    id: "moggcord.silence-users",
    name: "SilenceUsers",
    description: tx("Silences @mention pings and server badge counts from specific users. Regular messages and DMs are untouched."),
    icon: "BellSlashIcon",
    tags: ["Notifications"],
    settings: {
        mutedUserIds: {
            type: "string",
            label: tx("Silenced users"),
            description: tx("Comma-separated Discord user IDs to silence pings and server badges."),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
    },
    start({ store, cleanup }) {
        cleanup(
            onIncomingMessage("silence-users", message => {
                const guildId = message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (!guildId || !ids(store.mutedUserIds).has(message.author?.id)) return;
                if (!message.mentions?.length && !message.mention_roles?.length && !message.mention_everyone) return;
                return { ...message, mentions: [], mention_roles: [], mention_everyone: false };
            }),
            addUserAction({
                key: "silence-users",
                icon: "BellSlashIcon",
                label: user => ids(store.mutedUserIds).has(user?.id) ? t("Stop silencing this user") : t("Silence this user's pings"),
                visible: (user, { guildId }) => !!guildId && user?.id !== currentUserId(),
                onPress: user => {
                    const list = ids(store.mutedUserIds);
                    if (!list.delete(user.id)) list.add(user.id);
                    store.mutedUserIds = [...list].join(", ");
                },
            }),
        );
    },
});
