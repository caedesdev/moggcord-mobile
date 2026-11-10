/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { displayName } from "../hooks";
import { addUserAction } from "../userActions";
import { accountsOf, failed, profileOf } from "../shared/people";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "moggcord.show-connections",
    name: "ShowConnections",
    description: tx("See the accounts a user has connected (GitHub, Steam, Spotify...) from profiles and message menus"),
    icon: "LinkIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "show-connections",
            icon: "LinkIcon",
            label: () => t("Connections"),
            visible: user => !!user?.id && !user.bot,
            onPress: async user => {
                try {
                    const accounts = accountsOf(await profileOf(user.id));
                    showText(t("Connections of {user}", { user: displayName(user) }), accounts.length
                        ? accounts.map(a => `${a.type}: ${a.name}${a.verified ? " ✓" : ""}`).join("\n")
                        : t("No connected accounts are shown."));
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});
