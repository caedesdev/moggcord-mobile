#!/usr/bin/env bash
set -euo pipefail

build=352017
discord_cert=3c39d23cf9367849a5c699395647fe0e5bfea5a1f1f40d8c717ddc70f8bfa113
mirror=https://proxy.vd.ushie.dev/tracker/download
original=com.discord
clone=cc.moggcord.mobile.discord
launcher=cc.moggcord.mobile.launcher.debug
launcher_apk=android/loader/build/outputs/apk/debug/loader-debug.apk
android_tools="${ANDROID_HOME:?}/build-tools/35.0.0"
output="$PWD/dist/android-runtime-ci"
scratch="$(mktemp -d)"
mkdir -p "$output"
trap 'rm -rf -- "$scratch"' EXIT

result() {
    printf '%s\n' "$*" | tee -a "$output/result.txt"
}

download_discord() {
    local part apk cert package_line
    for part in base config.x86_64 config.xxhdpi config.en; do
        apk="$scratch/$part.apk"
        curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
            --retry 2 --max-time 180 --max-filesize 220000000 -o "$apk" "$mirror/$build/$part"
        cert="$("$android_tools/apksigner" verify --print-certs "$apk" |
            awk '/^Signer #[0-9]+ certificate SHA-256 digest:/ { print tolower($NF) }')"
        if [[ "$cert" != "$discord_cert" ]]; then
            result "Unexpected Discord signer for $part"
            return 1
        fi
        package_line="$("$android_tools/aapt2" dump badging "$apk" | sed -n '/^package: /p')"
        if [[ "$package_line" != "package: name='$original' versionCode='$build' "* ]]; then
            result "Unexpected Discord package or version for $part"
            return 1
        fi
        if [[ "$part" != base && "$package_line" != *"split='$part'"* ]]; then
            result "Unexpected Discord split identifier for $part"
            return 1
        fi
        result "Verified Discord $build $part"
    done
}

dump_ui() {
    local file="$scratch/window.xml" remote=/data/local/tmp/moggcord-ci-window.xml
    adb shell rm -f "$remote"
    timeout 14s adb shell uiautomator dump --compressed "$remote" >/dev/null 2>&1 || return 1
    adb exec-out cat "$remote" >"$file"
    [[ -s "$file" ]]
}

