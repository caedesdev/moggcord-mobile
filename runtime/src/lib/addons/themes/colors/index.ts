import patchChatBackground from "./patches/background";
import patchDefinitionAndResolver from "./patches/resolver";
import patchStatusBar from "./patches/statusBar";
import patchStorage from "./patches/storage";
import { ColorManifest } from "./types";
import { _colorRef, updateBunnyColor } from "./updater";

/** @internal */
export default function initColors(manifest: ColorManifest | null) {
    const patches: Array<() => unknown> = [];
    const unpatch = () => {
        _colorRef.current = null;
        for (const patch of patches.reverse()) patch();
    };

    try {
        patches.push(patchStorage());
        patches.push(patchDefinitionAndResolver());
        patches.push(patchChatBackground());
        patches.push(patchStatusBar());
        if (manifest) updateBunnyColor(manifest, { update: false });
        return unpatch;
    } catch (error) {
        unpatch();
        throw error;
    }
}
