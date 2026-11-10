import { NativeCacheModule } from "@lib/api/native/modules";

export const appearanceStores = new Set(["ThemeStore", "SelectivelySyncedUserSettingsStore"]);

export function restoreBuiltInTheme(json: string, fallback = "darker") {
    const theme = JSON.stringify(fallback.startsWith("bn-theme-") ? "darker" : fallback);
    return json.replace(/("theme"\s*:\s*)"bn-theme-\d+"/g, (_, key) => key + theme);
}

/** Repair legacy Moggcord theme IDs before Discord reads its saved appearance. */
export async function recoverDiscordTheme() {
    if (!NativeCacheModule?.getItem || !NativeCacheModule.setItem) return;
    await Promise.all([...appearanceStores].map(async store => {
        try {
            const saved = await NativeCacheModule.getItem(store);
            if (typeof saved !== "string") return;
            const restored = restoreBuiltInTheme(saved);
            if (saved === restored) return;
            JSON.parse(saved);
            await NativeCacheModule.setItem(store, restored);
        } catch {
            console.warn("[Moggcord] Could not recover Discord appearance for", store);
        }
    }));
}
