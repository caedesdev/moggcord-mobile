/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { copy, insertText } from "../hooks";
import { addUserAction } from "../userActions";

export default definePlugin({
    id: "moggcord.quick-mention",
    name: "QuickMention",
    description: tx("Mention a user from profiles and message menus"),
    icon: "AtIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "quick-mention",
            icon: "AtIcon",
            label: () => t("Mention"),
            visible: user => !!user?.id,
            onPress: (user, { channel }) => {
                const mention = `<@${user.id}> `;
                if (!channel?.id || !insertText(channel.id, mention)) copy(mention.trim(), t("Mention copied"));
            },
        }));
    },
});
