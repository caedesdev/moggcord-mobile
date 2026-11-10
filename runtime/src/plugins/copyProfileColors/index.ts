/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { copy } from "../hooks";
import { addUserAction } from "../userActions";

export default definePlugin({
    id: "moggcord.copy-profile-colors",
    name: "CopyProfileColors",
    description: tx("Copy the profile theme colors of a user from profiles and message menus"),
    icon: "PaintPaletteIcon",
    tags: ["Utility", "Customisation"],
    start({ cleanup }) {
        const colorsOf = (userId: string): number[] | undefined => getStore("UserProfileStore")?.getUserProfile?.(userId)?.themeColors;
        const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
        cleanup(addUserAction({
            key: "copy-profile-colors",
            icon: "PaintPaletteIcon",
            label: () => t("Copy Profile Colors"),
            visible: user => !!colorsOf(user?.id)?.length,
            onPress: user => {
                const [primary, accent] = colorsOf(user.id)!;
                copy(t("Primary: {primary}, Accent: {accent}", { primary: hex(primary), accent: hex(accent ?? primary) }));
            },
        }));
    },
});
