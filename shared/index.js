import { createMobileScreen } from "./screen.js";
import { createPluginRuntime } from "./plugins.js";
import { createPreferenceStore, findNativeStorage } from "./preferences.js";
import { createSettingsAdapter, observeMetro } from "./settings.js";

const marker = "__MOGGCORD_MOBILE__";
const report = error => console.warn("[Moggcord Mobile]", error instanceof Error ? error.message : "Mobile setup failed");
if (!globalThis[marker]) {
  try {
    let native;
    const runtime = createPluginRuntime(report);
    const preferences = createPreferenceStore(() => findNativeStorage(native));
    const settings = createSettingsAdapter(
      (react, rn) => createMobileScreen(react, rn, preferences, runtime),
      report,
      rn => {
        native = rn;
        void preferences.load().then(value => runtime.setEnabled(value.enabledPlugins)).catch(report);
      }
    );
    if (observeMetro(globalThis, module => {
      settings(module);
      runtime.observe(module);
    }, report)) {
      Object.defineProperty(globalThis, marker, { value: MOGGCORD_MOBILE_VERSION, configurable: true });
    }
  } catch (error) {
    report(error);
  }
}
