/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { displayName } from "../hooks";
import { addUserAction } from "../userActions";
import { showText } from "../ui/dialogs";

const ACTIVITY_VERBS = [tx("Playing"), tx("Streaming"), tx("Listening to"), tx("Watching"), "", tx("Competing in")];

export default definePlugin({
    id: "moggcord.better-activities",
    name: "BetterActivities",
    description: tx("See everything a user is doing right now, from profiles and message menus"),
    icon: "GameControllerIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const activities = (id?: string): any[] => (id && getStore("PresenceStore")?.getActivities?.(id)) || [];
        cleanup(addUserAction({
            key: "better-activities",
            icon: "GameControllerIcon",
            label: () => t("Activities"),
            visible: user => activities(user?.id).length > 0,
            onPress: user => showText(t("Activities of {user}", { user: displayName(user) }), activities(user.id).map(a => {
                if (a.type === 4) return `💬 ${[a.emoji?.name, a.state].filter(Boolean).join(" ")}`;
                const verb = ACTIVITY_VERBS[a.type] ? `${t(ACTIVITY_VERBS[a.type])} ` : "";
                const started = a.timestamps?.start ? ` · ${t("for {time}", { time: Math.round((Date.now() - a.timestamps.start) / 60000) + "m" })}` : "";
                return [`${verb}**${a.name}**${started}`, a.details, a.state].filter(Boolean).join("\n");
            }).join("\n\n")),
        }));
    },
});
