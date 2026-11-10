/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { displayName, openUrl } from "../hooks";
import { addUserAction } from "../userActions";
import { avatarUrl } from "../shared/lookup";
import { profileOf } from "../shared/people";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "moggcord.profile-media",
    name: "ProfileMedia",
    description: tx("Open a user's avatar and banner in full resolution from profiles and message menus"),
    icon: "ImageIcon",
    tags: ["Media", "Friends"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "profile-media",
            icon: "ImageIcon",
            label: () => t("Avatar and Banner"),
            visible: user => !!user?.id,
            onPress: async user => {
                const user = user;
                const choices = [{ label: t("Open Avatar"), value: avatarUrl(user, 4096), icon: "UserCircleIcon" }];
                try {
                    const profile = await profileOf(user.id);
                    const banner = profile?.banner ?? profile?.user?.banner ?? user.banner;
                    if (banner) choices.push({ label: t("Open Banner"), value: `https://cdn.discordapp.com/banners/${user.id}/${banner}.${banner.startsWith("a_") ? "gif" : "png"}?size=4096`, icon: "ImageIcon" });
                } catch { }
                choose(displayName(user), choices, openUrl);
            },
        }));
    },
});
