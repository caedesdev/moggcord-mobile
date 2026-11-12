import { t } from "@core/i18n";
import { awaitStorage, createFileBackend, createMMKVBackend, createStorage, flushStorage, wrapSync } from "@core/vendetta/storage";
import { writeFile } from "@lib/api/native/fs";
import { getStoredTheme, getThemeFilePath, isPyonLoader, isThemeSupported, usesMobileThemeColors } from "@lib/api/native/loader";
import { settings } from "@lib/api/settings";
import { awaitStorage as newAwaitStorage } from "@lib/api/storage";
import { isAddonUrl } from "@lib/utils/addonUrl";
import { Platform } from "react-native";

import initColors from "./colors";
import { initMobileColors, saveMobileTheme } from "./colors/mobile";
import { MAX_THEME_LENGTH, mobileColorManifest } from "./colors/mobile-manifest";
import { applyAndroidAlphaKeys, normalizeToHex } from "./colors/parser";
import { colorsPref } from "./colors/preferences";
import { VendettaThemeManifest } from "./colors/types";
import { updateBunnyColor } from "./colors/updater";
import { archivedThemeUrl } from "./marketplace";

export interface VdThemeInfo {
    id: string;
    selected: boolean;
    data: VendettaThemeManifest;
}

export const themes = wrapSync(createStorage<Record<string, VdThemeInfo>>(createMMKVBackend("VENDETTA_THEMES")));
let colorPatchesReady = false;

export function canApplyThemes() {
    return colorPatchesReady && !settings.safeMode?.enabled;
}

export const themeUnavailableMessage = () => t("Custom themes are unavailable with this loader or in Safe Mode.");

/**
 * @internal
 */
export async function writeThemeToNative(theme: VdThemeInfo | {}) {
    if (usesMobileThemeColors()) return;
    if (typeof theme !== "object") throw new Error("Theme must be an object");

    // Save the current theme as current-theme.json. When supported by loader,
    // this json will be written to appropriate path and be used to theme the native side.
    await createFileBackend(getThemeFilePath() || "theme.json").set(theme);
}

// Process data for some compatiblity with native side
function processData(data: VendettaThemeManifest) {
    if (data.semanticColors) {
        const { semanticColors } = data;

        for (const key in semanticColors) {
            for (const index in semanticColors[key]) {
                semanticColors[key][index] &&= normalizeToHex(semanticColors[key][index] as string) || false;
            }
        }
    }

    if (data.rawColors) {
        const { rawColors } = data;

        for (const key in rawColors) {
            const normalized = normalizeToHex(rawColors[key]);
            if (normalized) data.rawColors[key] = normalized;
        }

        if (Platform.OS === "android") applyAndroidAlphaKeys(rawColors);
    }

    // this field is required by the spec but vd seems to ignore this
    // so are most vd themes
    data.spec ??= 2;

    return data;
}

function validateTheme(themeJSON: any): boolean {
    if (typeof themeJSON !== "object" || themeJSON === null) return false;
    if (themeJSON.spec !== 2 && themeJSON.spec !== 3) return false;
    if (themeJSON.spec === 3 && !themeJSON.main) return false;

    return true;
}

/** Why a theme couldn't be downloaded: its site couldn't be reached, the file is gone, the site refused, or it isn't a theme */
export class ThemeDownloadError extends Error {
    constructor(readonly kind: "unreachable" | "gone" | "refused" | "invalid", message: string) {
        super(message);
    }
}

const hostOf = (url: string) => url.match(/^\w+:\/\/([^/?#]+)/)?.[1] ?? url;

/** A GitHub file page (github.com/<owner>/<repo>/blob/...) as its raw file, which is what people often paste */
const rawFileUrl = (url: string) => url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, "https://raw.githubusercontent.com/$1/$2/");

async function fetchOnce(url: string, timeout: number) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
        const response = await fetch(url, { cache: "no-store", signal: abort.signal, credentials: "omit" });
        if (!response.ok) return { response, text: "" };
        if (response.url && !isAddonUrl(response.url)) {
            throw new ThemeDownloadError("invalid", t("Themes can only be installed from an https:// link."));
        }
        if (Number(response.headers?.get("content-length")) > MAX_THEME_LENGTH) {
            throw new ThemeDownloadError("invalid", t("The theme file is too large."));
        }
        const text = await response.text();
        if (text.length > MAX_THEME_LENGTH) {
            throw new ThemeDownloadError("invalid", t("The theme file is too large."));
        }
        return { response, text };
    } finally {
        clearTimeout(timer);
    }
}

