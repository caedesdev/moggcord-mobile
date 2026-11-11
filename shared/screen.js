import logo from "../runtime/src/assets/icons/moggcord.png";
import { uiIcons } from "./icons.js";
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
    content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 28, width: "100%", maxWidth: 680, alignSelf: "center" },
    row: { flexDirection: "row", alignItems: "center" },
    between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    grow: { flex: 1, minWidth: 0 },
    brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 27 },
    logo: { width: 44, height: 44, marginRight: 12, resizeMode: "contain" },
    brandSeparator: { height: 26, width: 1, backgroundColor: color.border, marginRight: 12 },
    brand: { color: color.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
    eyebrow: { color: color.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.35 },
    dockSafe: { backgroundColor: color.background, paddingTop: 6 },
    dock: { flexDirection: "row", borderRadius: 22, backgroundColor: color.panel, borderWidth: 1,
      borderColor: color.border, padding: 4, marginBottom: 8, maxWidth: 680, width: "94%", alignSelf: "center" },
    tab: { flex: 1, minWidth: 0, minHeight: 61, justifyContent: "center", alignItems: "center", paddingHorizontal: 2, borderRadius: 16 },
    tabText: { color: color.muted, fontSize: 11, fontWeight: "600", marginTop: 5 },
    selectedTab: { backgroundColor: color.primary + "28" },
    selectedTabText: { color: color.accent },
    heading: { color: color.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.7 },
    label: { color: color.text, fontSize: 15, fontWeight: "600" },
    text: { color: color.muted, fontSize: 13, lineHeight: 19 },
    caption: { color: color.muted, fontSize: 11, lineHeight: 16 },
    intro: { marginBottom: 15 },
    panel: { backgroundColor: color.panel, borderRadius: 18, borderWidth: 1, borderColor: color.border, marginBottom: 14, overflow: "hidden" },
    padded: { padding: 16 },
    divider: { borderTopWidth: 1, borderTopColor: color.border },
    tile: { width: 36, height: 36, marginRight: 11, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: color.accent + "12" },
    badge: { borderRadius: 7, backgroundColor: color.accent + "1a", paddingHorizontal: 7, paddingVertical: 4 },
    badgeText: { color: color.accent, fontSize: 10, fontWeight: "600" },
    button: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: color.border },
    buttonText: { color: color.text, fontWeight: "600", fontSize: 12 },
    primary: { backgroundColor: color.primary, borderColor: color.primary },
    primaryText: { color: color.onPrimary },
    overview: { marginBottom: 16 },
    hero: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 14,
      columnGap: 10, minHeight: 103, padding: 18, backgroundColor: color.primary, borderColor: color.accent + "80", borderRadius: 20, borderWidth: 1,
      overflow: "hidden", marginBottom: 14 },
    heroStripe: { position: "absolute", right: -45, top: -60, width: 110, height: 260, backgroundColor: "#ffffff0b", transform: [{ rotate: "43deg" }] },
    heroSummary: { flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 0 },
    heroDivider: { width: 1, height: 34, backgroundColor: "#ffffff4d", marginHorizontal: 13 },
    heroCount: { color: "#ffffff", fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
    heroButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 13,
      paddingVertical: 10, borderRadius: 13, backgroundColor: "#ffffff" },
    heroButtonText: { color: "#102047", fontSize: 12, fontWeight: "700", marginRight: 8 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 3 },
    homeTile: { width: "48.2%", minHeight: 121, padding: 16, borderRadius: 18, backgroundColor: color.panel,
      borderWidth: 1, borderColor: color.border, marginBottom: 13, overflow: "hidden" },
    homeTileTitle: { color: color.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.3, marginTop: 15 },
    homeTileCaption: { color: color.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    homeLink: { flexDirection: "row", alignItems: "center", minHeight: 72, padding: 16, borderRadius: 18,
      borderWidth: 1, borderColor: color.border, backgroundColor: color.panel, marginBottom: 13 },
    homeLinkIcon: { paddingRight: 14, marginRight: 14, borderRightWidth: 1, borderRightColor: color.border },
    homeLinkLabel: { color: color.text, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
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
    const scrollRef = React.useRef(null);
    const settingsTarget = React.useRef("");
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

    function go(next, target = "") {
      setNotice("");
      settingsTarget.current = target;
      if (next === "Settings" && target === "backup") setBackupOpen(true);
      setTab(next);
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    }

    function sectionLayout(id) {
      return event => {
        if (settingsTarget.current !== id) return;
        settingsTarget.current = "";
        scrollRef.current?.scrollTo?.({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
      };
    }

    function icon(name, size = 24, tint = color.text) {
      return h(Image, { source: { uri: uiIcons[name] || uiIcons.plugins }, accessible: false,
        style: { width: size, height: size, tintColor: tint, resizeMode: "contain", flexShrink: 0 } });
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
      const name = { BK: "backup", CT: "clock", CO: "community", ST: "status", MC: "external" }[mark] || mark;
      return h(View, { style: s.tile, accessible: false }, icon(name, 21, color.accent));
    }

    function heading(title, description) {
      return h(View, { style: s.intro },
        h(Text, { style: s.heading, accessibilityRole: "header" }, title),
        description ? h(Text, { style: [s.text, { marginTop: 3 }] }, description) : null);
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
        update ? h(View, { style: [s.panel, s.padded], onLayout: sectionLayout("updates"), testID: "settings-updates" },
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
        h(View, { onLayout: sectionLayout("appearance"), testID: "settings-appearance" },
          h(Text, { style: [s.eyebrow, { marginBottom: 8 }] }, "APPEARANCE"),
          h(View, { style: s.panel }, Object.entries(palettes).map(([id, palette], index) =>
          h(Pressable, {
            key: id, disabled: !ready,
            onPress: () => void apply({ ...preferencesRef.current, palette: id }, palette.name + " selected."),
            accessibilityRole: "button", accessibilityState: { selected: preferences.palette === id, disabled: !ready },
            style: ({ pressed }) => [s.row, s.padded, index > 0 && s.divider, pressed && s.pressed]
          }, h(View, { style: [s.swatch, { backgroundColor: palette.primary }] }),
          h(Text, { style: [s.label, s.grow] }, palette.name),
          preferences.palette === id ? badge("Selected") : null)))),
        h(View, { style: s.panel, onLayout: sectionLayout("backup"), testID: "settings-backup" }, actionRow("BK", "Backup & Restore", "Color, saved items and plugin switches.", () => setBackupOpen(value => !value), {
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
            }, { primary: true, filter: true, disabled: !ready || !backup.trim() }))) : null),
        h(View, { style: s.panel }, actionRow("ST", "Service status", "Moggcord services", () => void open(origin + "/status"), { trailing: "↗" })));
    }

    function homeView() {
      const count = state.plugins.filter(plugin => plugin.enabled).length;

      function homeTile(name, title, description, onPress) {
        return h(Pressable, { key: name, onPress, accessibilityRole: "button", accessibilityLabel: title,
          accessibilityHint: description, testID: "home-" + name,
          style: ({ pressed }) => [s.homeTile, pressed && s.pressed] },
          h(View, { style: s.between }, icon(name, 25), icon("arrow", 17, color.muted)),
          h(Text, { style: s.homeTileTitle }, title),
          h(Text, { style: s.homeTileCaption }, description));
      }

      function homeLink(name, label, description, onPress, external = false) {
        return h(Pressable, { onPress, accessibilityRole: external ? "link" : "button", accessibilityLabel: label,
          accessibilityHint: description || undefined, testID: "home-" + name,
          style: ({ pressed }) => [s.homeLink, pressed && s.pressed] },
          h(View, { style: s.homeLinkIcon }, icon(name, 26)),
          h(View, { style: s.grow }, h(Text, { style: s.homeLinkLabel }, label),
            description ? h(Text, { style: [s.caption, { marginTop: 3 }] }, description) : null),
          h(View, { style: { marginLeft: 9 } }, icon(external ? "external" : "arrow", 18, color.muted)));
      }

      const update = state.updater;
      const updateLabel = update?.phase === "available" ? "Update available"
        : update?.phase === "pending" ? "Update ready" : "Check for updates";
      const updateDescription = update?.phase === "available" ? "Version " + update.availableVersion
        : update?.phase === "pending" ? "Restart to apply" : "Get the latest version of Moggcord";
      return h(React.Fragment, null,
        h(Text, { style: [s.heading, s.overview], accessibilityRole: "header" }, "Overview"),
        h(View, { style: s.hero },
          h(View, { style: s.heroStripe, pointerEvents: "none", accessible: false }),
          h(View, { style: s.heroSummary }, icon("plugins", 29, "#ffffff"),
            h(View, { style: s.heroDivider }),
            h(Text, { style: s.heroCount, testID: "home-enabled-count", accessibilityLiveRegion: "polite" }, ready ? count + " enabled" : "Loading…")),
          h(Pressable, { onPress: () => go("Plugins"), accessibilityRole: "button", accessibilityLabel: "Browse plugins",
            style: ({ pressed }) => [s.heroButton, pressed && s.pressed] },
            h(Text, { style: s.heroButtonText }, "Browse plugins"), icon("arrow", 17, "#102047"))),
        h(View, { style: s.grid },
          homeTile("plugins", "Plugins", "Manage your plugins", () => go("Plugins")),
          homeTile("community", "Community", ready ? preferences.saved.length + " saved" : "Loading…", () => go("Community")),
          homeTile("appearance", "Appearance", "Choose a color palette", () => go("Settings", "appearance")),
          homeTile("backup", "Backup", "Back up or restore", () => go("Settings", "backup"))),
        state.callStarted == null ? null : h(View, { style: s.panel },
          actionRow("CT", "Call Timer", "Current call · " + duration(state.callStarted, time), () => go("Plugins"))),
        homeLink("update", updateLabel, updateDescription, () => {
          go("Settings", "updates");
          if (update?.supported) void runtime.checkForUpdates();
        }),
        homeLink("external", "moggcord.cc", "", () => void open(origin), true));
    }

    const content = tab === "Plugins" ? pluginView() : tab === "Community" ? communityView()
      : tab === "Settings" ? settingsView() : homeView();
    return h(View, { style: s.page },
      h(ScrollView, { ref: scrollRef, style: s.page, contentContainerStyle: s.content, keyboardShouldPersistTaps: "handled", keyboardDismissMode: "on-drag" },
        h(View, { style: s.brandRow },
          h(Image, { source: { uri: logo }, style: s.logo, accessibilityIgnoresInvertColors: true, accessible: false }),
          h(View, { style: s.brandSeparator }),
          h(View, { style: [s.grow, { marginRight: 8 }] },
            h(Text, { style: s.brand, numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8 }, "Moggcord Mobile")),
          badge("v" + MOGGCORD_MOBILE_VERSION)),
        notice ? h(View, { style: [s.panel, s.padded] }, h(Text, { style: s.text, accessibilityLiveRegion: "polite" }, notice)) : null,
        content),
      h(RN.SafeAreaView || View, { style: s.dockSafe },
        h(View, { style: s.dock, accessibilityRole: "tablist" }, tabs.map(name => h(Pressable, {
          key: name, onPress: () => go(name), accessibilityRole: "tab", accessibilityLabel: name, accessibilityState: { selected: name === tab },
          testID: "nav-" + name.toLowerCase(), style: ({ pressed }) => [s.tab, pressed && s.pressed]
        }, icon(name.toLowerCase(), 23, name === tab ? color.accent : color.muted),
        h(Text, { numberOfLines: 1, style: [s.tabText, name === tab && s.selectedTabText] }, name))))),
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
