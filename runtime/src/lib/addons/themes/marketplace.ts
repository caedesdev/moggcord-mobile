const approved = "https://raw.githubusercontent.com/kmmiio99o/theme-marketplace/main/themes/approved/";

// The public catalog omits most previews. These are the matching entries in its approved archive.
const approvedPreviews = new Map([
    ["\u{1030C} blue dino", "blue-dino-1757164546843"],
    ["Clear Vision", "clearvision-v126-1757163238896"],
    ["Cyberpunk 2077", "cyberpunk-2077-1757195689697"],
    ["Dark Blossom", "dark-blossom-1756299787345"],
    ["Dos.Terminal", "dosterminal-1757162940251"],
    ["Light Blossom", "light-blossom-1756299765934"],
    ["Midnight Vencord", "midnight-vencord-1756294017700"],
    ["Nightshade", "nightshade-1757164725302"],
    ["Pastel Blue", "pastel-blue-1757164782881"],
    ["Pure Black 1.5D", "pure-black-15d-1757163394005"],
    ["Purple Serenity", "purple-serenity-1757163111822"],
    ["RBW AMOLED", "rbw-amoled-1757163279947"],
    ["RosieDark", "rosiedark-1757162877515"],
    ["Tenka Izumo", "tenka-izumo-1756299746614"],
    ["Ukiyo", "ukiyo-1757163090618"],
    ["YouBlue", "youblue-1757163347183"],
    ["puhbuAMOLEDTEST", "puhbuamoledtest-1758970243772"],
    ["Ataraxia", "ataraxia-1759696754514"],
    ["AMOLED Anime Theme", "amoled-anime-theme-1760257323881"],
    ["Pyontheme", "pyontheme-1762001172482"],
    ["SkyMoled v1.0", "skymoled-v10-1762514196654"],
    ["Aetheris", "aetheris-1762599581742"],
]);

const authorPreviews = new Map([
    ["Cutie Rikka", "https://raw.githubusercontent.com/ruruyaa/rikka_theme/main/preview01.jpg"],
    ["Glorious Sunset", "https://raw.githubusercontent.com/eeriemyxi/glorious-sunset/main/assets/screenshots/one.jpg"],
]);

export function marketplacePreview(name: string) {
    const id = approvedPreviews.get(name);
    return id ? approved + id + "-preview.png" : authorPreviews.get(name);
}

// Try the marketplace's preserved copy when an original author link is gone.
const archivedThemes = new Map([
    ["https://raw.githubusercontent.com/luzikii/vendetta/main/CP2077HUD.json", "cyberpunk-2077-1757195689697"],
    ["https://raw.githubusercontent.com/wiwiichan/AMOLED-anime-theme/refs/heads/main/amoled-anime-theme.json", "amoled-anime-theme-1760257323881"],
]);

export function archivedThemeUrl(url: string) {
    const id = archivedThemes.get(url);
    return id ? approved + id + ".json" : undefined;
}
