/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { t } from "@core/i18n";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { openAlert } from "@lib/ui/alerts";
import { AlertActionButton, AlertActions, AlertModal } from "@metro/common/components";

export function promptThemeRestart() {
    openAlert("moggcord-theme-reload", <AlertModal
        title={t("Restart required")}
        content={t("Restart Discord to apply your theme.")}
        actions={<AlertActions>
            <AlertActionButton text={t("Restart now")} variant="primary" onPress={() => BundleUpdaterManager.reload()} />
            <AlertActionButton text={t("Later")} variant="secondary" />
        </AlertActions>}
    />);
}
