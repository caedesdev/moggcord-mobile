#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

test -s dist/moggcord-mobile.js || { printf '%s\n' 'Run npm run build first.' >&2; exit 1; }
mkdir -p dist/ios/generated
node scripts/embed-ios.mjs
xcrun --sdk iphoneos clang++ -dynamiclib -arch arm64 -miphoneos-version-min=16.0 \
  -std=c++17 -fobjc-arc -fvisibility=hidden -Wall -Wextra \
  -I ios/vendor -I dist/ios/generated -framework Foundation \
  -Wl,-undefined,dynamic_lookup -Wl,-install_name,@rpath/MoggcordMobile.dylib \
  ios/MoggcordMobile.mm -o dist/ios/MoggcordMobile.dylib
xcrun lipo -archs dist/ios/MoggcordMobile.dylib | grep -qx arm64
