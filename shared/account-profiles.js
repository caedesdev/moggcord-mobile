import { createAccountBackup, maxAccountBackupLength, readAccountBackup } from "./account-backups.js";

export function createAccountProfiles(React, RN) {
  const { createElement: h, useEffect, useRef, useState } = React;
  const { Share, Text, TextInput, View } = RN;

  function BackupControls({ account, accounts, capture, restore, ready, styles, color, button }) {
    const [saved, setSaved] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [confirm, setConfirm] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [input, setInput] = useState("");
    const running = useRef(false);

    useEffect(() => {
      let active = true;
      accounts.backups.load(account.id).then(backup => {
        if (active) setSaved(backup);
      }).catch(() => {
        if (active) setNotice("Could not read the saved account backup.");
      }).finally(() => {
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [account.id]);

    async function run(action, failure) {
      if (running.current || accounts.current()?.id !== account.id) return;
      running.current = true;
      setBusy(true);
      setNotice("");
      try {
        await action();
      } catch {
        setNotice(failure);
      } finally {
        running.current = false;
        setBusy(false);
      }
    }

    function save() {
      return run(async () => {
        const backup = createAccountBackup(account, capture());
        setSaved(await accounts.backups.save(backup, account.id));
        setNotice("Account backup saved on this device.");
      }, "Could not save the account backup.");
    }

    function importBackup() {
      return run(async () => {
        let backup;
        try {
          backup = readAccountBackup(input, account.id);
        } catch (error) {
          setNotice(error.message);
          return;
        }
        setSaved(await accounts.backups.save(backup, account.id));
        setInput("");
        setImportOpen(false);
        setNotice("Account backup imported.");
      }, "Could not import the account backup.");
    }

    const disabled = loading || busy || !ready;
    return h(View, null,
      h(Text, { style: styles.label }, "Settings backup"),
      h(Text, { style: [styles.caption, { marginTop: 4 }] }, loading ? "Reading account backup…"
        : saved ? "Saved " + new Date(saved.savedAt).toLocaleString("en-US") : "No backup for this account yet."),
      h(View, { style: [styles.filters, { marginTop: 12, marginBottom: 0 }] },
        button(saved ? "Update account backup" : "Save account backup", save, { primary: true, disabled, filter: true }),
        saved ? button("Restore backup", () => setConfirm(true), { disabled, filter: true }) : null,
        saved && typeof Share?.share === "function" ? button("Share backup", () => run(() =>
          Share.share({ title: "Moggcord account backup", message: JSON.stringify(saved, null, 2) }),
        "Could not share the account backup."), { disabled, filter: true }) : null,
        button(importOpen ? "Close import" : "Import backup", () => {
          setImportOpen(value => !value);
          setInput("");
        }, { disabled, filter: true })),
      confirm ? h(View, { style: { marginTop: 8 } },
        h(Text, { style: styles.text }, "Replace the current Moggcord settings with this account backup?"),
        h(View, { style: [styles.filters, { marginTop: 8, marginBottom: 0 }] },
          button("Restore now", () => {
            setConfirm(false);
            void run(async () => {
              if (await restore(saved)) setNotice("Account backup restored.");
              else setNotice("The account backup could not be restored.");
            }, "The account backup could not be restored.");
          }, { primary: true, disabled, filter: true }),
          button("Cancel", () => setConfirm(false), { disabled: busy, filter: true }))) : null,
      importOpen ? h(View, { style: { marginTop: 12 } },
        h(TextInput, {
          style: [styles.input, { minHeight: 100, textAlignVertical: "top" }],
          value: input, onChangeText: setInput, multiline: true, maxLength: maxAccountBackupLength,
          editable: !busy, autoCapitalize: "none", autoCorrect: false, spellCheck: false,
          placeholder: "Paste account backup JSON", placeholderTextColor: color.muted,
          accessibilityLabel: "Account backup JSON"
        }),
        button("Save imported backup", importBackup, { disabled: disabled || !input.trim(), filter: true })) : null,
      notice ? h(Text, { style: [styles.caption, { marginTop: 9 }], accessibilityLiveRegion: "polite" }, notice) : null);
  }

  return function AccountProfiles(props) {
    const { accounts, styles, button } = props;
    const [account, setAccount] = useState(accounts.current);
    const [opening, setOpening] = useState(false);
    const [notice, setNotice] = useState("");

    useEffect(() => {
      const refresh = () => setAccount(previous => {
        const next = accounts.current();
        return previous?.id === next?.id && previous?.username === next?.username ? previous : next;
      });
      const unsubscribe = accounts.subscribe(refresh);
      refresh();
      return unsubscribe;
    }, [accounts]);

    async function manageAccounts() {
      setOpening(true);
      setNotice("");
      try {
        if (!await accounts.openManager()) {
          setNotice("Account switching is unavailable in this Discord session.");
        }
      } catch {
        setNotice("Could not open Discord’s account switcher.");
      } finally {
        setOpening(false);
      }
    }

    return h(View, { style: [styles.padded, styles.divider] },
      account ? h(React.Fragment, { key: account.id },
        h(Text, { style: styles.label }, account.username ? "@" + account.username : "Discord account"),
        h(View, { style: { marginTop: 8 } },
          button("Switch accounts", manageAccounts, { disabled: opening })),
        notice ? h(Text, { style: [styles.caption, { marginTop: 6 }], accessibilityLiveRegion: "polite" }, notice) : null,
        h(View, { style: [styles.divider, { marginTop: 14, paddingTop: 12 }] },
          h(BackupControls, { ...props, account })))
        : h(Text, { style: styles.caption }, "Sign in to Discord to use account profiles."));
  };
}
