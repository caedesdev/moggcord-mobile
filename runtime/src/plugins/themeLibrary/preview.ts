import type { VendettaThemeManifest } from "@lib/addons/themes/colors/types";

const color = (value: unknown): value is string => typeof value === "string" && /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(value);

export function previewImageUrl(...candidates: unknown[]) {
    return candidates.find((value): value is string =>
        typeof value === "string" && /^https:\/\/[^/@\s?#]+(?:[/?#]\S*)?$/i.test(value));
}

export function themePreviewPalette(theme: VendettaThemeManifest) {
    const raw = theme.rawColors ?? {};
    const semantic = theme.semanticColors ?? {};
    const token = (name: string) => {
        const values = semantic[name];
        return Array.isArray(values) ? values.find(color) : undefined;
    };
    const pick = (...names: string[]) => names.map(name => token(name) ?? raw[name]).find(color);
    const chat = pick("CHAT_BACKGROUND", "BACKGROUND_BASE_LOW", "BG_BASE_PRIMARY", "BACKGROUND_PRIMARY", "BACKGROUND_MOBILE_PRIMARY", "PRIMARY_600")
        ?? "#1c2130";
    const sidebar = pick("BACKGROUND_BASE_LOWEST", "BACKGROUND_TERTIARY", "BACKGROUND_SECONDARY", "PRIMARY_700")
        ?? chat;
    const panel = pick("REDESIGN_CHAT_INPUT_BACKGROUND", "CHANNELTEXTAREA_BACKGROUND", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOWER",
        "BACKGROUND_SECONDARY", "PRIMARY_660") ?? sidebar;
    const rgb = Number.parseInt(chat.slice(1, 7), 16);
    const light = (rgb >> 16) * 0.299 + (rgb >> 8 & 255) * 0.587 + (rgb & 255) * 0.114 > 160;
    const text = pick("TEXT_DEFAULT", "TEXT_NORMAL", "HEADER_PRIMARY", "PRIMARY_100") ?? (light ? "#172033" : "#eef1fc");
    const accent = pick("BACKGROUND_BRAND", "TEXT_BRAND", "CONTROL_BRAND_FOREGROUND", "BRAND_500", "BRAND_360")
        ?? Object.values(raw).find(color) ?? text;
    return { chat, sidebar, panel, text, accent };
}

export type ThemePreviewPalette = ReturnType<typeof themePreviewPalette>;
