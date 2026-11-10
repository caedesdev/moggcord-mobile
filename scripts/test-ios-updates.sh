#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p dist/tests
xcrun --sdk macosx clang++ -std=c++17 -fobjc-arc -Wall -Wextra -framework Foundation -framework Security \
  ios/UpdateStore.mm tests/ios-updates.mm -o dist/tests/ios-updates
dist/tests/ios-updates
