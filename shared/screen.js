import logo from "./assets/moggcord.png";
import { libraryUrl, loadLibrary, origin } from "./community.js";
import { createPreferenceStore, normalizePreferences, palettes, readBackup, toggleSaved } from "./preferences.js";

const tabs = ["Home", "Community", "Appearance", "Backup"];
const sections = [["plugin", "Plugins"], ["theme", "Themes"], ["saved", "Saved"]];

function nativeStorage(RN) {
  for (const name of ["NativeCacheModule", "MMKVManager"]) {
    try {
      const storage = RN.TurboModuleRegistry?.get?.(name) ?? RN.NativeModules?.[name];
      if (typeof storage?.getItem === "function" && typeof storage.setItem === "function") return storage;
    } catch {
      // Optional Discord storage modules vary between builds.
    }
  }
  return null;
}

function stylesFor(color) {
  return {
    page: { flex: 1, backgroundColor: color.background },
    content: { padding: 18, paddingBottom: 36, maxWidth: 680, alignSelf: "center", width: "100%" },
    hero: { padding: 18, marginBottom: 16, borderWidth: 1, borderColor: color.border, backgroundColor: color.panel, borderRadius: 20 },
    card: { padding: 14, marginBottom: 10, borderWidth: 1, borderColor: color.border, borderRadius: 14, backgroundColor: color.panel },
    row: { flexDirection: "row", alignItems: "center" },
    between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tabBar: { flexDirection: "row", flexWrap: "wrap", marginBottom: 13 },
    mark: { width: 46, height: 46, marginRight: 12 },
    overline: { color: color.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
    title: { color: color.text, fontSize: 25, fontWeight: "800", marginTop: 3 },
    label: { color: color.text, fontSize: 15, fontWeight: "700" },
    text: { color: color.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
    chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, borderColor: color.border, borderWidth: 1, marginRight: 6, marginBottom: 6 },
    activeChip: { backgroundColor: color.accent, borderColor: color.accent },
    chipText: { color: color.text, fontWeight: "600", fontSize: 12 },
    activeText: { color: color.background },
    input: { color: color.text, borderColor: color.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
    swatch: { width: 22, height: 22, borderRadius: 11, marginRight: 10 }
  };
}

export function createMobileScreen(React, RN) {
  const h = React.createElement;
  const { View, Text, Image, Pressable, ScrollView, TextInput, ActivityIndicator, Linking } = RN;
  const preferencesStore = createPreferenceStore(() => nativeStorage(RN));

  function Screen() {
    const [tab, setTab] = React.useState("Home");
    const [section, setSection] = React.useState("plugin");
    const [preferences, setPreferences] = React.useState(normalizePreferences);
    const [ready, setReady] = React.useState(false);
    const [notice, setNotice] = React.useState("");
    const [draft, setDraft] = React.useState("");
    const [search, setSearch] = React.useState("");
    const [backup, setBackup] = React.useState("");
    const [library, setLibrary] = React.useState({ entries: [], loading: false, error: "" });
    const [retry, setRetry] = React.useState(0);
    const preferenceRef = React.useRef(preferences);
    const writeId = React.useRef(0);
    const color = palettes[preferences.palette];
    const style = stylesFor(color);

    React.useEffect(() => {
      let active = true;
      preferencesStore.load().then(value => {
        if (!active) return;
        preferenceRef.current = value;
        setPreferences(value);
      }).catch(() => { if (active) setNotice("Could not read saved mobile preferences."); })
        .finally(() => { if (active) setReady(true); });
      return () => { active = false; };
    }, []);

    React.useEffect(() => {
      if (tab !== "Community" || section === "saved") return;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let active = true;
      setLibrary({ entries: [], loading: true, error: "" });
      const timer = setTimeout(() => {
        if (!active) return;
        active = false;
        controller?.abort();
        setLibrary({ entries: [], loading: false, error: "The community library did not respond." });
      }, 10000);
      loadLibrary(section, search, { signal: controller?.signal }).then(entries => {
        if (active) setLibrary({ entries, loading: false, error: "" });
      }).catch(() => {
        if (active) setLibrary({ entries: [], loading: false, error: "Could not load the community library." });
      }).finally(() => clearTimeout(timer));
      return () => { active = false; clearTimeout(timer); controller?.abort(); };
    }, [tab, section, search, retry]);

    async function apply(next, message) {
      if (!ready) return;
      const current = ++writeId.current;
      preferenceRef.current = next;
      setPreferences(next);
      setNotice("");
      try {
        await preferencesStore.save(next);
        if (current === writeId.current) setNotice(preferencesStore.persistent ? message : "Changed for this session. Persistent storage is unavailable.");
      } catch {
        if (current === writeId.current) setNotice("Could not save this change. You can export a backup.");
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

    function chip(label, action, { selected = false, key = label, disabled = false, accessibleLabel = label } = {}) {
      return h(Pressable, {
        key, onPress: action, disabled, accessibilityRole: "button", accessibilityLabel: accessibleLabel,
        accessibilityState: { selected, disabled }, style: [style.chip, selected && style.activeChip, disabled && { opacity: 0.5 }]
      }, h(Text, { style: [style.chipText, selected && style.activeText] }, label));
    }

    function heading(label, description) {
      return h(View, { style: { marginBottom: 12 } },
        h(Text, { style: style.label, accessibilityRole: "header" }, label),
        h(Text, { style: style.text }, description)
      );
    }

    function entryCard(entry) {
      const selected = preferences.saved.some(item => item.id === entry.id);
      return h(View, { key: entry.id, style: style.card },
        h(View, { style: style.between },
          h(Text, { style: [style.label, { flex: 1, marginRight: 10 }], numberOfLines: 2 }, entry.name),
          chip(selected ? "★ Saved" : "☆ Save", () => void apply(toggleSaved(preferenceRef.current, entry), selected ? "Removed from Saved." : "Added to Saved."), {
            selected, disabled: !ready, accessibleLabel: (selected ? "Remove " : "Save ") + entry.name
          })
        ),
        h(Text, { style: style.text }, [entry.kind === "theme" ? "Theme" : "Plugin", entry.version, entry.author].filter(Boolean).join(" · ")),
        entry.description ? h(Text, { style: style.text, numberOfLines: 4 }, entry.description) : null,
        h(View, { style: [style.row, { marginTop: 10 }] },
          chip("View on Moggcord ↗", () => void open(libraryUrl(entry.kind, entry.name)))
        )
      );
    }

    let content;
    if (tab === "Community") {
      const entries = section === "saved" ? preferences.saved : library.entries;
      content = h(React.Fragment, null,
        heading("Community library", "Browse uploads from moggcord.cc and save your favorites on this device."),
        h(View, { style: style.tabBar }, sections.map(([key, label]) => chip(label, () => { setDraft(""); setSearch(""); setSection(key); }, { key, selected: section === key }))),
        section !== "saved" && h(View, { style: style.row },
          h(TextInput, {
            style: [style.input, { flex: 1, marginRight: 8 }], value: draft, onChangeText: setDraft,
            maxLength: 100, placeholder: "Search " + (section === "theme" ? "themes" : "plugins"),
            placeholderTextColor: color.muted, accessibilityLabel: "Search community uploads",
            returnKeyType: "search", onSubmitEditing: () => setSearch(draft)
          }),
          chip("Search", () => setSearch(draft))
        ),
        section !== "saved" && library.loading
          ? h(ActivityIndicator, { color: color.accent, accessibilityLabel: "Loading uploads" })
          : section !== "saved" && library.error
            ? h(View, { style: style.card },
              h(Text, { style: style.text, accessibilityRole: "alert" }, library.error),
              h(View, { style: style.row }, chip("Try again", () => setRetry(value => value + 1))))
            : entries.length
              ? entries.map(entryCard)
              : h(Text, { style: style.text }, section === "saved" ? "Your saved uploads will appear here." : "No uploads found."),
        h(Text, { style: style.text }, "Community uploads open on the website. Desktop packages require their desktop client.")
      );
    } else if (tab === "Appearance") {
      content = h(React.Fragment, null,
        heading("Color profiles", "Choose the look of your Moggcord settings."),
        Object.entries(palettes).map(([id, palette]) => h(View, { key: id, style: [style.card, style.between] },
          h(View, { style: style.row },
            h(View, { style: [style.swatch, { backgroundColor: palette.accent }] }),
            h(Text, { style: style.label }, palette.name)),
          chip(preferences.palette === id ? "Selected" : "Use", () => void apply({ ...preferenceRef.current, palette: id }, palette.name + " selected."),
            { selected: preferences.palette === id, disabled: !ready, accessibleLabel: "Use " + palette.name + " color profile" })
        ))
      );
    } else if (tab === "Backup") {
      content = h(React.Fragment, null,
        heading("Backup & Restore", "Copy your mobile color profile and favorites as JSON. Paste a Moggcord Mobile backup below to restore them."),
        h(TextInput, {
          style: [style.input, { minHeight: 122, textAlignVertical: "top" }], value: backup, onChangeText: setBackup, multiline: true,
          maxLength: 65536, autoCapitalize: "none", autoCorrect: false, placeholder: "Paste your backup here",
          placeholderTextColor: color.muted, accessibilityLabel: "Moggcord Mobile backup JSON"
        }),
        h(View, { style: style.tabBar },
          chip("Show my backup", () => setBackup(JSON.stringify(preferenceRef.current, null, 2)), { disabled: !ready }),
          chip("Restore", () => {
            try { void apply(readBackup(backup), "Mobile settings restored."); }
            catch { setNotice("Choose valid Moggcord Mobile backup JSON."); }
          }, { disabled: !ready || !backup.trim() })
        )
      );
    } else {
      content = h(React.Fragment, null,
        heading("Quick actions", "Your Moggcord library, appearance and service status."),
        h(View, { style: style.card },
          h(View, { style: style.tabBar },
            chip("Community plugins", () => { setSection("plugin"); go("Community"); }),
            chip("Community themes", () => { setSection("theme"); go("Community"); }),
            chip("Status ↗", () => void open(origin + "/status")),
            chip("Website ↗", () => void open(origin))
          ),
          h(Text, { style: style.text }, ready ? `${preferences.saved.length} saved · ${palettes[preferences.palette].name}` : "Loading mobile preferences…")
        )
      );
    }

    return h(ScrollView, { style: style.page, contentContainerStyle: style.content, keyboardShouldPersistTaps: "handled" },
      h(View, { style: style.hero },
        h(View, { style: style.row },
          h(Image, { source: { uri: logo }, style: style.mark, accessibilityIgnoresInvertColors: true }),
          h(View, { style: { flex: 1 } },
            h(Text, { style: style.overline }, "MOBILE · v" + MOGGCORD_MOBILE_VERSION),
            h(Text, { style: style.title, accessibilityRole: "header" }, "Moggcord")
          )
        )
      ),
      h(View, { style: style.tabBar }, tabs.map(value => chip(value, () => go(value), { selected: value === tab }))),
      notice ? h(View, { style: style.card }, h(Text, { style: style.text, accessibilityLiveRegion: "polite" }, notice)) : null,
      content
    );
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
