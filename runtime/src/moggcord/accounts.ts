import { accountIdentity, createAccountBackupStore } from "../../../shared/account-backups";
import { NativeCacheModule } from "@lib/api/native/modules";
import { findByProps } from "@metro";
import { getStore, moduleAt } from "@plugins/common";

const manageAccountsPath = "modules/multi_account/native/openManageAccountsModal.tsx";

function currentAccount() {
    try {
        return accountIdentity(getStore("UserStore")?.getCurrentUser?.());
    } catch {
        return null;
    }
}

export const discordAccounts = {
    backups: createAccountBackupStore(() => NativeCacheModule),
    current: currentAccount,

    subscribe(listener: () => void) {
        const users = getStore("UserStore");
        users?.addChangeListener?.(listener);
        return () => users?.removeChangeListener?.(listener);
    },

    async openManager(): Promise<boolean> {
        if (!currentAccount()) return false;
        try {
            const feature = findByProps("canUseMultiAccountMobile");
            const available = typeof feature?.canUseMultiAccountMobile === "function"
                ? feature.canUseMultiAccountMobile()
                : feature?.canUseMultiAccountMobile;
            if (available !== true) return false;

            const manager = moduleAt(manageAccountsPath);
            const open = manager?.openManageAccountsModal ?? manager?.default;
            if (typeof open !== "function") return false;
            await open();
            return true;
        } catch {
            // An unavailable native account screen falls back to Discord's web sign-in.
            return false;
        }
    }
};
