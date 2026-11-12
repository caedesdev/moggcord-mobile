/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ThemeLibrary: a page of themes to browse and install, in Endcord's settings and EndcordToolbox.
 */

import { t, tx } from "@core/i18n";
import { promptThemeRestart } from "@core/ui/settings/pages/Themes/restart";
import { useProxy } from "@core/vendetta/storage";
import { canApplyThemes, downloadTheme, getCurrentTheme, installTheme, selectTheme, ThemeDownloadError, themes, themeUnavailableMessage } from "@lib/addons/themes";
import { marketplacePreview } from "@lib/addons/themes/marketplace";
import { findAssetId } from "@lib/api/assets";
import { usesMobileThemeColors } from "@lib/api/native/loader";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import { Button, Card, Stack, Text } from "@metro/common/components";
import { semanticColorOf } from "@ui/color";
import { Search } from "@ui/components";
import { createStyles } from "@ui/styles";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text as NativeText, View } from "react-native";

import { definePlugin } from "../api";
import { addSettingsPage, addToolboxAction } from "../common";
import { describeError } from "../hooks";
import { openPage } from "../ui/pages";
import { previewImageUrl, themePreviewPalette, type ThemePreviewPalette } from "./preview";

const useStyles = createStyles({
    preview: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8, overflow: "hidden" },
    previewImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
    palette: { flex: 1, flexDirection: "row" },
    rail: { width: "19%", alignItems: "center", gap: 8, paddingTop: 14 },
    railIcon: { width: 19, height: 19, borderRadius: 7 },
    chat: { flex: 1, padding: 12, justifyContent: "space-between" },
    channel: { fontSize: 13, fontWeight: "700" },
    message: { flexDirection: "row", alignItems: "center", gap: 8 },
    avatar: { width: 22, height: 22, borderRadius: 11 },
    lines: { flex: 1, gap: 5 },
    line: { height: 4, borderRadius: 2, opacity: 0.4 },
    footer: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 },
    caption: { fontSize: 10, fontWeight: "600" },
    noPreview: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: semanticColorOf("BACKGROUND_MOD_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOW"),
    },
    noPreviewIcon: { width: 40, height: 40, tintColor: semanticColorOf("TEXT_MUTED", "INTERACTIVE_NORMAL") },
});

interface LibraryTheme {
    name: string;
    description?: string;
    authors?: string[];
    installUrl: string;
    previewUrl?: string;
}

// A community-run list of mobile themes, checked by its maintainers
const MARKETPLACE = "https://raw.githubusercontent.com/kmmiio99o/theme-marketplace/main/themes.json";
const CATPPUCCIN = "https://raw.githubusercontent.com/catppuccin/vendetta/main/themes";

const catppuccin: LibraryTheme[] = [
    ["mocha", "Mocha"], ["macchiato", "Macchiato"], ["frappe", "Frappé"], ["latte", "Latte"]
].map(([id, name]) => ({
    name: `Catppuccin ${name}`,
    description: tx("Soothing pastel theme for the high-spirited!"),
    authors: ["Catppuccin"],
    installUrl: `${CATPPUCCIN}/${id}/mauve.json`,
    previewUrl: `https://raw.githubusercontent.com/catppuccin/vendetta/main/assets/${id}.webp`,
}));

// Cards share the row out evenly, never narrower than this, so a tablet shows a few side by side
const MIN_CARD_WIDTH = 300;
const GAP = 12;

const plugin = definePlugin({
    id: "moggcord.theme-library",
    name: "ThemeLibrary",
    description: tx("Browse and install themes for Discord on your phone without leaving the app."),
    popular: 7,
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Customisation"],
    start({ cleanup }) {
        cleanup(
            addSettingsPage("theme-library", { title: () => t("Theme Library"), icon: "PaintbrushThinIcon", Page: LibraryPage, after: "BUNNY_THEMES" }),
            addToolboxAction("theme-library", { label: () => t("Open Theme Library"), icon: "PaintbrushThinIcon", run: () => openPage(t("Theme Library"), LibraryPage) }),
        );
    },
    SettingsComponent: Library,
});

