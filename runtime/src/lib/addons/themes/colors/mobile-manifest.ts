/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import chroma from "chroma-js";

import type { VendettaThemeManifest } from "./types";

export const MAX_THEME_LENGTH = 256 * 1024;
const tokenName = /^[A-Z][A-Z0-9_]{0,95}$/;

const record = (value: unknown): Record<string, unknown> | null =>
    value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function normalizeColor(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length > 128 || !chroma.valid(value)) return undefined;
    return chroma(value).hex();
}

export function mobileColorManifest(value: unknown): VendettaThemeManifest | null {
    const source = record(value);
    if (!source) return null;
    const legacy = source.spec === 2 || source.spec == null;
    const modern = source.spec === 3 && source.type === "color" ? record(source.main) : null;
    if (!legacy && !modern) return null;
    const display = modern ? record(source.display) : source;
    const name = typeof display?.name === "string" ? display.name.trim().slice(0, 100) : "";
    if (!name) return null;

    const rawColors: Record<string, string> = {};
    const semanticColors: Record<string, (string | false)[]> = {};
    for (const [key, value] of Object.entries(record(modern ? modern.raw : source.rawColors) ?? {})) {
        const color = tokenName.test(key) && normalizeColor(value);
        if (color) rawColors[key] = color;
    }
    for (const [key, value] of Object.entries(record(modern ? modern.semantic : source.semanticColors) ?? {})) {
        if (!tokenName.test(key)) continue;
        if (legacy && Array.isArray(value)) {
            const dark = normalizeColor(value[0]);
            const light = value[1] === undefined ? dark : normalizeColor(value[1]);
            if (dark || light) semanticColors[key] = [dark ?? false, light ?? false];
        } else if (modern) {
            const definition = record(value);
            if (definition && !["color", "raw"].includes(String(definition.type))) continue;
            const colorValue = definition?.value ?? value;
            const color = normalizeColor(colorValue)
                ?? (typeof colorValue === "string" && tokenName.test(colorValue) ? rawColors[colorValue] : undefined);
            const opacity = definition?.opacity;
            if (!color || opacity != null && (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)) continue;
            const resolved = typeof opacity === "number" ? chroma(color).alpha(opacity).hex() : color;
            semanticColors[key] = [resolved, resolved];
        }
    }
    if (!Object.keys(semanticColors).length && !Object.keys(rawColors).length) return null;
    const authors = Array.isArray(display?.authors) ? display.authors.slice(0, 12).flatMap(author => {
        const name = record(author)?.name;
        return typeof name === "string" && name.trim() ? [{ name: name.trim().slice(0, 80) }] : [];
    }) : undefined;
    return {
        spec: 2,
        name,
        description: typeof display?.description === "string" ? display.description.slice(0, 600) : undefined,
        authors,
        semanticColors,
        rawColors,
    };
}
