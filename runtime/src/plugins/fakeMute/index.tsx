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
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { messageUtil } from "@metro/common";

import { definePlugin, onSettingChange } from "../api";
import { addChatButton, getChatInputActionButton, getStore, moduleAt } from "../common";
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
            default: false,
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

        // These flags are live call controls, not a mode to silently restore from a backup or a previous session.
        let changingFlags = false;
        const resetFlags = () => {
            changingFlags = true;
            try {
                store.fakeMute = false;
                store.fakeDeafen = false;
            } finally {
                changingFlags = false;
            }
        };
        resetFlags();
        lastState = null;
        socket = null;

        const unpatch = before("voiceStateUpdate", proto, function (this: any, args: any[]) {
            const state = args[0] as VoiceStatePayload;
            if (!state || typeof state !== "object") return;
            socket = this;
            if (Object.prototype.hasOwnProperty.call(state, "channelId") && state.channelId == null) {
                lastState = null;
                resetFlags();
                return;
            }
            if (!state.channelId) return;
            lastState = { ...state };
            const patched = { ...state };
            if (store.fakeMute) patched.selfMute = true;
            if (store.fakeDeafen && state.selfMute) patched.selfDeaf = true;
            return [patched, ...args.slice(1)];
        });

        cleanup(() => {
            // Unpatch first, then report Discord's current flags rather than a cached fake state.
            unpatch();
            resetFlags();
            resend(logger);
            lastState = null;
            socket = null;
        });
        cleanup(
            installFakeDeafenControls(plugin, () => {
                const enabled = !(store.fakeMute || store.fakeDeafen);
                changingFlags = true;
                try {
                    store.fakeMute = false;
                    store.fakeDeafen = enabled;
                } finally {
                    changingFlags = false;
                }
                resend(logger);
                showToast(enabled ? "Fake Deafen enabled" : "Fake Deafen disabled", findAssetId("HeadphonesSlashIcon"));
            }),
            // Switches in the settings page apply to the current call too
            onSettingChange(store, key => {
                if (changingFlags || key !== "fakeMute" && key !== "fakeDeafen") return;
                // The ghost must never leave an independent fake-mute mode running behind it.
                const other = key === "fakeMute" ? "fakeDeafen" : "fakeMute";
                if (store[key] && store[other]) {
                    changingFlags = true;
                    try { store[other] = false; }
                    finally { changingFlags = false; }
                }
                resend(logger);
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
        // A plugin enabled or updated mid-call also clears any previously advertised fake flags.
        resend(logger);
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

/** The voice state from Discord's stores, for a call that started before the plugin did */
function currentState(): VoiceStatePayload | null {
    const selected = getStore("SelectedChannelStore");
    if (typeof selected?.getVoiceChannelId !== "function") return lastState?.channelId ? { ...lastState } : null;
    const channelId = selected.getVoiceChannelId();
    if (!channelId) return null;
    const media = getStore("MediaEngineStore");
    const previous = lastState?.channelId === channelId ? lastState : null;
    const state: VoiceStatePayload = {
        ...previous,
        guildId: getStore("ChannelStore")?.getChannel?.(channelId)?.guild_id ?? previous?.guildId ?? null,
        channelId,
    };
    const flags = {
        selfMute: media?.isSelfMute?.(),
        selfDeaf: media?.isSelfDeaf?.(),
        selfVideo: media?.isVideoEnabled?.(),
    };
    for (const [key, value] of Object.entries(flags)) if (typeof value === "boolean") state[key] = value;
    return typeof state.selfMute === "boolean" && typeof state.selfDeaf === "boolean" ? state : null;
}

/** Sends the voice state again, so a change applies to the call you're in right away */
function resend(logger?: { warn(...a: any[]): void; }) {
    try {
        const target = socket ?? moduleAt("modules/gateway/GatewaySocketSingleton.tsx")?.default;
        const state = currentState();
        if (!target?.voiceStateUpdate || !state?.channelId) return;
        target.voiceStateUpdate({ ...state });
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
