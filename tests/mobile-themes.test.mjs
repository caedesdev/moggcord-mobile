import assert from "node:assert/strict";
import test from "node:test";
import { nativeModule } from "./native-host.mjs";

const chroma = Object.assign(color => ({ hex: () => color.toLowerCase(), alpha: opacity => ({
  hex: () => color.slice(0, 7).toLowerCase() + Math.round(opacity * 255).toString(16).padStart(2, "0")
}) }), { valid: color => /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color) });

const { mobileColorManifest } = await nativeModule("runtime/src/lib/addons/themes/colors/mobile-manifest.ts", {
  "chroma-js": chroma
});
const theme = {
  name: "Example",
  semanticColors: { TEXT_DEFAULT: ["#AABBCC", "#112233"], TEXT_MUTED: [null], OTHER: "bad",
    CONTROL_PRIMARY_TEXT_DEFAULT: ["#ffffff"] },
  rawColors: { BRAND_360: "#AABBCC", PRIMARY_300: {}, "__constructor__": "#aaeecc" },
  background: { url: "https://example.invalid/large-image", blur: 100 },
  code: "must never be retained"
};

test("mobile theme normalization accepts real legacy colors and safe modern palette references", () => {
  const legacy = JSON.parse(JSON.stringify(mobileColorManifest(theme)));
  assert.equal(legacy.spec, 2);
  assert.deepEqual(legacy.semanticColors, {
    TEXT_DEFAULT: ["#aabbcc", "#112233"],
    CONTROL_PRIMARY_TEXT_DEFAULT: ["#ffffff", "#ffffff"]
  });
  assert.deepEqual(legacy.rawColors, { BRAND_360: "#aabbcc" });
  assert(!("background" in legacy) && !("code" in legacy));
  const modern = mobileColorManifest({
    spec: 3, type: "color", display: { name: "Modern" },
    main: { raw: { ACCENT: "#abcdef" }, semantic: {
      TEXT_DEFAULT: { type: "raw", value: "ACCENT", opacity: .5 },
      TEXT_MUTED: { type: "raw", value: "ACCENT", opacity: -10 }
    } }
  });
  assert.equal(modern.semanticColors.TEXT_DEFAULT[0], "#abcdef80");
  assert.equal(modern.semanticColors.TEXT_MUTED, undefined);
  assert.equal(mobileColorManifest({ name: "Invalid", rawColors: { TEXT_DEFAULT: { value: "#abcdef" } } }), null);
  assert.equal(mobileColorManifest({ spec: 3, type: "plugin", display: { name: "Code" }, main: {} }), null);
});

test("theme library uses published images and can preview the actual mobile colors without one", async () => {
  const { themePreviewPalette, previewImageUrl } = await nativeModule("runtime/src/plugins/themeLibrary/preview.ts", {});
  const { marketplacePreview } = await nativeModule("runtime/src/lib/addons/themes/marketplace.ts", {});
  assert.match(marketplacePreview("Pastel Blue"), /pastel-blue-1757164782881-preview\.png$/);
  assert.equal(marketplacePreview("Love Chunnibiyo"), undefined);
  const explicit = "https://themes.example/screenshots/theme.png";
  assert.equal(previewImageUrl(null, "file:///path", explicit, marketplacePreview("Pastel Blue")), explicit);
  assert.equal(previewImageUrl("https://user@themes.example/preview.png", "http://themes.example/preview.png"), undefined);
  const palette = themePreviewPalette({
    semanticColors: { CHAT_BACKGROUND: ["#fff4fa"], TEXT_DEFAULT: ["#332244"], BACKGROUND_BRAND: ["#9955aa"] },
    rawColors: { PRIMARY_700: "#dccedd", PRIMARY_660: "#edddea" }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(palette)), {
    chat: "#fff4fa", sidebar: "#dccedd", panel: "#edddea", text: "#332244", accent: "#9955aa"
  });
});

async function host(persisted, settings = {}) {
  const text = { darker: { raw: "BRAND_360", opacity: 1 }, light: { raw: "BRAND_360", opacity: 1 } };
  const icon = { darker: { raw: "BRAND_360", opacity: .5 } };
  const unknown = {};
  const resolver = { resolveSemanticColor: () => "#223344" };
  const tokens = {
    default: { meta: resolver }, RawColor: { BRAND_360: "#336699" },
    SemanticColor: { TEXT_DEFAULT: text, ICON_DEFAULT: icon },
    Theme: { DARKER: "darker", LIGHT: "light" }
  };
  const module = await nativeModule("runtime/src/lib/addons/themes/colors/mobile.ts", {
    "chroma-js": chroma,
    "@lib/api/native/modules": { NativeCacheModule: {
      getItem: async () => persisted.value,
      setItem: async (key, value) => {
        assert.equal(key, "cc.moggcord.mobile.theme.v1");
        persisted.value = value;
      }
    } },
    "@lib/api/patcher": { instead: (name, target, patch) => {
      const original = target[name];
      target[name] = (...args) => patch(args, original);
      return () => { target[name] = original; };
    } },
    "@lib/api/settings": { settings },
    "@metro": { findByProps: () => tokens },
    "./legacy": { legacyRawColor: () => undefined, legacySemanticColor: () => undefined },
    "./mobile-manifest": { mobileColorManifest }
  });
  return { module, resolver, tokens, text, icon, unknown };
}

test("a saved theme changes only recognized colors and preserves native theme values", async () => {
  const persisted = { value: '{"id":"sample","checking":false}' };
  const settings = {};
  const { module, resolver, tokens, text, icon, unknown } = await host(persisted, settings);
  const setup = await module.initMobileColors(id => id === "sample" ? theme : null);
  assert.equal(setup.selected, "sample");
  assert.equal(JSON.parse(persisted.value).checking, true);
  assert.equal(resolver.resolveSemanticColor("darker", text), "#aabbcc");
  assert.equal(resolver.resolveSemanticColor("light", text), "#112233");
  assert.equal(resolver.resolveSemanticColor("darker", icon), "#aabbcc80");
  assert.equal(resolver.resolveSemanticColor("darker", unknown), "#223344");
  assert.deepEqual(tokens.Theme, { DARKER: "darker", LIGHT: "light" });
  assert.deepEqual(tokens.RawColor, { BRAND_360: "#336699" });
  await module.confirmMobileTheme();
  assert.equal(JSON.parse(persisted.value).checking, false);
  settings.safeMode = { enabled: true };
  assert.equal(resolver.resolveSemanticColor("darker", text), "#223344");
  setup.dispose();
});

test("an interrupted theme startup restores default colors and confirmation cannot overwrite a new selection", async () => {
  const interrupted = { value: '{"id":"sample","checking":true}' };
  const recovered = await host(interrupted);
  const setup = await recovered.module.initMobileColors(() => theme);
  assert.equal(setup.selected, null);
  assert.equal(interrupted.value, "null");
  assert.equal(recovered.resolver.resolveSemanticColor("darker", recovered.text), "#223344");
  setup.dispose();

  const persisted = { value: '{"id":"sample","checking":false}' };
  const { module } = await host(persisted);
  await module.initMobileColors(() => theme);
  await Promise.all([module.saveMobileTheme("next"), module.confirmMobileTheme()]);
  assert.deepEqual(JSON.parse(persisted.value), { id: "next", checking: false });
});