function ThemePreview({ imageUrl, palette }: { imageUrl?: string; palette?: ThemePreviewPalette }) {
    const styles = useStyles();
    const [failed, setFailed] = useState<string>();
    return <View style={[styles.preview, !palette && styles.noPreview]} accessible accessibilityLabel={t("Theme preview")}>
        {palette ? <View style={[styles.palette, { backgroundColor: palette.chat }]}>
            <View style={[styles.rail, { backgroundColor: palette.sidebar }]}>
                <View style={[styles.railIcon, { backgroundColor: palette.accent }]} />
                <View style={[styles.railIcon, { backgroundColor: palette.text, opacity: 0.2 }]} />
                <View style={[styles.railIcon, { backgroundColor: palette.text, opacity: 0.12 }]} />
            </View>
            <View style={styles.chat}>
                <NativeText style={[styles.channel, { color: palette.text }]}># general</NativeText>
                <View style={styles.message}>
                    <View style={[styles.avatar, { backgroundColor: palette.accent }]} />
                    <View style={styles.lines}>
                        <View style={[styles.line, { backgroundColor: palette.text, width: "30%" }]} />
                        <View style={[styles.line, { backgroundColor: palette.text, width: "76%" }]} />
                    </View>
                </View>
                <View style={styles.message}>
                    <View style={[styles.avatar, { backgroundColor: palette.text, opacity: 0.2 }]} />
                    <View style={styles.lines}>
                        <View style={[styles.line, { backgroundColor: palette.text, width: "36%" }]} />
                        <View style={[styles.line, { backgroundColor: palette.text, width: "57%" }]} />
                    </View>
                </View>
                <View style={[styles.footer, { backgroundColor: palette.panel }]}>
                    <NativeText style={[styles.caption, { color: palette.text }]}>{t("Color preview")}</NativeText>
                </View>
            </View>
        </View> : <Image source={findAssetId("PaintPaletteIcon")!} style={styles.noPreviewIcon} />}
        {imageUrl && imageUrl !== failed && <Image
            source={{ uri: imageUrl }}
            style={styles.previewImage}
            resizeMode="cover"
            resizeMethod="resize"
            onError={() => setFailed(imageUrl)}
        />}
    </View>;
}

const ThemeCard = memo(function ThemeCard({ theme, width, palette }: {
    theme: LibraryTheme; width: number; palette?: ThemePreviewPalette;
}) {
    const installed = useProxy(themes);
    const [busy, setBusy] = useState(false);
    const entry = installed[theme.installUrl];
    const savedPalette = useMemo(() => entry?.data ? themePreviewPalette(entry.data) : undefined, [entry?.data]);
    const canApply = canApplyThemes();
    const applied = canApply && !!entry?.selected;

    const apply = async () => {
        setBusy(true);
        try {
            if (!entry) await installTheme(theme.installUrl);
            if (!canApplyThemes()) {
                showToast(t("Theme downloaded"), findAssetId("CheckmarkLargeIcon"));
                return;
            }
            await selectTheme(themes[theme.installUrl]);
            promptThemeRestart();
        } catch (e) {
            showToast(t("Couldn't install the theme: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary"));
        } finally {
            setBusy(false);
        }
    };

    return <Card style={{ width, justifyContent: "space-between", gap: 10 }}>
        <Stack spacing={10}>
            <ThemePreview imageUrl={theme.previewUrl} palette={savedPalette ?? palette} />
            <View>
                <Text variant="heading-md/semibold">{theme.name}</Text>
                {!!theme.authors?.length && <Text variant="text-sm/medium" color="text-muted">
                    {t("by {authors}", { authors: theme.authors.join(", ") })}
                </Text>}
            </View>
            {!!theme.description && <Text variant="text-md/medium">{t(theme.description)}</Text>}
        </Stack>
        <Button
            text={applied ? t(usesMobileThemeColors() ? "Selected" : "Applied")
                : entry ? t(canApply ? "Apply" : "Downloaded") : t(canApply ? "Download and apply" : "Download")}
            variant={applied ? "secondary" : "primary"}
            size="md"
            disabled={applied || !!entry && !canApply}
            loading={busy}
            onPress={apply}
        />
    </Card>;
});

function useMarketplace() {
    const [list, setList] = useState<LibraryTheme[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        safeFetch(MARKETPLACE, { cache: "no-store" })
            .then(r => r.json())
            .then((items: any[]) => setList(items.slice(0, 128)
                .filter(i => typeof i?.name === "string" && typeof i.installUrl === "string" && /^https:\/\//.test(i.installUrl))
                .map(i => ({
                    name: i.name.slice(0, 100),
                    description: typeof i.description === "string" ? i.description.slice(0, 600) : undefined,
                    authors: Array.isArray(i.authors) ? i.authors.slice(0, 12).map((a: any) => typeof a === "string" ? a : a?.name)
                        .filter((name: unknown): name is string => typeof name === "string").map((name: string) => name.slice(0, 80)) : undefined,
                    installUrl: i.installUrl,
                    previewUrl: previewImageUrl(i.previewUrl, i.preview, i.imageUrl, marketplacePreview(i.name)),
                }))))
            .catch(() => {
                setFailed(true);
                setList([]);
            });
    }, []);

    return { list, failed };
}