/** Downloads a theme and checks it is one, with a reason people can act on when it isn't */
export async function downloadTheme(url: string): Promise<VendettaThemeManifest> {
    const source = rawFileUrl(url);
    if (!isAddonUrl(source)) throw new ThemeDownloadError("invalid", t("Themes can only be installed from an https:// link."));
    let download: Awaited<ReturnType<typeof fetchOnce>>;
    try {
        download = await fetchOnce(source, 20000);
    } catch (error) {
        if (error instanceof ThemeDownloadError) throw error;
        // Once more, for a connection that dropped on the way
        try {
            download = await fetchOnce(source, 20000);
        } catch (error) {
            if (error instanceof ThemeDownloadError) throw error;
            throw new ThemeDownloadError("unreachable", t("Couldn't reach {host}. Check your connection; if it keeps happening, the site the theme is on may be down.", { host: hostOf(source) }));
        }
    }

    const { response: res, text } = download;
    if (res.status === 404 || res.status === 410) {
        const archive = archivedThemeUrl(source);
        if (archive) return downloadTheme(archive);
        throw new ThemeDownloadError("gone", t("The theme isn't at this link anymore ({status}). Its author may have moved or deleted it.", { status: res.status }));
    }
    if (!res.ok) throw new ThemeDownloadError("refused", t("{host} didn't send the theme ({status}).", { host: hostOf(source), status: res.status }));

    let themeJSON: any;
    try {
        // trimStart also drops the byte order mark some Windows editors write, which JSON.parse doesn't accept
        themeJSON = JSON.parse(text.trimStart());
    } catch {
        throw new ThemeDownloadError("invalid", t("This link doesn't lead to a theme file."));
    }
    const data = usesMobileThemeColors() ? mobileColorManifest(themeJSON) : validateTheme(themeJSON) ? themeJSON : null;
    if (!data) throw new ThemeDownloadError("invalid", t("This file isn't a theme Moggcord can use."));
    return data;
}

export async function fetchTheme(url: string, selected = false) {
    const themeJSON = await downloadTheme(url);

    const theme = {
        id: url,
        selected: false,
        data: usesMobileThemeColors() ? themeJSON : processData(themeJSON),
    };
    if (usesMobileThemeColors()) {
        theme.selected = themes[url]?.selected === true;
        themes[url] = theme;
        await flushStorage(themes);
        return;
    }
    if (selected && canApplyThemes()) await selectTheme(theme);
    themes[url] = theme;
}

export async function installTheme(url: string) {
    if (typeof url !== "string" || url in themes) throw new Error("Theme already installed");
    await fetchTheme(url);
}

export function selectTheme(theme: VdThemeInfo | null, write = true) {
    if (theme && !canApplyThemes()) throw new Error(themeUnavailableMessage());
    if (usesMobileThemeColors()) {
        if (theme && (!Object.prototype.hasOwnProperty.call(themes, theme.id) || !mobileColorManifest(themes[theme.id]?.data))) {
            throw new Error(t("This file isn't a theme Moggcord can use."));
        }
        return flushStorage(themes).then(() => saveMobileTheme(theme?.id ?? null)).then(() => {
            updateSelectedTheme(theme?.id ?? null);
        });
    }
    if (canApplyThemes() && (theme || write)) updateBunnyColor(theme?.data ?? null, { update: true });
    if (theme) theme.selected = true;
    updateSelectedTheme(theme?.id ?? null);

    if (theme == null && write) {
        return writeThemeToNative({});
    } else if (theme) {
        return writeThemeToNative(theme);
    }
}

function updateSelectedTheme(id: string | null) {
    for (const theme of Object.values(themes)) {
        const selected = theme?.id === id;
        if (theme && theme.selected !== selected) theme.selected = selected;
    }
}

export async function removeTheme(id: string) {
    const theme = themes[id];
    const wasSelected = theme.selected;
    if (wasSelected) await selectTheme(null);
    delete themes[id];
    if (usesMobileThemeColors()) await flushStorage(themes);

    return wasSelected;
}

export async function updateThemes() {
    await awaitStorage(themes);
    const currentTheme = getThemeFromLoader();
    await Promise.allSettled(Object.keys(themes).map(id => fetchTheme(id, currentTheme?.id === id)));
}

export function getCurrentTheme() {
    return Object.values(themes).find(t => t?.selected) ?? null;
}

/**
 * @internal
 */
export function getThemeFromLoader(): VdThemeInfo | null {
    return getStoredTheme();
}

/**
 * @internal
 */
export async function initThemes() {
    try {
        if (usesMobileThemeColors()) {
            await awaitStorage(themes, settings);
            const colors = await initMobileColors(id => Object.prototype.hasOwnProperty.call(themes, id) ? themes[id]?.data : null);
            if (!colors) return;
            updateSelectedTheme(colors.selected);
            colorPatchesReady = true;
            return () => {
                colorPatchesReady = false;
                colors.dispose();
            };
        }
        if (!isThemeSupported()) return;
        if (isPyonLoader()) {
            writeFile("../vendetta_theme.json", "null");
        }

        await Promise.all([newAwaitStorage(colorsPref), awaitStorage(settings)]);

        const currentTheme = settings.safeMode?.enabled ? null : getThemeFromLoader();
        const unpatch = initColors(currentTheme?.data ?? null);
        colorPatchesReady = true;

        updateThemes().catch(e => console.error("Failed to update themes", e));
        return () => {
            colorPatchesReady = false;
            unpatch();
        };
    } catch (e) {
        console.error("Failed to initialize themes", e);
    }
}
