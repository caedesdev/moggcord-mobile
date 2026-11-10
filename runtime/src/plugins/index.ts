/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord's built-in plugins. Endcord starts with only their manifest (names, descriptions, tags); a plugin's code is
 * loaded the first time it starts or its settings open, so the plugins that are off cost nothing at startup.
 */

import type { PluginInstanceInternal } from "@lib/addons/plugins/types";
import compareNames from "@lib/utils/compareNames";
import { createElement } from "react";

import { MoggcordPlugin, isMoggcordPluginRunning, startMoggcordPlugin, stopMoggcordPlugin } from "./api";
import { loaders, manifest, PluginInfo } from "./manifest";

const loaded = new Map<string, MoggcordPlugin<any>>();

let descriptions: Record<string, string> | undefined;
/** English descriptions, read the first time the plugin list shows one */
const descriptionOf = (id: string) => (descriptions ??= require("./descriptions.json") as Record<string, string>)[id] ?? "";

/** A plugin's code, loaded the first time it's needed */
export function loadMoggcordPlugin(id: string): MoggcordPlugin<any> {
    const cached = loaded.get(id);
    if (cached) return cached;
    const load = loaders[id];
    if (!load) throw new Error(`No Moggcord plugin is called ${id}`);
    const plugin = load().default;
    if (plugin?.id !== id) throw new Error(`The module of ${id} defines ${plugin?.id}; regenerate the plugin manifest`);
    loaded.set(id, plugin);
    return plugin;
}

/** How many plugins have had their code loaded, for the self-test to check that startup loads none it needn't */
export const loadedPluginCount = () => loaded.size;

/** Every built-in plugin, loading all of their code (for the self-test) */
export function getMoggcordPlugins(): MoggcordPlugin<any>[] {
    return sorted().map(p => loadMoggcordPlugin(p.id));
}

/** Moggcord PC's popular plugins first, in its order, then the others by name */
function sorted(): PluginInfo[] {
    const popular = manifest.filter(p => p.popular != null).sort((a, b) => a.popular! - b.popular!);
    const others = manifest.filter(p => p.popular == null).sort((a, b) => compareNames(a.name, b.name));
    return [...popular, ...others];
}

/** Moggcord plugins as core plugins of the plugin manager, which handles enabling and settings storage */
export function getMoggcordCorePlugins(): Record<string, { default: PluginInstanceInternal; preenabled: boolean; }> {
    return Object.fromEntries(sorted().map(info => [info.id, {
        preenabled: false,
        default: {
            manifest: {
                id: info.id,
                spec: 3,
                type: "plugin",
                version: "1.0.0",
                main: "",
                display: {
                    name: info.name,
                    get description() {
                        return descriptionOf(info.id);
                    },
                },
                extras: {
                    moggcord: true,
                    popular: info.popular,
                    icon: info.icon,
                    tags: info.tags,
                },
            },
            async start() {
                await startMoggcordPlugin(loadMoggcordPlugin(info.id));
            },
            stop() {
                // A plugin that never started has nothing to stop, and its code needn't be loaded for that
                if (isMoggcordPluginRunning(info.id)) stopMoggcordPlugin(loadMoggcordPlugin(info.id));
            },
            SettingsComponent: info.hasSettings
                ? () => createElement(require("./ui/PluginSettings").default, { plugin: loadMoggcordPlugin(info.id) })
                : undefined,
        } as PluginInstanceInternal,
    }]));
}
