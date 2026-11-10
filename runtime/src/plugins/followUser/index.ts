/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { displayName } from "../hooks";
import { addUserAction } from "../userActions";
import { join, myVoiceChannel, voiceActions } from "../shared/voice";

export default definePlugin({
    id: "moggcord.follow-user",
    name: "FollowUser",
    description: tx("Follow someone from profiles and message menus to always join the same voice channel as them"),
    icon: "ArrowAngleRightUpIcon",
    tags: ["Voice", "Friends"],
    settings: {
        followUserId: { type: "string", label: tx("Followed user"), description: tx("Followed User ID"), default: "" },
        followLeave: { type: "boolean", label: tx("Leave with them"), description: tx("Also leave when the followed user leaves"), default: false },
        executeOnFollow: { type: "boolean", label: tx("Join right away"), description: tx("Make sure to be in the same VC when following a user"), default: true },
    },
    start({ store, cleanup }) {
        const follow = (channelId?: string | null) => {
            if (channelId && channelId !== myVoiceChannel()) {
                try {
                    join(channelId);
                } catch { }
            }
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                const followed = store.followUserId.trim();
                if (!followed) return;
                for (const state of voiceStates ?? []) {
                    if (state.userId !== followed) continue;
                    if (state.channelId) follow(state.channelId);
                    else if (store.followLeave && myVoiceChannel()) voiceActions()?.disconnect?.();
                }
            }),
            addUserAction({
                key: "follow-user",
                icon: "ArrowAngleRightUpIcon",
                label: user => store.followUserId === user?.id ? t("Unfollow in Voice") : t("Follow in Voice"),
                visible: user => !!user?.id && user.id !== currentUserId(),
                onPress: user => {
                    if (store.followUserId === user.id) {
                        store.followUserId = "";
                        showToast(t("Stopped following {user}", { user: displayName(user) }), findAssetId("ArrowAngleRightUpIcon"));
                        return;
                    }
                    store.followUserId = user.id;
                    showToast(t("Following {user} in voice channels", { user: displayName(user) }), findAssetId("ArrowAngleRightUpIcon"));
                    if (store.executeOnFollow) follow(getStore("VoiceStateStore")?.getVoiceStateForUser?.(user.id)?.channelId);
                },
            }),
        );
    },
});
