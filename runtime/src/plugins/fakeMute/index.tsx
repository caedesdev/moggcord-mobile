/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType } from "@lib/api/commands/types";
import { after, before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { messageUtil } from "@metro/common";
import { Platform } from "react-native";

import { definePlugin, onSettingChange } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, moduleAt } from "../common";
import { myVoiceChannel } from "../shared/calls";
import { SlashedIcon } from "../silentTyping";
import { installFakeDeafenControls } from "./controls";

interface VoiceStatePayload {
    guildId?: string | null;
    channelId?: string | null;
    selfMute?: boolean;
    selfDeaf?: boolean;
    [key: string]: unknown;
}

const GATEWAY_SOCKET = "modules/gateway/GatewaySocket.tsx";
const GATEWAY_SINGLETON = "modules/gateway/GatewaySocketSingleton.tsx";
const LOCAL_VOICE_STATUS = "modules/video_calls/useLocalSelfMuteDeaf.tsx";
const icon = (name: string) => () => moduleAt(`design/components/Icon/native/redesign/generated/${name}.tsx`)?.[name];
const MicrophoneIcon = icon("MicrophoneIcon");
const HeadphonesIcon = icon("HeadphonesIcon");

/** The voice state Discord last sent to the gateway, before the fake flags were applied */
let lastState: VoiceStatePayload | null = null;
let socket: { voiceStateUpdate(state: VoiceStatePayload): void; } | null = null;

