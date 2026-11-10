#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
app="dist/tests/PlatformIndicatorTests.app"
mkdir -p "$app"
xcrun --sdk iphonesimulator clang++ -target "$(uname -m)-apple-ios16.0-simulator" \
  -std=c++17 -fobjc-arc -Wall -Wextra -framework UIKit -framework Foundation \
  ios/PlatformIndicators.mm tests/ios-platform-indicators.mm -o "$app/PlatformIndicatorTests"
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cc.moggcord.mobile.icon-tests</string>
<key>CFBundleExecutable</key><string>PlatformIndicatorTests</string>
<key>CFBundleName</key><string>Platform Indicator Tests</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>MinimumOSVersion</key><string>16.0</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
</dict></plist>
PLIST
codesign --force --sign - "$app"
device="$(xcrun simctl list devices available -j | python3 -c '
import json,sys
devices=json.load(sys.stdin)["devices"]
print(next(d["udid"] for runtime,items in devices.items() if ".iOS-" in runtime for d in items if d["name"].startswith("iPhone")))
')"
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
xcrun simctl launch --terminate-running-process "$device" cc.moggcord.mobile.icon-tests
container="$(xcrun simctl get_app_container "$device" cc.moggcord.mobile.icon-tests data)"
for attempt in {1..60}; do
  if test -f "$container/Documents/result.json"; then break; fi
  sleep 0.5
done
cp "$container/Documents/result.json" dist/tests/platform-indicators-result.json
python3 -c 'import json; r=json.load(open("dist/tests/platform-indicators-result.json")); print(r); assert r.get("success"), r'
cp "$container/Documents/preview.png" dist/tests/platform-indicators-native.png
xcrun simctl terminate "$device" cc.moggcord.mobile.icon-tests
