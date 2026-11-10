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
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "moggcord.copy-status-urls",
    name: "CopyStatusUrls",
    description: tx("Copy the links in the status of a user from profiles and message menus"),
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const urls = (userId: string): string[] => {
            const activities: any[] = getStore("PresenceStore")?.getActivities?.(userId) ?? [];
            return activities.flatMap(a => [a.url, ...(String(a.state ?? "").match(/https?:\/\/\S+/g) ?? [])]).filter(Boolean);
        };
        cleanup(addUserAction({
            key: "copy-status-urls",
            icon: "LinkIcon",
            label: () => t("Copy Status URL"),
            visible: user => urls(user?.id).length > 0,
            onPress: user => {
                const list = urls(user.id);
                if (list.length === 1) copy(list[0]);
                else choose(t("Copy Status URL"), list.map(u => ({ label: u, value: u })), u => copy(u));
            },
        }));
    },
});