type CheckResult = ThemePreviewPalette | ThemeDownloadError["kind"];

// Marketplace links go stale when authors move or delete a theme. Each one is tried once per app start, a few at a
// time, so the library can leave out the themes that can't be installed
const MAX_CHECKS = 6;
const checks = new Map<string, Promise<CheckResult>>();
const waiting: Array<() => void> = [];
let checking = 0;

function checkTheme(url: string) {
    let result = checks.get(url);
    if (!result) {
        checks.set(url, result = new Promise<CheckResult>(resolve => {
            const run = () => {
                checking++;
                downloadTheme(url)
                    .then(themePreviewPalette)
                    .then(resolve, e => resolve(e instanceof ThemeDownloadError ? e.kind : "invalid"))
                    .finally(() => {
                        checking--;
                        waiting.shift()?.();
                    });
            };
            if (checking < MAX_CHECKS) run();
            else waiting.push(run);
        }));
    }
    return result;
}

/** The links that don't lead to an installable theme */
function useThemeChecks(urls: string[]) {
    const [results, setResults] = useState<Record<string, CheckResult>>({});

    useEffect(() => {
        let live = true;
        for (const url of urls) checkTheme(url).then(result => live && setResults(r => ({ ...r, [url]: result })));
        return () => void (live = false);
    }, [urls]);

    return useMemo(() => {
        // A site that couldn't be reached only counts once another theme came through, so being offline hides nothing
        const online = Object.values(results).some(result => typeof result !== "string");
        const unavailable = new Set(Object.entries(results)
            .filter(([, result]) => typeof result === "string" && (result !== "unreachable" || online))
            .map(([url]) => url));
        return { results, unavailable };
    }, [results]);
}

/** The library: Catppuccin's themes, then the marketplace's, searchable by name, author and description */
function Library() {
    const { list, failed } = useMarketplace();
    const installed = useProxy(themes);
    const [query, setQuery] = useState("");
    const [width, setWidth] = useState(0);
    const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
    const cardWidth = (width - GAP * (columns - 1)) / columns;

    const listed = useMemo(() => [...catppuccin, ...list ?? []], [list]);
    const { results, unavailable } = useThemeChecks(useMemo(() => listed.map(theme => theme.installUrl), [listed]));

    // Not memoized: `installed` is the same object as it changes, and the list is a few dozen themes
    const q = query.trim().toLowerCase();
    const shown = listed.filter(theme =>
        // Installed themes stay, since they apply from what was saved when they were installed
        (!unavailable.has(theme.installUrl) || installed[theme.installUrl])
        && (!q || [theme.name, theme.description && t(theme.description), ...theme.authors ?? []]
            .some(text => text?.toLowerCase().includes(q))));

    return <Stack spacing={12}>
        <Text variant="text-sm/medium" color="text-muted">
            {canApplyThemes()
                ? t("Download mobile color themes. Restart Discord to apply them.")
                : themeUnavailableMessage()}
        </Text>
        {canApplyThemes() && getCurrentTheme() && <Button
            text={t("Use default theme")}
            variant="secondary"
            onPress={async () => {
                try {
                    await selectTheme(null);
                    promptThemeRestart();
                } catch (error) {
                    showToast(describeError(error), findAssetId("CircleXIcon-primary"));
                }
            }}
        />}
        <Search placeholder={t("Search for a theme...")} onChangeText={setQuery} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && shown.map(theme => {
                const result = results[theme.installUrl];
                return <ThemeCard key={theme.installUrl} theme={theme} width={cardWidth}
                    palette={typeof result === "string" ? undefined : result} />;
            })}
        </View>
        {list === null && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {list !== null && !shown.length && <Text variant="text-md/medium" color="text-muted" style={{ textAlign: "center" }}>{t("No results")}</Text>}
        {failed && <Text variant="text-md/medium" color="text-feedback-critical">{t("Couldn't load the theme list. Check your connection and try again.")}</Text>}
    </Stack>;
}

export function LibraryPage() {
    return <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Library />
    </ScrollView>;
}

export default plugin;
