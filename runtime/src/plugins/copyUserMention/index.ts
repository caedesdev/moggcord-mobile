/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { copy } from "../hooks";
import { addUserAction } from "../userActions";

export default definePlugin({
    id: "moggcord.copy-user-mention",
    name: "CopyUserMention",
    description: tx("Copy the mention of a user from profiles and message menus"),
    icon: "AtIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "copy-user-mention",
            icon: "AtIcon",
            label: () => t("Copy User Mention"),
            visible: user => !!user?.id,
            onPress: user => copy(`<@${user.id}>`),
        }));
    },
});
