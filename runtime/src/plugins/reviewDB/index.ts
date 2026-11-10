/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { displayName } from "../hooks";
import { addUserAction } from "../userActions";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "moggcord.review-db",
    name: "ReviewDB",
    description: tx("Read the ReviewDB reviews of a user from profiles and message menus"),
    icon: "StarIcon",
    tags: ["Friends", "Utility"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "review-db",
            icon: "StarIcon",
            label: () => t("View Reviews"),
            visible: user => !!user?.id && !user.bot,
            onPress: async user => {
                try {
                    const data = await fetch(`https://manti.vendicated.dev/api/reviewdb/users/${user.id}/reviews?flags=0&offset=0`).then(r => r.json());
                    const reviews: any[] = (data?.reviews ?? []).filter((r: any) => r?.comment && r.type !== 3);
                    showText(t("Reviews of {user}", { user: displayName(user) }), reviews.length
                        ? reviews.slice(0, 50).map(r => `${r.sender?.username ?? "?"} · ${new Date(r.timestamp * 1000).toLocaleDateString()}\n${r.comment}`).join("\n\n")
                        : t("Nobody has reviewed this user yet."));
                } catch {
                    showToast(t("Couldn't reach ReviewDB"), findAssetId("CircleXIcon-primary"));
                }
            },
        }));
    },
});
