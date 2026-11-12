#!/usr/bin/env bash
set -euo pipefail

apk="$1"
output="$2"
build_tools="$ANDROID_HOME/build-tools/35.0.0"
platform="$ANDROID_HOME/platforms/android-36/android.jar"
if [[ "$(adb -e shell getprop ro.kernel.qemu | tr -d '\r')" != 1 ]]; then
  echo "The launcher preview requires an Android emulator." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -f -- "$work"/{preview.p12,AndroidManifest.xml,unsigned.apk,discord.apk,moggcord.apk}; rmdir -- "$work"' EXIT
keytool -genkeypair -keystore "$work/preview.p12" -storetype PKCS12 -alias fixture \
  -storepass android -keyalg RSA -keysize 2048 -validity 1 -dname 'CN=Moggcord Emulator Preview'

install_fixture() {
  local package="$1" name="$2" file="$3"
  cat > "$work/AndroidManifest.xml" <<EOF
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="$package" android:versionCode="1" android:versionName="Emulator preview">
    <application android:hasCode="false" android:label="$name" />
</manifest>
EOF
  "$build_tools/aapt2" link -I "$platform" --min-sdk-version 28 --target-sdk-version 34 \
    --manifest "$work/AndroidManifest.xml" -o "$work/unsigned.apk"
  java -jar "$build_tools/lib/apksigner.jar" sign --ks "$work/preview.p12" --ks-pass pass:android \
    --v4-signing-enabled false --out "$work/$file" "$work/unsigned.apk"
  adb -e install "$work/$file"
}

# These packages supply only the installed state in the launcher preview.
install_fixture com.discord 'Discord preview' discord.apk
install_fixture cc.moggcord.mobile.discord 'Moggcord Discord preview' moggcord.apk
adb -e install "$apk"
adb -e shell wm size 1080x1920
adb -e shell wm density 420
adb -e shell input keyevent 82
adb -e shell am start -W -n cc.moggcord.mobile.launcher.debug/cc.moggcord.mobile.loader.LauncherActivity
adb -e shell uiautomator dump /sdcard/moggcord-preview.xml
ui="$(adb -e shell cat /sdcard/moggcord-preview.xml)"
for label in 'Emulator preview' 'Open Moggcord' 'Reinstall Moggcord' 'Uninstall Moggcord'; do
  if [[ "$ui" != *"$label"* ]]; then
    echo "The launcher preview is missing $label." >&2
    exit 1
  fi
done
mkdir -p "$(dirname "$output")"
adb -e exec-out screencap -p > "$output"
test -s "$output"
