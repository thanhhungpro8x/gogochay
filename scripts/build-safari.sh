#!/usr/bin/env bash
# Wraps the extension into a Safari Web Extension Xcode project (macOS + Xcode required).
#   ./scripts/build-safari.sh
# Then open safari/Ad Tray/Ad Tray.xcodeproj, choose the "Ad Tray (macOS)" scheme and Run.
# For personal use without a paid Apple Developer account: Safari > Settings > Advanced >
# "Show features for web developers", then Develop > "Allow Unsigned Extensions".
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/verify.mjs
rm -rf safari
xcrun safari-web-extension-converter extension \
  --project-location safari \
  --app-name "Ad Tray" \
  --bundle-identifier fr.thanhhungdoan.adtray \
  --swift --copy-resources --no-open --force
echo "Done: open safari/Ad\ Tray/Ad\ Tray.xcodeproj"
