#!/usr/bin/env bash
# Wraps the extension into a Safari Web Extension Xcode project (macOS + Xcode required).
#   ./scripts/build-safari.sh
# Then open safari/Ad Tray/Ad Tray.xcodeproj, choose the "Ad Tray" scheme and Run.
# For personal use without a paid Apple Developer account: Safari > Settings > Advanced >
# "Show features for web developers", then Settings > Developer > "Allow unsigned extensions".
# No Xcode? Download the "ad-tray-safari" artifact built by GitHub Actions instead (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/verify.mjs
rm -rf safari
xcrun safari-web-extension-converter extension \
  --project-location safari \
  --app-name "Ad Tray" \
  --bundle-identifier fr.thanhhungdoan.adtray \
  --swift --macos-only --copy-resources --no-open --no-prompt --force
# The converter derives the app's ID from its name; the extension's ID must start with it.
sed -i '' -E 's/PRODUCT_BUNDLE_IDENTIFIER = "?fr\.thanhhungdoan\.Ad-Tray"?;/PRODUCT_BUNDLE_IDENTIFIER = fr.thanhhungdoan.adtray;/' \
  "safari/Ad Tray/Ad Tray.xcodeproj/project.pbxproj"
echo "Done: open safari/Ad\ Tray/Ad\ Tray.xcodeproj"
