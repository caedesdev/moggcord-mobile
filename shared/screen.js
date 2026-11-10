import logo from "../runtime/src/assets/icons/moggcord.png";
import { bundledPluginId, libraryUrl, loadLibrary, origin } from "./community.js";
import { normalizePreferences, palettes, readBackup, toggleSaved } from "./preferences.js";

const tabs = ["Home", "Plugins", "Community", "Settings"];
const sections = [["plugin", "Plugins"], ["theme", "Themes"], ["saved", "Saved"]];
const emptyResults = { entries: [], total: 0, next: 0, error: "" };

function useResults(React, key, offset, retry, load) {
  const [value, setValue] = React.useState({ key: "", ...emptyResults, loading: false });
  React.useEffect(() => {
    if (!key) return;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let current = true;
    setValue(old => ({
      ...(offset > 0 && old.key === key ? old : emptyResults), key, error: "", loading: true
    }));
    const timeout = setTimeout(() => {
      current = false;
      controller?.abort();
      setValue(old => ({ ...old, loading: false, error: "The catalog took too long to respond." }));
    }, 10000);
    const timer = setTimeout(() => {
      load(controller?.signal).then(result => {
        if (!current) return;
        setValue(old => {
          const previous = offset > 0 && old.key === key ? old.entries : [];
          const seen = new Set(previous.map(entry => entry.id));
          return { ...result, key, entries: [...previous, ...result.entries.filter(entry => !seen.has(entry.id))],
            loading: false, error: "" };
        });
      }).catch(() => {
        if (current) setValue(old => ({ ...old, loading: false, error: "Could not load the catalog." }));
      }).finally(() => clearTimeout(timeout));
    }, offset ? 0 : 220);
    return () => {
      current = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller?.abort();
    };
  }, [key, offset, retry]);
  return value.key === key ? value : { ...emptyResults, loading: !!key };
}

function duration(started, now) {
  const seconds = Math.floor(Math.max(0, now - started) / 1000);
  const pad = value => String(value).padStart(2, "0");
  const minutes = Math.floor(seconds / 60);
  const clock = pad(minutes % 60) + ":" + pad(seconds % 60);
  return minutes >= 60 ? Math.floor(minutes / 60) + ":" + clock : clock;
}

function stylesFor(color) {
  return {
    page: { flex: 1, backgroundColor: color.background },
    content: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 36, width: "100%", maxWidth: 680, alignSelf: "center" },
    row: { flexDirection: "row", alignItems: "center" },
    between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    grow: { flex: 1, minWidth: 0 },
    logo: { width: 40, height: 40, marginRight: 11 },
    brand: { color: color.text, fontSize: 18, fontWeight: "700" },
    eyebrow: { color: color.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.35 },
    tabs: { flexDirection: "row", borderRadius: 14, backgroundColor: color.panel, padding: 4, marginTop: 16, marginBottom: 21 },
    tab: { flex: 1, minHeight: 39, justifyContent: "center", alignItems: "center", paddingHorizontal: 3, borderRadius: 10 },
    tabText: { color: color.muted, fontSize: 12, fontWeight: "600" },
    selectedTab: { backgroundColor: color.accent + "26" },
    selectedTabText: { color: color.accent },
    heading: { color: color.text, fontSize: 25, fontWeight: "700", letterSpacing: -0.6 },
    label: { color: color.text, fontSize: 15, fontWeight: "600" },
    text: { color: color.muted, fontSize: 13, lineHeight: 19 },
    caption: { color: color.muted, fontSize: 11, lineHeight: 16 },
    intro: { marginBottom: 15 },
    panel: { backgroundColor: color.panel, borderRadius: 16, borderWidth: 1, borderColor: color.border, marginBottom: 12, overflow: "hidden" },
    padded: { padding: 14 },
    divider: { borderTopWidth: 1, borderTopColor: color.border },
    feature: { padding: 17, borderTopWidth: 2, borderTopColor: color.accent },
    tile: { width: 36, height: 36, marginRight: 11, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: color.accent + "1c" },
    tileText: { color: color.accent, fontSize: 12, fontWeight: "700" },
    badge: { borderRadius: 7, backgroundColor: color.accent + "1a", paddingHorizontal: 7, paddingVertical: 4 },
    badgeText: { color: color.accent, fontSize: 10, fontWeight: "600" },
    button: { alignSelf: "flex-start", justifyContent: "center", minHeight: 42, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: color.border },
    buttonText: { color: color.text, fontWeight: "600", fontSize: 12 },
    primary: { backgroundColor: color.accent, borderColor: color.accent },
    primaryText: { color: color.background },
    filters: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
    filter: { marginRight: 6, marginBottom: 4, minHeight: 37 },
    input: { color: color.text, backgroundColor: color.panel, borderColor: color.border, borderWidth: 1, borderRadius: 12,
      minHeight: 45, paddingHorizontal: 13, paddingVertical: 9, fontSize: 14, marginBottom: 12 },
    swatch: { width: 25, height: 25, borderRadius: 8, marginRight: 12 },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.5 }
  };
}

