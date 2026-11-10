import initFixes from "@core/fixes";
import { initOverlayHost } from "@core/overlay";
import { markReady, step } from "@core/timings";
import { initVendettaObject } from "@core/vendetta/api";
import { initPlugins, updatePlugins } from "@lib/addons/plugins";
import { patchCommands } from "@lib/api/commands";
import { injectFluxInterceptor } from "@lib/api/flux";
import { patchJsx } from "@lib/api/react/jsx";
import { patchSettings } from "@ui/settings";
import { initMoggcordSettings } from "./moggcord";
import * as lib from "./lib";

export default async () => {
    const overlay = initOverlayHost();
    if (overlay) lib.unload.push(overlay);
    window.bunny = lib;
    await Promise.all([
        step("flux", injectFluxInterceptor),
        step("settings", patchSettings),
        step("commands", patchCommands),
        step("jsx", patchJsx),
        step("vendetta", initVendettaObject),
        step("fixes", initFixes),
        step("plugins", updatePlugins),
    ]).then(cleanups => cleanups.forEach(cleanup => cleanup && lib.unload.push(cleanup)));
    await initMoggcordSettings();
    await initPlugins();
    markReady();
};
