/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { tx } from "@core/i18n";
import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { installPlatformIconProvider } from "../platformIndicators/render";

const deviceIcons = new Map([
    ["desktop", "d0"], ["browser", "w0"], ["mobile", "m0"], ["console", "c0"], ["vr", "v0"]
]);

export default definePlugin({
    id: "moggcord.platform-spoofer",
    name: "Platform Spoofer",
    description: tx("Preview a different device icon on your own messages. Only visible on this device."),
    icon: "MobilePhoneIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        device: {
            type: "select",
            label: tx("Local device icon"),
            default: "desktop",
            options: [
                { label: tx("Desktop icon"), value: "desktop" },
                { label: tx("Browser icon"), value: "browser" },
                { label: tx("Mobile icon"), value: "mobile" },
                { label: tx("Console icon"), value: "console" },
                { label: tx("VR icon"), value: "vr" }
            ]
        }
    },
    start({ store, cleanup }) {
        cleanup(installPlatformIconProvider("preview", authorId =>
            authorId === currentUserId() ? deviceIcons.get(store.device) ?? "" : ""));
    }
});