const plugin = definePlugin({
    id: "moggcord.fake-mute",
    name: "FakeDeafen",
    description: tx("Appear deafened while listening with your microphone muted."),
    popular: 12,
    icon: "MicrophoneSlashIcon",
    tags: ["Voice", "Utility"],
    settings: {
        fakeMute: {
            type: "boolean",
            label: tx("Fake mute"),
            description: tx("Others see you as muted, but still hear you"),
            default: false,
        },
        fakeDeafen: {
            type: "boolean",
            label: tx("Fake deafen"),
            description: tx("Others see you as deafened while your microphone is muted"),
            default: true,
        },
        button: {
            type: "select",
            label: tx("Chat bar buttons"),
            description: tx("Buttons beside the message box to switch fake mute and fake deafen"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup, logger }) {
        const GatewaySocket = moduleAt(GATEWAY_SOCKET)?.default;
        const proto = GatewaySocket?.prototype;
        if (typeof proto?.voiceStateUpdate !== "function") throw new Error("Discord's gateway socket wasn't found");

        const android = Platform.OS === "android";
        // Like the desktop Ghost button, start each Android session with Fake Deafen off.
        if (android && store.fakeDeafen) store.fakeDeafen = false;

        const unpatch = before("voiceStateUpdate", proto, function (this: any, [state, ...args]: any[]) {
            socket = this;
            if (!state || typeof state !== "object") return;
            lastState = { ...state };
            if (!state.channelId) return;
            if (!store.fakeMute && !(store.fakeDeafen && state.selfMute)) return;
            const patched = { ...state };
            if (store.fakeMute) patched.selfMute = true;
            if (store.fakeDeafen && state.selfMute) patched.selfDeaf = true;
            return [patched, ...args];
        });

        if (android) {
            const voiceStatus = moduleAt(LOCAL_VOICE_STATUS);
            if (typeof voiceStatus?.withLocalSelfMuteDeaf === "function") {
                // Android replaces the gateway flags with real audio flags when it draws your own row.
                // Change the displayed copy only. Discord uses the actual flags for the mic and headphones.
                const unpatchStatus = after("withLocalSelfMuteDeaf", voiceStatus, ([, local], state) => {
                    if (store.fakeDeafen && state?.selfMute && !state.selfDeaf &&
                        typeof state.merge === "function" &&
                        local?.sessionId && state.sessionId === local.sessionId &&
                        state.userId === currentUserId() && state.channelId === myVoiceChannel()) {
                        return state.merge({ selfDeaf: true });
                    }
                });
                cleanup(() => {
                    unpatchStatus();
                    if (store.fakeDeafen) getStore("VoiceStateStore")?.emitChange?.();
                });
            } else {
                logger.warn("Couldn't find Discord's call status renderer");
            }
        }

        cleanup(
            installFakeDeafenControls(plugin, () => {
                const wasEnabled = store.fakeDeafen;
                set("fakeDeafen");
                if (store.fakeDeafen !== wasEnabled) {
                    showToast(store.fakeDeafen ? t("Fake Deafen enabled") : t("Fake Deafen disabled"), findAssetId("HeadphonesSlashIcon"));
                }
            }),
            () => {
                // Unpatched first, so the voice server is told the real state again
                unpatch();
                if (store.fakeMute || store.fakeDeafen) resend(logger);
                lastState = null;
                socket = null;
            },
            // Switches in the settings page apply to the current call too
            onSettingChange(store, key => {
                if (key !== "fakeMute" && key !== "fakeDeafen") return;
                if (android && key === "fakeDeafen" && store.fakeDeafen) {
                    if (!myVoiceChannel()) {
                        store.fakeDeafen = false;
                        showToast(t("Join a voice call to use Fake Deafen"), findAssetId("HeadphonesSlashIcon"));
                        return;
                    }
                    try {
                        prepareAndroidAudio();
                    } catch (error) {
                        logger.warn("Couldn't mute the microphone for Fake Deafen", error);
                        store.fakeDeafen = false;
                        showToast(t("Fake Deafen couldn't mute your microphone"), findAssetId("CircleXIcon-primary"));
                        return;
                    }
                }
                resend(logger);
                if (android && key === "fakeDeafen") getStore("VoiceStateStore")?.emitChange?.();
            }),
            addChatButton({
                key: "fake-mute",
                side: () => store.button as "left" | "right" | "none",
                render: () => <FakeButton kind="fakeMute" />,
            }),
            addChatButton({
                key: "fake-deafen",
                side: () => store.button as "left" | "right" | "none",
                render: () => <FakeButton kind="fakeDeafen" />,
            }),
            registerCommand({
                name: "fakemute",
                description: t("Appear muted while your microphone keeps working"),
                options: [booleanOption()],
                execute(args, ctx) {
                    set("fakeMute", args.find(a => a.name === "value")?.value as unknown as boolean | undefined);
                    messageUtil.sendBotMessage(ctx.channel.id, store.fakeMute ? t("Fake mute is on") : t("Fake mute is off"));
                },
            }),
            registerCommand({
                name: "fakedeafen",
                description: t("Appear deafened while you can still hear"),
                options: [booleanOption()],
                execute(args, ctx) {
                    set("fakeDeafen", args.find(a => a.name === "value")?.value as unknown as boolean | undefined);
                    messageUtil.sendBotMessage(ctx.channel.id, store.fakeDeafen ? t("Fake deafen is on") : t("Fake deafen is off"));
                },
            }),
        );
    },
});

function booleanOption() {
    return {
        name: "value",
        description: t("On or off (default: switch)"),
        type: ApplicationCommandOptionType.BOOLEAN,
        required: false,
    } as any;
}

function prepareAndroidAudio() {
    const media = getStore("MediaEngineStore");
    if (typeof media?.isSelfMute !== "function" || typeof media.isSelfDeaf !== "function") {
        throw new Error("Discord's audio settings weren't found");
    }
    const deafened = media.isSelfDeaf();
    if (media.isSelfMute() && !deafened) return;

    const audio = moduleAt("actions/AudioActionCreators.tsx");
    if (typeof audio?.setSelfMute !== "function" || (deafened && typeof audio.toggleSelfDeaf !== "function")) {
        throw new Error("Discord's audio controls weren't found");
    }
    audio.setSelfMute("default", true, false);
    // Desktop also moves from full mute to listening with the microphone muted.
    if (!media.isSelfMute() || (deafened && !media.getSettings?.()?.mute)) {
        throw new Error("Discord did not apply the microphone mute");
    }
    if (deafened) audio.toggleSelfDeaf({ syncRemote: false });
}

/** The voice state from Discord's stores, for a call that started before the plugin did */
function currentState(channelId?: string): VoiceStatePayload | null {
    if (!channelId) return null;
    const media = getStore("MediaEngineStore");
    if (typeof media?.isSelfMute !== "function" || typeof media.isSelfDeaf !== "function") return null;
    const selfVideo = media.isVideoEnabled?.();
    return {
        channelId,
        selfMute: !!media.isSelfMute(),
        selfDeaf: !!media.isSelfDeaf(),
        ...(typeof selfVideo === "boolean" && { selfVideo }),
    };
}

/** Sends the voice state again, so a change applies to the call you're in right away */
function resend(logger?: { warn(...a: any[]): void; }) {
    const android = Platform.OS === "android";
    const singleton = moduleAt(GATEWAY_SINGLETON);
    const activeSocket = android ? getStore("GatewayConnectionStore")?.getSocket?.() : undefined;
    const target = [activeSocket, singleton?.socket, singleton?.default, socket]
        .find(candidate => typeof candidate?.voiceStateUpdate === "function");
    const selected = getStore("SelectedChannelStore");
    const channelId = myVoiceChannel();
    if (typeof selected?.getVoiceChannelId === "function" && !channelId) return;
    const cached = lastState?.channelId && (!channelId || lastState.channelId === channelId) ? lastState : null;
    const live = android || !cached ? currentState(channelId) : null;
    const state = live ? { ...cached, ...live } : cached;
    if (!target || !state?.channelId) return;
    try {
        target.voiceStateUpdate({
            ...state,
            guildId: state.guildId ?? getStore("ChannelStore")?.getChannel?.(state.channelId)?.guild_id ?? null,
        });
    } catch (e) {
        logger?.warn("Couldn't update the voice state", e);
    }
}

function set(kind: "fakeMute" | "fakeDeafen", value?: boolean) {
    // The settings listener sends the new state
    plugin.store[kind] = value ?? !plugin.store[kind];
}

function FakeButton({ kind }: { kind: "fakeMute" | "fakeDeafen"; }) {
    const store = useProxy(plugin.store);
    const Button = getChatInputActionButton();
    const Icon = kind === "fakeMute" ? MicrophoneIcon() : HeadphonesIcon();
    if (!Button || !Icon) return null;
    const on = store[kind];

    return <Button
        accessibilityLabel={kind === "fakeMute" ? t("Fake mute") : t("Fake deafen")}
        accessibilityState={{ checked: on }}
        IconComponent={on ? (props: any) => <SlashedIcon Icon={Icon} {...props} /> : Icon}
        onPress={() => {
            set(kind);
            const now = plugin.store[kind];
            const text = kind === "fakeMute"
                ? (now ? t("Fake mute is on") : t("Fake mute is off"))
                : (now ? t("Fake deafen is on") : t("Fake deafen is off"));
            showToast(text, findAssetId(kind === "fakeMute" ? "MicrophoneSlashIcon" : "HeadphonesSlashIcon"));
        }}
    />;
}

export default plugin;