inspect_ui() {
    python3 - "$scratch/window.xml" "$1" "$2" "$3" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

source, mode, package, output = sys.argv[1:]
try:
    root = ET.parse(source).getroot()
except (OSError, ET.ParseError):
    sys.exit(1)

welcome = {'welcome to discord', 'log in', 'login', 'register', 'sign up', 'create an account', 'email or phone number'}
installer_packages = {'com.android.packageinstaller', 'com.google.android.packageinstaller',
                      'com.android.permissioncontroller', 'com.google.android.permissioncontroller'}
approved_labels = welcome | {'install in discord', 'reinstall moggcord', 'open moggcord', 'install', 'update', 'cancel', 'done', 'open'}
allowed_packages = installer_packages | {package, 'com.discord', 'cc.moggcord.mobile.discord',
                                         'cc.moggcord.mobile.launcher.debug'}
safe = ET.Element('hierarchy')
found = None
for node in root.iter('node'):
    attrs = node.attrib
    node_package = attrs.get('package', '')
    if node_package not in allowed_packages:
        continue
    labels = {re.sub(r'\s+', ' ', attrs.get(key, '').strip().lower()) for key in ('text', 'content-desc')}
    markers = labels & approved_labels
    fields = {key: attrs[key] for key in ('package', 'class', 'resource-id', 'bounds', 'clickable', 'enabled')
              if key in attrs and re.fullmatch(r'[A-Za-z0-9_:/.$\[\],-]*', attrs[key])}
    if markers:
        fields['recognized-labels'] = ', '.join(sorted(markers))
    ET.SubElement(safe, 'node', fields)

    if mode == 'screen' and node_package == package and labels & welcome:
        found = 'welcome'
    elif mode == 'launcher' and node_package == package and attrs.get('resource-id', '').endswith(':id/discord_action'):
        if labels & {'install in discord', 'reinstall moggcord'} and attrs.get('enabled') == 'true':
            found = attrs.get('bounds')
    elif mode == 'confirm' and node_package in installer_packages and labels & {'install', 'update'}:
        if attrs.get('clickable') == 'true' and attrs.get('enabled') == 'true':
            found = attrs.get('bounds')

ET.ElementTree(safe).write(output, encoding='utf-8', xml_declaration=True)
if found == 'welcome':
    print(found)
elif found:
    bounds = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', found)
    if bounds:
        x1, y1, x2, y2 = map(int, bounds.groups())
        if x2 > x1 and y2 > y1:
            print((x1 + x2) // 2, (y1 + y2) // 2)
            sys.exit(0)
    sys.exit(1)
else:
    sys.exit(1)
PY
}

tap_bounds() {
    local x y
    read -r x y <<<"$1"
    adb shell input tap "$x" "$y"
}

capture() {
    local label="$1"
    adb exec-out screencap -p >"$output/$label.png" || true
    adb logcat -d -v brief -s 'MoggcordMobile:V' 'MoggcordInstaller:V' 'LSPatch:I' 'LSPatch-MetaLoader:I' \
        'ReactNativeJS:I' 'ReactNative:W' 'AndroidRuntime:E' 'linker:W' 'ActivityTaskManager:I' |
        awk '/MoggcordMobile|MoggcordInstaller|LSPatch|Running "Discord"|ReactNative|FATAL EXCEPTION|AndroidRuntime|linker|com\.discord|cc\.moggcord/ &&
             tolower($0) !~ /https?:\/\/|token|secret|cookie|authorization|password|account|serial|email/' \
        >"$output/$label.log" || true
}

probe() {
    local label="$1" package="$2" deadline
    adb shell am force-stop "$package"
    adb logcat -c
    if ! timeout 25s adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
        -n "$package/com.discord.main.MainDefault" >"$output/$label-start.txt" 2>&1 ||
        grep -q '^Error' "$output/$label-start.txt"; then
        result "$label: Discord activity did not launch"
        capture "$label"
        return 1
    fi
    deadline=$((SECONDS + 60))
    while ((SECONDS < deadline)); do
        if dump_ui && inspect_ui screen "$package" "$output/$label.xml" >/dev/null; then
            result "$label: signed-out welcome or login UI visible"
            capture "$label"
            return 0
        fi
        sleep 2
    done
    result "$label: no recognized welcome or login UI before timeout"
    capture "$label"
    return 1
}

install_clone() {
    local label="${1:-launcher}" tap deadline before after confirm_tapped=false
    before="$(adb shell pm path "$clone" | tr -d '\r' || true)"
    adb shell am force-stop "$original"
    adb logcat -c
    adb install -r "$launcher_apk"
    adb shell cmd appops set "$launcher" REQUEST_INSTALL_PACKAGES allow
    adb shell am start -W -n "$launcher/cc.moggcord.mobile.loader.LauncherActivity" >"$output/$label-start.txt"
    deadline=$((SECONDS + 35))
    while ((SECONDS < deadline)); do
        if dump_ui && tap="$(inspect_ui launcher "$launcher" "$output/$label.xml")"; then
            tap_bounds "$tap"
            break
        fi
        sleep 2
    done

    deadline=$((SECONDS + 150))
    while ((SECONDS < deadline)); do
        after="$(adb shell pm path "$clone" | tr -d '\r' || true)"
        if [[ "$after" == package:* && "$after" != "$before" ]]; then
            result "$label: cloned Discord installed"
            capture "$label"
            return 0
        fi
        if [[ "$confirm_tapped" == false ]] && dump_ui &&
            tap="$(inspect_ui confirm "$launcher" "$output/$label-installer.xml")"; then
            tap_bounds "$tap"
            confirm_tapped=true
        fi
        sleep 2
    done
    result "$label: cloned Discord installation did not complete"
    capture "$label"
    return 1
}

download_discord
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
result "Emulator API $(adb shell getprop ro.build.version.sdk | tr -d '\r'), ABI $(adb shell getprop ro.product.cpu.abi | tr -d '\r'), pages $(adb shell getconf PAGE_SIZE | tr -d '\r') bytes"
adb install-multiple "$scratch/base.apk" "$scratch/config.x86_64.apk" "$scratch/config.xxhdpi.apk" "$scratch/config.en.apk"

probe original "$original" || exit 1

loader=android/loader/src/main/java/cc/moggcord/mobile/loader/MoggcordLoader.java
packer=android/loader/src/main/java/cc/moggcord/mobile/loader/DiscordPackage.java
cp "$loader" "$scratch/loader-with-fallback.java"
cp "$packer" "$scratch/packer-normal.java"
python3 - "$packer" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text()
anchor = '                byte[] table = read(resources);\n'
fault = '''                // The test leaves the actual .jsona file in the archive and renames only its lookup key.
                byte[] key = "intl_messages_enuscompiledmessages".getBytes(java.nio.charset.StandardCharsets.UTF_8);
                for (int offset = 2; offset + key.length < table.length; offset++) {
                    if (table[offset - 2] == key.length && table[offset - 1] == key.length
                            && table[offset + key.length] == 0
                            && java.util.Arrays.equals(table, offset, offset + key.length, key, 0, key.length)) {
                        table[offset] = (byte) 'x';
                        break;
                    }
                }
'''
assert source.count(anchor) == 1
path.write_text(source.replace(anchor, anchor + fault))
PY

git show 5c3a29811a4515fc936f120c7a241d0d69869e19:"$loader" > "$loader"
gradle -p android :loader:assembleDebug
install_clone launcher-control
control_ok=true
probe clone-control "$clone" || control_ok=false

cp "$scratch/loader-with-fallback.java" "$loader"
gradle -p android :loader:assembleDebug
install_clone launcher-recovery
recovery_ok=true
probe clone-recovery "$clone" || recovery_ok=false

cp "$scratch/packer-normal.java" "$packer"
gradle -p android :loader:assembleDebug
adb uninstall "$clone"
install_clone launcher-normal
normal_ok=true
probe clone-normal "$clone" || normal_ok=false

result "Locale lookup comparison: control=$control_ok, recovery=$recovery_ok, normal=$normal_ok"
[[ "$control_ok" == false && "$recovery_ok" == true && "$normal_ok" == true ]]
grep -F 'Recovered a Discord locale resource from the installed APK.' "$output/clone-recovery.log"
