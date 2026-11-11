/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { installPlatformIconProvider } from "./render";

const ICONS: Record<string, string> = { desktop: "d", mobile: "m", web: "w", embedded: "c", vr: "v" };
const STATUS: Record<string, string> = { online: "0", idle: "1", dnd: "2", offline: "3", invisible: "3" };
const ORDER = ["desktop", "web", "mobile", "embedded", "vr"];

const plugin = definePlugin({
    id: "moggcord.platform-indicators",
    name: "PlatformIndicators",
    description: tx("Shows which devices people are online on (desktop, web or mobile) next to their messages."),
    popular: 9,
    icon: "MobilePhoneIcon",
    tags: ["Appearance"],
    settings: {
        messages: { type: "boolean", label: tx("Messages"), description: tx("Next to the time of each message"), default: true },
        self: { type: "boolean", label: tx("Your own messages"), description: tx("Show your own devices too"), default: false },
        offline: { type: "boolean", label: tx("Hide when offline"), description: tx("Show nothing for people who are offline or invisible"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(installPlatformIconProvider("presence", authorId => {
            if (!store.messages || !store.self && authorId === currentUserId()) return "";
            return platformIcons(authorId, store.offline);
        }));

        cleanup(subscribe("PRESENCE_UPDATES", () => cache.clear()),
            subscribe("SESSIONS_REPLACE", () => cache.clear()), () => cache.clear());
    },
});

const cache = new Map<string, string>();

function platformIcons(userId: string, hideOffline: boolean): string {
    const cacheKey = `${userId}:${hideOffline}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    let statuses: Record<string, string> | undefined;
    if (userId === currentUserId()) {
        // Your own sessions: this phone plus any others Discord knows about
        const sessions = getStore("SessionsStore")?.getSessions?.() ?? {};
        statuses = { mobile: "online" };
        for (const session of Object.values<any>(sessions)) {
            const client = session?.clientInfo?.client;
            if (client && Object.hasOwn(ICONS, client)) statuses[client] = session.status ?? "online";
        }
    } else {
        statuses = getStore("PresenceStore")?.getClientStatus?.(userId)
            ?? getStore("PresenceStore")?.getState?.()?.clientStatuses?.[userId];
    }
    const icons = ORDER
        .filter(p => statuses?.[p] && Object.hasOwn(STATUS, statuses[p])
            && (!hideOffline || (statuses[p] !== "offline" && statuses[p] !== "invisible")))
        .map(p => ICONS[p] + STATUS[statuses![p]])
        .join("");
    if (cache.size >= 1000) cache.clear();
    cache.set(cacheKey, icons);
    return icons;
}

export default plugin;
