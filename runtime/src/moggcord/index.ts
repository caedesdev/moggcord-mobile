import { createElement } from "react";
import * as React from "react";
import * as RN from "react-native";
import { createMobileScreen } from "../../../shared/screen";
import { createPreferenceStore } from "../../../shared/preferences";
import { createMobileUpdater } from "../../../shared/updates";
import { BundleUpdaterManager, NativeCacheModule } from "@lib/api/native/modules";
import { registerSection } from "@ui/settings";
import { disablePlugin, enablePlugin, isPluginEnabled, registeredPlugins, pluginSettings } from "@lib/addons/plugins";
import { loadMoggcordPlugin } from "@plugins";
import { isMoggcordPluginRunning } from "@plugins/api";
import { manifest } from "@plugins/manifest";
import PluginSettings from "@plugins/ui/PluginSettings";
import descriptions from "@plugins/descriptions.json";
import { MoggcordIcon, moggcordIconSource } from "./BrandIcon";
import { discordAccounts } from "./accounts";

const aliases: Record<string, string> = {
    messagelogger: "moggcord.message-logger",
    calltimer: "moggcord.call-timer",
    fakedeafen: "moggcord.fake-mute"
};
const subscribers = new Set<() => void>();
const failures = new Set<string>();
const pending = new Set<string>();
const announce = () => subscribers.forEach(update => update());
const preferences = createPreferenceStore(() => NativeCacheModule);
let updates = Promise.resolve();
const updater = createMobileUpdater({ version: MOGGCORD_MOBILE_VERSION, bridge: (globalThis as any).__MOGGCORD_UPDATER__,
    reload: typeof BundleUpdaterManager?.reload === "function" ? () => BundleUpdaterManager.reload() : undefined });
updater.subscribe(announce);

const runtime = {
    accounts: discordAccounts,
    snapshot: () => ({
        plugins: manifest.map(info => ({
            id: info.id, title: info.name, priority: info.popular ?? 10000,
            mark: info.name.replace(/[^A-Z]/g, "").slice(0, 2) || info.name.slice(0, 2),
            category: info.tags?.join(" · ") || "Utility",
            description: (descriptions as Record<string, string>)[info.id] || "",
            enabled: isPluginEnabled(info.id),
            active: isMoggcordPluginRunning(info.id),
            available: registeredPlugins.has(info.id),
            failed: failures.has(info.id), busy: pending.has(info.id),
            hasSettings: info.hasSettings === true
        })).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.priority - b.priority || a.title.localeCompare(b.title)),
        log: [], callStarted: null, fakeStatus: "", updater: updater.snapshot()
    }),
    setEnabled(ids: string[], accountId?: string) {
        const selected = new Set(ids.map(id => aliases[id] ?? id));
        const operation = updates.then(async () => {
            if (accountId && discordAccounts.current()?.id !== accountId) {
                throw new Error("The Discord account changed before the backup could be restored.");
            }
            let failed = false;
            const operations = manifest.map(async info => {
                const wanted = selected.has(info.id);
                if (wanted === isPluginEnabled(info.id)) return;
                pending.add(info.id);
                failures.delete(info.id);
                announce();
                try {
                    if (wanted) await enablePlugin(info.id, true);
                    else disablePlugin(info.id);
                } catch (error) {
                    failed = true;
                    failures.add(info.id);
                    if (isPluginEnabled(info.id)) disablePlugin(info.id);
                    console.warn("[Moggcord]", info.name, String(error));
                } finally {
                    pending.delete(info.id);
                    announce();
                }
            });
            await Promise.all(operations);
            return !failed;
        });
        updates = operation.then(() => {}, () => {});
        return operation;
    },
    subscribe(listener: () => void) {
        subscribers.add(listener);
        const emitter = (pluginSettings as any)[Symbol.for("vendetta.storage.emitter")];
        emitter?.on("SET", listener);
        emitter?.on("DEL", listener);
        return () => {
            subscribers.delete(listener);
            emitter?.off("SET", listener);
            emitter?.off("DEL", listener);
        };
    },
    currentEnabled() {
        return manifest.filter(info => isPluginEnabled(info.id)).map(info => info.id);
    },
    settingsComponent(id: string) {
        const plugin = loadMoggcordPlugin(id);
        return () => createElement(PluginSettings, { plugin });
    },
    clearLog() {},
    checkForUpdates: () => updater.check(),
    installUpdate: () => updater.install(),
    restartApp: () => updater.restart()
};

export async function initMoggcordSettings() {
    const saved = await preferences.load();
    const legacy = saved.enabledPlugins.filter(id => Object.prototype.hasOwnProperty.call(aliases, id));
    for (const id of legacy) {
        if (registeredPlugins.has(aliases[id])) {
            try { await enablePlugin(aliases[id], false); }
            catch (error) { console.warn("[Moggcord] Restoring plugin", id, String(error)); }
        }
    }
    saved.enabledPlugins = runtime.currentEnabled();
    if (legacy.length) await preferences.save(saved);
    const Screen = createMobileScreen(React, RN, preferences, runtime);
    registerSection({
        name: "Moggcord",
        items: [{
            key: "MOGGCORD_MOBILE", title: () => "Moggcord Mobile",
            icon: moggcordIconSource, rawTabsConfig: { IconComponent: MoggcordIcon },
            render: async () => ({ default: Screen })
        }]
    });
}
