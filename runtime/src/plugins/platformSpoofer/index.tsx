/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { t, tx } from "@core/i18n";
import { after, instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { Platform } from "react-native";

import { definePlugin } from "../api";
import { currentUserId, moduleAt } from "../common";
import { installPlatformIconProvider } from "../platformIndicators/render";

const devices = new Map([
    ["desktop", { icon: "d0", browser: "Discord Client" }],
    ["browser", { icon: "w0", browser: "Discord Web" }],
    ["mobile", { icon: "m0", browser: Platform.OS === "ios" ? "Discord iOS" : "Discord Android" }],
    ["console", { icon: "c0", browser: "Discord Embedded" }],
    ["vr", { icon: "v0", browser: "Discord VR" }],
]);

export default definePlugin({
    id: "moggcord.platform-spoofer",
    name: "Platform Spoofer",
    description: tx("Choose the platform Discord shows for your session, or preview its icon locally."),
    icon: "MobilePhoneIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        device: {
            type: "select",
            label: tx("Platform"),
            default: "desktop",
            options: [
                { label: tx("Desktop icon"), value: "desktop" },
                { label: tx("Browser icon"), value: "browser" },
                { label: tx("Mobile icon"), value: "mobile" },
                { label: tx("Console icon"), value: "console" },
                { label: tx("VR icon"), value: "vr" }
            ]
        },
        visibleToOthers: {
            type: "boolean",
            label: tx("Visible to others"),
            description: tx("Report the selected platform to Discord. Fully restart Discord to apply the change."),
            default: false,
        },
    },
    start({ store, cleanup }) {
        if (!store.visibleToOthers) {
            cleanup(installPlatformIconProvider("preview", authorId =>
                !store.visibleToOthers && authorId === currentUserId() ? devices.get(store.device)?.icon ?? "" : ""));
            return;
        }

        const properties = findByProps("getSuperProperties", "getSuperPropertiesBase64");
        const fastConnect = moduleAt("modules/gateway/native/fast_connect.tsx");
        const socket = moduleAt("modules/gateway/GatewaySocketSingleton.tsx")?.socket;
        if (typeof properties?.getSuperProperties !== "function" ||
            typeof fastConnect?.identifyWebSocket !== "function" ||
            typeof socket?.handleIdentify !== "function") {
            throw new Error(t("This Discord build does not support reporting a different platform."));
        }

        // Both identification paths read the properties synchronously. Limit the override to those calls.
        let browserOverride: string | undefined;
        const withPlatform = (args: unknown[], original: Function) => {
            const previous = browserOverride;
            browserOverride = store.visibleToOthers ? devices.get(store.device)?.browser : undefined;
            try {
                return original(...args);
            } finally {
                browserOverride = previous;
            }
        };
        cleanup(after("getSuperProperties", properties, (_args, value) => {
            if (browserOverride && typeof value?.browser === "string") {
                return { ...value, browser: browserOverride };
            }
        }));
        cleanup(instead("identifyWebSocket", fastConnect, withPlatform));
        cleanup(instead("handleIdentify", socket, withPlatform));
    }
});
