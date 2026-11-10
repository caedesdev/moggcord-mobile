/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByName } from "@metro";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";

const MESSAGE_ROW = 1;
const ICONS: Record<string, string> = { desktop: "d", mobile: "m", web: "w", embedded: "c", vr: "v" };
const STATUS: Record<string, string> = { online: "0", idle: "1", dnd: "2", offline: "3", invisible: "3" };
const ORDER = ["desktop", "web", "mobile", "embedded", "vr"];
const SUFFIX = /\s*\u2063mcpi\|(?:[dwmcv][0-3]){1,5}\u2063$/;

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
        if ((globalThis as any).__MOGGCORD_PLATFORM_ICONS__?.apiVersion !== 1) {
            throw new Error(t("Install the latest Moggcord Mobile app once to display device icons."));
        }
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");

        cleanup(after("generate", RowManager.prototype, ([args], row) => {
            try {
                const message = row?.type === MESSAGE_ROW ? row.message : undefined;
                const author = args?.message?.author;
                if (!message || typeof message.timestamp !== "string") return;
                message.timestamp = message.timestamp.replace(SUFFIX, "");
                if (!store.messages || !author?.id || author.bot) return;
                if (!store.self && author.id === currentUserId()) return;
                const icons = platformIcons(author.id, store.offline);
                if (icons) message.timestamp += `  \u2063mcpi|${icons}\u2063`;
            } catch (e) {
                console.error("[Moggcord] PlatformIndicators couldn't decorate a message", e);
            }
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
