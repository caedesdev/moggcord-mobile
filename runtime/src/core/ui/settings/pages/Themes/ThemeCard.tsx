import { formatString, Strings, t } from "@core/i18n";
import AddonCard, { CardWrapper } from "@core/ui/components/AddonCard";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { useProxy } from "@core/vendetta/storage";
import { canApplyThemes, fetchTheme, removeTheme, selectTheme, themes, VdThemeInfo } from "@lib/addons/themes";
import { findAssetId } from "@lib/api/assets";
import { usesMobileThemeColors } from "@lib/api/native/loader";
import { clipboard } from "@metro/common";
import { showToast } from "@ui/toasts";

import { promptThemeRestart } from "./restart";

async function selectAndApply(value: boolean, theme: VdThemeInfo) {
    try {
        await selectTheme(value ? theme : null);
        if (usesMobileThemeColors()) promptThemeRestart();
    } catch (error) {
        showToast(error instanceof Error ? error.message : t("Couldn't apply the theme."), findAssetId("XSmallIcon"));
    }
}

export default function ThemeCard({ item: theme }: CardWrapper<VdThemeInfo>) {
    useProxy(theme);

    const [removed, setRemoved] = React.useState(false);

    // This is needed because of React™
    if (removed) return null;

    const { authors } = theme.data;

    return (
        <AddonCard
            headerLabel={theme.data.name}
            headerSublabel={Array.isArray(authors) && authors.length ? t("by {authors}", { authors: authors.map(i => i?.name).filter(Boolean).join(", ") }) : ""}
            descriptionLabel={theme.data.description}
            toggleType={canApplyThemes() ? "radio" : undefined}
            toggleValue={() => themes[theme.id].selected}
            onToggleChange={(v: boolean) => {
                selectAndApply(v, theme);
            }}
            overflowTitle={theme.data.name}
            overflowActions={[
                {
                    icon: "RefreshIcon",
                    label: Strings.REFETCH,
                    onPress: () => {
                        fetchTheme(theme.id, theme.selected).then(() => {
                            showToast(Strings.THEME_REFETCH_SUCCESSFUL, findAssetId("DownloadIcon"));
                            if (theme.selected && usesMobileThemeColors()) promptThemeRestart();
                        }).catch(() => {
                            showToast(Strings.THEME_REFETCH_FAILED, findAssetId("XSmallIcon"));
                        });
                    },
                },
                {
                    icon: "LinkIcon",
                    label: Strings.COPY_URL,
                    onPress: () => {
                        clipboard.setString(theme.id);
                        showToast.showCopyToClipboard();
                    }
                },
                {
                    icon: "TrashIcon",
                    label: Strings.DELETE,
                    isDestructive: true,
                    onPress: () => showConfirmationAlert({
                        title: Strings.HOLD_UP,
                        content: formatString("ARE_YOU_SURE_TO_DELETE_THEME", { name: theme.data.name }),
                        confirmText: Strings.DELETE,
                        cancelText: Strings.CANCEL,
                        confirmColor: "red",
                        onConfirm: () => {
                            removeTheme(theme.id).then(wasSelected => {
                                setRemoved(true);
                                if (wasSelected && usesMobileThemeColors()) promptThemeRestart();
                            }).catch((e: Error) => {
                                showToast(e.message, findAssetId("XSmallIcon"));
                            });
                        }
                    })
                },
            ]}
        />
    );
}
