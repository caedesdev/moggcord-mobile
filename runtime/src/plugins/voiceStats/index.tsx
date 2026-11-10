/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { displayName, getUser } from "../hooks";
import { addUserAction } from "../userActions";
import { clock, myVoiceChannel, statesIn } from "../shared/calls";
import LogList from "../ui/LogList";

const voiceTime = wrapSync(createStorage<{ users: Record<string, number>; }>(createMMKVBackend("MOGGCORD_VOICE_STATS", { users: {} })));

function VoiceStatsPage() {
    useProxy(voiceTime);
    const users = Object.entries(voiceTime.users ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 100);
    return <LogList
        title={t("Time in Voice Together")}
        empty={t("Time you spend in voice channels with people will show up here")}
        entries={users.map(([id, ms]) => ({ key: id, label: displayName(getUser(id) ?? { id }), subLabel: clock(ms) }))}
        onClear={() => void (voiceTime.users = {})}
    />;
}

export default definePlugin({
    id: "moggcord.voice-stats",
    name: "VoiceStats",
    description: tx("Shows how long you've spent in voice with each user"),
    icon: "ClockIcon",
    tags: ["Voice", "Friends"],
    SettingsComponent: VoiceStatsPage,
    async start({ cleanup }) {
        await awaitStorage(voiceTime);
        const STEP = 15_000;
        // Counted in steps and saved at most every step, so a call costs a write every 15 seconds at most
        const timer = setInterval(() => {
            const others = Object.keys(statesIn(myVoiceChannel())).filter(id => id !== currentUserId());
            if (!others.length) return;
            const users = { ...(voiceTime.users ?? {}) };
            for (const id of others) users[id] = (users[id] ?? 0) + STEP;
            voiceTime.users = users;
        }, STEP);
        cleanup(
            () => clearInterval(timer),
            addUserAction({
                key: "voice-stats",
                icon: "ClockIcon",
                label: user => t("Time in voice together: {time}", { time: clock(voiceTime.users?.[user?.id] ?? 0) }),
                visible: user => !!voiceTime.users?.[user?.id],
                onPress: () => { },
            }),
        );
    },
});
