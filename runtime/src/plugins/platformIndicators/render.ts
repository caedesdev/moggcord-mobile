/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { t } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByName } from "@metro";

const suffix = /\s*\u2063mcpi\|(?:[dwmcv][0-3]){1,5}\u2063$/;
const providers = new Map<"preview" | "presence", (authorId: string) => string>();
let unpatch: (() => unknown) | undefined;

export function installPlatformIconProvider(kind: "preview" | "presence", iconsFor: (authorId: string) => string) {
    if ((globalThis as any).__MOGGCORD_PLATFORM_ICONS__?.apiVersion !== 1) {
        throw new Error(t("Install the latest Moggcord Mobile app once to display device icons."));
    }
    if (!unpatch) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");
        unpatch = after("generate", RowManager.prototype, ([args], row) => {
            try {
                const message = row?.type === 1 ? row.message : undefined;
                if (typeof message?.timestamp !== "string") return;
                message.timestamp = message.timestamp.replace(suffix, "");
                const author = args?.message?.author;
                if (!author?.id || author.bot) return;
                const icons = providers.get("preview")?.(author.id) || providers.get("presence")?.(author.id);
                if (icons) message.timestamp += "  \u2063mcpi|" + icons + "\u2063";
            } catch (error) {
                console.error("[Moggcord] Could not display the platform icon", error);
            }
        });
    }
    providers.set(kind, iconsFor);
    return () => {
        if (providers.get(kind) !== iconsFor) return;
        providers.delete(kind);
        if (providers.size) return;
        unpatch?.();
        unpatch = undefined;
    };
}