export function createMobileScreen(React, RN, store, runtime) {
  const h = React.createElement;
  const { View, Text, Image, Pressable, ScrollView, TextInput, ActivityIndicator, Switch, Linking, Modal } = RN;

  function Screen() {
    const [tab, setTab] = React.useState("Home");
    const [pluginSettings, setPluginSettings] = React.useState(null);
    const [pluginLimit, setPluginLimit] = React.useState(30);
    const [search, setSearch] = React.useState("");
    const [section, setSection] = React.useState("plugin");
    const [communitySearch, setCommunitySearch] = React.useState("");
    const [retry, setRetry] = React.useState(0);
    const [preferences, setPreferences] = React.useState(normalizePreferences);
    const [ready, setReady] = React.useState(false);
    const [state, setState] = React.useState(() => runtime.snapshot());
    const [notice, setNotice] = React.useState("");
    const [backup, setBackup] = React.useState("");
    const [backupOpen, setBackupOpen] = React.useState(false);
    const [time, setTime] = React.useState(Date.now);
    const preferencesRef = React.useRef(preferences);
    const writeId = React.useRef(0);
    const color = palettes[preferences.palette];
    const s = React.useMemo(() => stylesFor(color), [color]);
    const community = tab === "Community" && section !== "saved";
    const requestKey = community ? JSON.stringify(["community", section, communitySearch]) : "";
    const results = useResults(React, requestKey, 0, retry, async signal =>
      ({ entries: await loadLibrary(section, communitySearch, { signal }), total: 0, next: 0 }));

    React.useEffect(() => {
      let mounted = true;
      const refresh = () => setState(runtime.snapshot());
      const unsubscribe = runtime.subscribe(refresh);
      refresh();
      store.load().then(value => {
        if (!mounted) return;
        const next = normalizePreferences({
          ...value, enabledPlugins: runtime.currentEnabled?.() ?? value.enabledPlugins
        });
        preferencesRef.current = next;
        setPreferences(next);
      }).catch(() => {
        if (mounted) setNotice("Could not load saved preferences.");
      }).finally(() => {
        if (mounted) setReady(true);
      });
      return () => { mounted = false; unsubscribe(); };
    }, []);

    React.useEffect(() => {
      if (state.callStarted == null || tab !== "Home" && tab !== "Plugins") return;
      setTime(Date.now());
      const timer = setInterval(() => setTime(Date.now()), 1000);
      return () => clearInterval(timer);
    }, [state.callStarted, tab]);

    async function apply(input, message = "", updatePlugins = false) {
      if (!ready) return;
      const current = ++writeId.current;
      const next = normalizePreferences(input);
      if (!updatePlugins) next.enabledPlugins = runtime.currentEnabled?.() ?? next.enabledPlugins;
      preferencesRef.current = next;
      setPreferences(next);
      setNotice("");
      try {
        if (updatePlugins) await runtime.setEnabled(next.enabledPlugins);
        await store.save(next);
        if (current === writeId.current) setNotice(store.persistent ? message : "Changes apply for this session.");
      } catch {
        if (current === writeId.current) setNotice("Preferences could not be saved.");
      }
    }

    function go(next) {
      setNotice("");
      setTab(next);
    }

    async function open(url) {
      try { await Linking.openURL(url); }
      catch { setNotice("Could not open this link."); }
    }

    function button(label, onPress, { selected = false, primary = false, disabled = false, filter = false, key = label, accessibilityLabel = label } = {}) {
      return h(Pressable, {
        key, onPress, disabled, accessibilityRole: "button", accessibilityLabel,
        accessibilityState: { selected, disabled },
        style: ({ pressed }) => [s.button, filter && s.filter, selected && s.selectedTab, primary && s.primary,
          pressed && s.pressed, disabled && s.disabled]
      }, h(Text, { style: [s.buttonText, selected && s.selectedTabText, primary && s.primaryText] }, label));
    }

    function badge(label) {
      return h(View, { style: s.badge }, h(Text, { style: s.badgeText }, label));
    }

    function tile(mark) {
      return h(View, { style: s.tile, accessible: false }, h(Text, { style: s.tileText }, mark));
    }

    function heading(title, description) {
      return h(View, { style: s.intro },
        h(Text, { style: s.heading, accessibilityRole: "header" }, title),
        h(Text, { style: [s.text, { marginTop: 3 }] }, description));
    }

    function searchBox(value, onChangeText, placeholder, testID) {
      return h(TextInput, {
        value, onChangeText, placeholder, placeholderTextColor: color.muted, accessibilityLabel: placeholder,
        clearButtonMode: "while-editing", autoCorrect: false, autoCapitalize: "none", returnKeyType: "search",
        maxLength: 100, style: s.input, testID
      });
    }

    function status(text) {
      return h(Text, { style: [s.caption, { marginVertical: 7 }] }, text);
    }

    function actionRow(mark, label, description, onPress, { key = label, divider = false, trailing = "›", selected } = {}) {
      return h(Pressable, {
        key, onPress, accessibilityRole: "button", accessibilityState: { selected },
        style: ({ pressed }) => [s.row, s.padded, divider && s.divider, pressed && s.pressed]
      }, tile(mark), h(View, { style: s.grow },
        h(Text, { style: s.label }, label), h(Text, { style: s.caption }, description)),
      h(Text, { style: [s.label, s.selectedTabText, { marginLeft: 10 }] }, trailing));
    }

    function changePlugin(plugin, enable) {
      const current = preferencesRef.current;
      const live = runtime.currentEnabled?.() ?? current.enabledPlugins;
      const enabledPlugins = enable ? [...live, plugin.id] : live.filter(id => id !== plugin.id);
      void apply({ ...current, enabledPlugins }, "", true);
    }

    function mobilePlugin(plugin, index) {
      const unavailable = !plugin.available && !plugin.enabled;
      const label = plugin.failed ? "Could not start" : plugin.active ? "Enabled" : plugin.available ? "Disabled" : "Waiting for Discord";
      return h(View, { key: plugin.id, style: [s.padded, index > 0 && s.divider] },
        h(View, { style: s.row },
          tile(plugin.mark),
          h(View, { style: [s.grow, { marginRight: 9 }] },
            h(Text, { style: s.label }, plugin.title),
            h(Text, { style: s.caption }, plugin.category + (plugin.experimental ? " · Experimental" : ""))),
          h(Switch, {
            value: plugin.enabled, onValueChange: value => changePlugin(plugin, value),
            disabled: !ready || unavailable || plugin.busy, accessibilityLabel: plugin.title, testID: "plugin-" + plugin.id,
            trackColor: { true: color.accent, false: color.border }, ios_backgroundColor: color.border
          })),
        h(Text, { style: [s.text, { marginTop: 8 }] }, plugin.description),
        h(View, { style: [s.row, { marginTop: 8, flexWrap: "wrap" }] },
          badge(label),
          plugin.active && plugin.id === "calltimer" && h(Text, { style: [s.caption, { marginLeft: 8 }] },
            state.callStarted == null ? "No active call" : duration(state.callStarted, time)),
          plugin.active && plugin.id === "fakedeafen" && h(Text, { style: [s.caption, { marginLeft: 8 }] }, state.fakeStatus)),
        plugin.hasSettings && h(View, { style: { marginTop: 10 } },
          button("Settings", () => {
            try { setPluginSettings(() => runtime.settingsComponent(plugin.id)); }
            catch { setNotice("Could not open this plugin's settings."); }
          })));
    }

    function pluginView() {
      const term = search.trim().toLowerCase();
      const plugins = state.plugins.filter(plugin => (plugin.title + " " + plugin.description + " " + plugin.category).toLowerCase().includes(term));
      return h(React.Fragment, null,
        heading("Plugins", "Find a plugin and make it yours."),
        searchBox(search, value => { setPluginLimit(30); setSearch(value); }, "Search plugins", "plugin-search"),
        plugins.length ? h(View, { style: s.panel }, plugins.slice(0, pluginLimit).map(mobilePlugin))
          : status("No plugins found."),
        pluginLimit < plugins.length ? button("Show more", () => setPluginLimit(value => value + 30)) : null);
    }

    function communityView() {
      const entries = section === "saved" ? preferences.saved : results.entries;
      return h(React.Fragment, null,
        heading("Community", "Browse uploads and save your favorites on this device."),
        h(View, { style: s.filters }, sections.map(([id, label]) =>
          button(label, () => { setCommunitySearch(""); setSection(id); }, { key: id, selected: id === section, filter: true }))),
        community ? searchBox(communitySearch, setCommunitySearch, "Search uploads", "community-search") : null,
        results.loading ? h(ActivityIndicator, { color: color.accent, accessibilityLabel: "Loading uploads" }) : null,
        results.error ? h(View, { style: [s.panel, s.padded] }, status(results.error), button("Try again", () => setRetry(value => value + 1))) : null,
        entries.map(entry => {
          const saved = preferences.saved.some(item => item.id === entry.id);
          const bundledId = bundledPluginId(entry);
          const plugin = bundledId && state.plugins.find(item => item.id === bundledId);
          const canEnable = plugin && plugin.available && !plugin.enabled;
          return h(View, { key: entry.id, style: [s.panel, s.padded] },
            h(View, { style: s.between },
              h(View, { style: [s.grow, { marginRight: 8 }] },
                h(Text, { style: s.label }, entry.name),
                h(Text, { style: s.caption }, [entry.kind === "theme" ? "Theme" : "Plugin", entry.version, entry.author].filter(Boolean).join(" · "))),
              button(saved ? "Saved" : "Save", () => void apply(toggleSaved(preferencesRef.current, entry)), {
                selected: saved, disabled: !ready, accessibilityLabel: (saved ? "Remove " : "Save ") + entry.name
              })),
            entry.description ? h(Text, { style: [s.text, { marginTop: 8 }], numberOfLines: 4 }, entry.description) : null,
            h(View, { style: [s.filters, { marginTop: 10 }] },
              plugin ? button(canEnable ? "Enable mobile plugin" : "View mobile plugin", () => {
                setPluginLimit(30);
                setSearch(plugin.title);
                go("Plugins");
                if (canEnable) changePlugin(plugin, true);
              }, { primary: true, filter: true, disabled: !ready || plugin.busy }) : null,
              button("View upload ↗", () => void open(libraryUrl(entry.kind, entry.name)), { filter: true })));
        }),
        !entries.length && !results.loading && !results.error
          ? status(section === "saved" ? "Your saved uploads will appear here." : "No uploads found.") : null);
    }

    function settingsView() {
      const update = state.updater;
      const updating = update && ["checking", "downloading", "restarting"].includes(update.phase);
      return h(React.Fragment, null,
        heading("Settings", "Personalize Moggcord and back up your preferences."),
        update ? h(View, { style: [s.panel, s.padded] },
          h(View, { style: s.between }, h(Text, { style: s.label }, "Moggcord updates"), badge("v" + update.version)),
          h(Text, { style: [s.text, { marginTop: 8 }], accessibilityLiveRegion: "polite" }, update.message),
          update.recoveryNotice ? h(Text, { style: [s.caption, { marginTop: 8 }] }, update.recoveryNotice) : null,
          updating ? h(ActivityIndicator, { color: color.accent, style: { marginTop: 12 } }) : null,
          h(View, { style: [s.filters, { marginTop: 12 }] },
            update.supported ? button("Check for updates", () => void runtime.checkForUpdates(), {
              filter: true, disabled: updating || update.phase === "pending"
            }) : button("Downloads ↗", () => void open(origin + "/#download"), { filter: true }),
            update.phase === "available" ? button("Update and restart", () => void runtime.installUpdate(), { primary: true, filter: true }) : null,
            update.phase === "pending" ? button("Restart now", () => void runtime.restartApp(), { primary: true, filter: true }) : null)) : null,
        h(Text, { style: [s.eyebrow, { marginBottom: 8 }] }, "APPEARANCE"),
        h(View, { style: s.panel }, Object.entries(palettes).map(([id, palette], index) =>
          h(Pressable, {
            key: id, disabled: !ready,
            onPress: () => void apply({ ...preferencesRef.current, palette: id }, palette.name + " selected."),
            accessibilityRole: "button", accessibilityState: { selected: preferences.palette === id, disabled: !ready },
            style: ({ pressed }) => [s.row, s.padded, index > 0 && s.divider, pressed && s.pressed]
          }, h(View, { style: [s.swatch, { backgroundColor: palette.accent }] }),
          h(Text, { style: [s.label, s.grow] }, palette.name),
          preferences.palette === id ? badge("Selected") : null))),
        h(View, { style: s.panel }, actionRow("BK", "Backup & Restore", "Color, saved items and plugin switches.", () => setBackupOpen(value => !value), {
          trailing: backupOpen ? "⌄" : "›"
        }),
        backupOpen ? h(View, { style: [s.padded, s.divider] },
          h(TextInput, {
            style: [s.input, { minHeight: 118, textAlignVertical: "top" }], value: backup, onChangeText: setBackup,
            multiline: true, maxLength: 65536, autoCapitalize: "none", autoCorrect: false, placeholder: "Paste your mobile backup",
            placeholderTextColor: color.muted, accessibilityLabel: "Moggcord Mobile backup JSON"
          }),
          h(View, { style: s.filters },
            button("Show backup", () => setBackup(JSON.stringify(preferencesRef.current, null, 2)), { filter: true, disabled: !ready }),
            button("Restore", () => {
              try { void apply(readBackup(backup), "Mobile settings restored.", true); }
              catch { setNotice("Choose valid Moggcord Mobile backup JSON."); }
            }, { primary: true, filter: true, disabled: !ready || !backup.trim() }))) : null));
    }

    function homeView() {
      const count = state.plugins.filter(plugin => plugin.active).length;
      return h(React.Fragment, null,
        heading("Your setup", "Plugins, community uploads and appearance in one place."),
        h(View, { style: [s.panel, s.feature] },
          h(View, { style: s.between },
            h(Text, { style: s.eyebrow }, "PLUGIN LIBRARY"), badge(count + " enabled")),
          h(Text, { style: [s.heading, { fontSize: 22, marginTop: 7 }] }, "Make Discord yours"),
          h(Text, { style: [s.text, { marginTop: 4 }] }, "Your plugins, ready to switch on."),
          h(View, { style: { marginTop: 12 } }, button("Browse plugins", () => go("Plugins"), { primary: true }))),
        state.callStarted == null ? null : h(View, { style: s.panel },
          actionRow("CT", "Call Timer", "Current call · " + duration(state.callStarted, time), () => go("Plugins"))),
        h(Text, { style: [s.eyebrow, { marginBottom: 8 }] }, "QUICK LINKS"),
        h(View, { style: s.panel },
          actionRow("CO", "Community", preferences.saved.length + " saved uploads", () => go("Community")),
          actionRow("ST", "Service status", "Moggcord services", () => void open(origin + "/status"), { divider: true, trailing: "↗" }),
          actionRow("MC", "Website", "moggcord.cc", () => void open(origin), { divider: true, trailing: "↗" })));
    }

    const content = tab === "Plugins" ? pluginView() : tab === "Community" ? communityView()
      : tab === "Settings" ? settingsView() : homeView();
    return h(ScrollView, { style: s.page, contentContainerStyle: s.content, keyboardShouldPersistTaps: "handled" },
      h(View, { style: s.row },
        h(Image, { source: { uri: logo }, style: s.logo, accessibilityIgnoresInvertColors: true }),
        h(View, { style: s.grow },
          h(Text, { style: s.eyebrow }, "MOGGCORD"),
          h(Text, { style: s.brand, accessibilityRole: "header" }, "Mobile client")),
        badge("v" + MOGGCORD_MOBILE_VERSION)),
      h(View, { style: s.tabs }, tabs.map(name => h(Pressable, {
        key: name, onPress: () => go(name), accessibilityRole: "tab", accessibilityState: { selected: name === tab },
        style: ({ pressed }) => [s.tab, name === tab && s.selectedTab, pressed && s.pressed]
      }, h(Text, { numberOfLines: 1, style: [s.tabText, name === tab && s.selectedTabText] }, name)))),
      notice ? h(View, { style: [s.panel, s.padded] }, h(Text, { style: s.text, accessibilityLiveRegion: "polite" }, notice)) : null,
      content,
      pluginSettings && Modal ? h(Modal, {
        visible: true, animationType: "slide", presentationStyle: "pageSheet", onRequestClose: () => setPluginSettings(null)
      }, h(View, { style: s.page },
        h(View, { style: [s.between, s.padded] }, h(Text, { style: s.label }, "Plugin settings"),
          button("Done", () => setPluginSettings(null))),
        h(pluginSettings))) : null);
  }

  class ScreenBoundary extends React.Component {
    state = { failed: false };

    static getDerivedStateFromError() {
      return { failed: true };
    }

    render() {
      return this.state.failed
        ? h(View, { style: { flex: 1, padding: 18, backgroundColor: palettes.midnight.background } },
          h(Text, { accessibilityRole: "alert", style: { color: palettes.midnight.text } }, "Moggcord settings could not open in this Discord build."))
        : h(Screen);
    }
  }
  return ScreenBoundary;
}
