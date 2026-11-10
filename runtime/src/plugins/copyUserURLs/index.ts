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
    id: "moggcord.copy-user-urls",
    name: "CopyUserURLs",
    description: tx("Copy a link to the profile of a user from profiles and message menus"),
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "copy-user-url",
            icon: "LinkIcon",
            label: () => t("Copy User URL"),
            visible: user => !!user?.id,
            onPress: user => copy(`https://discord.com/users/${user.id}`),
        }));
    },
});
