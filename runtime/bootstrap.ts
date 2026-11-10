if (!globalThis.__MOGGCORD_MOBILE__) {
    globalThis.__MOGGCORD_MOBILE__ = MOGGCORD_MOBILE_VERSION;
    globalThis.__vendetta_loader = { name: "Moggcord Mobile", features: {} };
    require("./src/entry");
}
