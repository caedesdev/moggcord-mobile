/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { NativeCacheModule } from "@lib/api/native/modules";
import { instead } from "@lib/api/patcher";
import { settings } from "@lib/api/settings";
import { findByProps } from "@metro";
import chroma from "chroma-js";

import { legacyRawColor, legacySemanticColor } from "./legacy";
import { mobileColorManifest } from "./mobile-manifest";
import type { InternalColorDefinition } from "./types";

const activeKey = "cc.moggcord.mobile.theme.v1";
type Selection = { id: string; checking: boolean; } | null;
type PalettePair = { dark: InternalColorDefinition; light: InternalColorDefinition; };

let selection: Selection = null;
let active: PalettePair | null = null;
let writes = Promise.resolve();

function persist(next: Selection) {
    const operation = writes.then(async () => {
        await NativeCacheModule.setItem(activeKey, JSON.stringify(next));
        selection = next;
    });
    writes = operation.then(() => {}, () => {});
    return operation;
}

export const saveMobileTheme = (id: string | null) => persist(id ? { id, checking: false } : null);

export async function confirmMobileTheme() {
    const started = selection;
    if (!started?.checking) return;
    const operation = writes.then(async () => {
        if (selection !== started) return;
        const ready = { id: started.id, checking: false };
        await NativeCacheModule.setItem(activeKey, JSON.stringify(ready));
        selection = ready;
    });
    writes = operation.then(() => {}, () => {});
    return operation;
}

export async function initMobileColors(findTheme: (id: string) => unknown) {
    if (typeof NativeCacheModule?.getItem !== "function" || typeof NativeCacheModule?.setItem !== "function") return null;
    const tokens = findByProps("SemanticColor");
    const resolver = [tokens?.default?.meta, tokens?.default?.internal]
        .find(candidate => typeof candidate?.resolveSemanticColor === "function");
    if (!tokens?.SemanticColor || !resolver) return null;
    selection = null;
    active = null;
    const raw = tokens.RawColor ?? {};
    const names = new WeakMap<object, string>();
    for (const [name, token] of Object.entries(tokens.SemanticColor)) {
        if (token && typeof token === "object") names.set(token, name);
    }

    let saved: Selection = null;
    try {
        const parsed = JSON.parse(await NativeCacheModule.getItem(activeKey) ?? "null");
        if (typeof parsed?.id === "string" && typeof parsed.checking === "boolean") saved = parsed;
    } catch (error) {
        console.warn("[Moggcord] Could not read the active mobile theme", error);
    }

    const theme = saved && !saved.checking ? mobileColorManifest(findTheme(saved.id)) : null;
    if (saved && !theme) await persist(null);
    if (saved && theme && settings.safeMode?.enabled) selection = saved;
    if (saved && theme && !settings.safeMode?.enabled) {
        const buildPalette = (light: boolean): InternalColorDefinition => {
            const semantic: InternalColorDefinition["semantic"] = {};
            for (const [name, colors] of Object.entries(theme.semanticColors ?? {})) {
                const color = colors[light ? 1 : 0];
                if (color) semantic[name] = { value: color, opacity: 1 };
            }
            return { spec: 2, reference: light ? "light" : "darker", raw: theme.rawColors ?? {}, semantic };
        };
        await persist({ id: saved.id, checking: true });
        active = { dark: buildPalette(false), light: buildPalette(true) };
    }

    const unpatch = instead("resolveSemanticColor", resolver, (args: unknown[], original: (...args: unknown[]) => unknown) => {
        const [themeName, token] = args;
        if (!active || settings.safeMode?.enabled || typeof themeName !== "string" || !token || typeof token !== "object") {
            return original(...args);
        }
        const name = names.get(token) ?? Object.getOwnPropertySymbols(token)
            .map(symbol => (token as Record<symbol, unknown>)[symbol])
            .find(value => typeof value === "string" && Object.prototype.hasOwnProperty.call(tokens.SemanticColor, value));
        if (typeof name !== "string") return original(...args);

        const palette = themeName === "light" ? active.light : active.dark;
        const definition = tokens.SemanticColor[name]?.[themeName];
        const color = palette.semantic[name] ?? legacySemanticColor(palette, name, definition, raw);
        if (color?.value) return color.opacity === 1 ? color.value : chroma(color.value).alpha(color.opacity).hex();
        if (typeof definition?.raw === "string") {
            const replacement = palette.raw[definition.raw] ?? legacyRawColor(palette, definition.raw, raw);
            const opacity = definition.opacity;
            if (replacement) {
                return typeof opacity === "number" && opacity >= 0 && opacity < 1
                    ? chroma(replacement).alpha(opacity).hex() : replacement;
            }
        }
        return original(...args);
    });
    return { selected: selection?.id ?? null, dispose: () => {
        active = null;
        unpatch();
    } };
}
