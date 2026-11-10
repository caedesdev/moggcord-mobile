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
import { showToast } from "@lib/ui/toasts";
import { messageUtil } from "@metro/common";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { definePlugin } from "../api";
import { addChatButton, getChatInputActionButton, getStore, moduleAt, onAction } from "../common";

const KeyboardIcon = () => moduleAt("design/components/Icon/native/redesign/generated/KeyboardIcon.tsx")?.KeyboardIcon;
const keyboardStyles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    slash: {
        height: 2,
        borderRadius: 1,
        backgroundColor: "#ED4245",
        transform: [{ rotate: "-45deg" }],
    },
});

const plugin = definePlugin({
    id: "moggcord.silent-typing",
    name: "SilentTyping",
    description: tx("Hide that you are typing"),
    popular: 11,
    icon: "KeyboardIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        isEnabled: {
            type: "boolean",
            label: tx("Hide typing"),
            description: tx("Turn this off to show your typing again without turning the plugin off"),
            default: true,
        },
        showInDms: {
            type: "boolean",
            label: tx("Show typing in DMs"),
            description: tx("Still show that you are typing in direct messages and group DMs"),
            default: false,
        },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            description: tx("A button beside the message box to switch silent typing on and off"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(
            // Discord sends the typing request when it handles this action
            onAction<{ channelId: string; }>("TYPING_START_LOCAL", ({ channelId }) => {
                if (!store.isEnabled) return;
                if (store.showInDms && isDirectMessage(channelId)) return;
                return false;
            }),
            addChatButton({
                key: "silent-typing",
                side: () => store.button as "left" | "right" | "none",
                render: SilentTypingButton,
            }),
            registerCommand({
                name: "silenttype",
                description: t("Toggle whether you're hiding that you're typing or not."),
                options: [{
                    name: "value",
                    description: t("Whether to hide or not that you're typing (default is toggle)"),
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false,
                } as any],
                execute(args, ctx) {
                    const value = args.find(a => a.name === "value")?.value as unknown as boolean | undefined;
                    store.isEnabled = value ?? !store.isEnabled;
                    messageUtil.sendBotMessage(ctx.channel.id, store.isEnabled ? t("Silent typing enabled!") : t("Silent typing disabled!"));
                },
            }),
        );
    },
});

function isDirectMessage(channelId: string) {
    const channel = getStore("ChannelStore")?.getChannel?.(channelId);
    return channel ? !channel.guild_id : false;
}

function SilentKeyboardIcon({ Icon, style, ...props }: { Icon: any; style?: StyleProp<ImageStyle>; }) {
    const imageStyle = StyleSheet.flatten(style);
    // Discord passes custom icon dimensions in its chat action button's style.
    const width = typeof imageStyle?.width === "number" ? imageStyle.width : 24;
    const height = typeof imageStyle?.height === "number" ? imageStyle.height : width;
    const frame = { width, height };

    return <View style={frame} pointerEvents="none" accessible={false}>
        <Icon {...props} style={[style, frame]} />
        <View style={keyboardStyles.overlay}>
            <View style={[keyboardStyles.slash, { width: Math.min(width, height) * 0.9 }]} />
        </View>
    </View>;
}

function SilentTypingButton() {
    const store = useProxy(plugin.store);
    const Button = getChatInputActionButton();
    const Icon = KeyboardIcon();
    if (!Button || !Icon) return null;

    return <Button
        accessibilityLabel={t("Toggle silent typing")}
        accessibilityState={{ checked: store.isEnabled }}
        IconComponent={store.isEnabled ? (props: any) => <SilentKeyboardIcon {...props} Icon={Icon} /> : Icon}
        onPress={() => {
            store.isEnabled = !store.isEnabled;
            showToast(store.isEnabled ? t("Silent typing enabled!") : t("Silent typing disabled!"), findAssetId("KeyboardIcon"));
        }}
    />;
}

/** The icon with a red line through it, for "on" states of hiding features */
export function SlashedIcon({ Icon, ...props }: { Icon: any; style?: any; }) {
    return <View>
        <Icon {...props} />
        <View
            pointerEvents="none"
            style={{
                position: "absolute",
                left: "-10%",
                top: "45%",
                width: "120%",
                height: 2.5,
                borderRadius: 2,
                backgroundColor: "#ED4245",
                transform: [{ rotate: "-45deg" }],
            }}
        />
    </View>;
}

export default plugin;
