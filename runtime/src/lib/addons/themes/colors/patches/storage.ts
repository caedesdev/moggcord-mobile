import { _colorRef } from "@lib/addons/themes/colors/updater";
import { after, before } from "@lib/api/patcher";
import { findInTree } from "@lib/utils";
import { proxyLazy } from "@lib/utils/lazy";
import { findByProps } from "@metro";

import { appearanceStores, restoreBuiltInTheme } from "../recovery";

const mmkvStorage = proxyLazy(() => {
    const newModule = findByProps("impl");
    if (typeof newModule?.impl === "object") return newModule.impl;
    return findByProps("storage");
});

export default function patchStorage() {
    const patches = [
        after("get", mmkvStorage, ([key], ret) => {
            // Nothing is stored yet on a new install
            if (!appearanceStores.has(key) || !ret?._state) return;
            if (!_colorRef.current) {
                const json = JSON.stringify(ret);
                const restored = restoreBuiltInTheme(json, _colorRef.lastSetDiscordTheme);
                if (json !== restored) return JSON.parse(restored);
                return;
            }

            const state = findInTree(ret._state, s => typeof s.theme === "string");
            if (state) state.theme = _colorRef.key;
        }),
        before("set", mmkvStorage, ([key, value]) => {
            if (!appearanceStores.has(key) || value == null) return;

            const json = JSON.stringify(value);
            if (typeof json !== "string") return;
            const restored = restoreBuiltInTheme(json, _colorRef.lastSetDiscordTheme);
            if (json !== restored) return [key, JSON.parse(restored)];
        })
    ];

    return () => patches.forEach(p => p());
}
