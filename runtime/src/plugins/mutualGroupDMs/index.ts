/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { displayName, getChannel, getUser, jumpTo } from "../hooks";
import { addUserAction } from "../userActions";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "moggcord.mutual-group-dms",
    name: "MutualGroupDMs",
    description: tx("See the group DMs you share with a user, from profiles and message menus"),
    icon: "GroupIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const groupsWith = (userId: string) => (getStore("PrivateChannelSortStore")?.getPrivateChannelIds?.() ?? [])
            .map((id: string) => getChannel(id))
            .filter((c: any) => c?.type === 3 && c.recipients?.includes(userId));
        cleanup(addUserAction({
            key: "mutual-group-dms",
            icon: "GroupIcon",
            label: () => t("Mutual Group DMs"),
            visible: user => !!user?.id && user.id !== currentUserId() && groupsWith(user.id).length > 0,
            onPress: user => choose(t("Mutual Group DMs"), groupsWith(user.id).map((c: any) => ({
                label: c.name || c.recipients.map((id: string) => displayName(getUser(id) ?? { id })).join(", "),
                value: c.id as string,
            })), (id: string) => {
                const last = getChannel(id)?.lastMessageId;
                if (last) jumpTo(id, last);
            }),
        }));
    },
});
