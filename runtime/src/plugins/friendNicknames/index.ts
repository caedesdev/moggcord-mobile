/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { displayName, onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { addUserAction } from "../userActions";
import { prompt } from "../ui/dialogs";

const nicknames = wrapSync(createStorage<{ users: Record<string, string>; }>(createMMKVBackend("MOGGCORD_FRIEND_NICKNAMES", { users: {} })));

export default definePlugin({
    id: "moggcord.friend-nicknames",
    name: "FriendNicknames",
    description: tx("Give people your own nicknames that only you see in chat"),
    icon: "IdIcon",
    tags: ["Friends", "Customisation"],
    async start({ cleanup }) {
        await awaitStorage(nicknames);
        cleanup(
            onMessageRow("friend-nicknames", (row, message) => {
                const nick = nicknames.users?.[message.author?.id];
                if (!nick) return;
                if (typeof row.username === "string") row.username = nick;
                else if (typeof row.timestamp === "string" && !row.timestamp.startsWith(`${nick} · `)) row.timestamp = `${nick} · ${row.timestamp}`;
            }, RowOrder.REPLACE),
            addUserAction({
                key: "friend-nicknames",
                icon: "IdIcon",
                label: () => t("Set Your Nickname for Them"),
                visible: user => !!user?.id && user.id !== currentUserId(),
                onPress: user => prompt({
                    title: t("Your nickname for {user}", { user: displayName(user) }),
                    description: t("Only you see it. Leave it empty to remove it."),
                    initial: nicknames.users?.[user.id] ?? "",
                    allowEmpty: true,
                    onSubmit: value => {
                        const users = { ...(nicknames.users ?? {}) };
                        if (value.trim()) users[user.id] = value.trim().slice(0, 32);
                        else delete users[user.id];
                        nicknames.users = users;
                        redrawChannel();
                    },
                }),
            }),
        );
    },
});
