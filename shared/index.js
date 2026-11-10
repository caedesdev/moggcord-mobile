import { createMobileScreen } from "./screen.js";
import { createSettingsAdapter, observeMetro } from "./settings.js";

const marker = "__MOGGCORD_MOBILE__";
const report = error => console.warn("[Moggcord Mobile]", error instanceof Error ? error.message : "Mobile setup failed");
if (!globalThis[marker]) {
  try {
    const observe = createSettingsAdapter(createMobileScreen, report);
    if (observeMetro(globalThis, observe, report)) {
      Object.defineProperty(globalThis, marker, { value: MOGGCORD_MOBILE_VERSION, configurable: true });
    }
  } catch (error) {
    report(error);
  }
}
