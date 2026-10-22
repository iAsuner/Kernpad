#!/bin/zsh
set -eu
task_source_dir="${0:A:h}"
task_build_dir="${KERNPAD_BUILD_DIR:-${task_source_dir:h}/Build}"
task_app_dir="$task_build_dir/LocalUnlockAcceptance.app"
mkdir -p "$task_build_dir/module-cache" "$task_app_dir/Contents/MacOS"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" \
 "$task_source_dir/Tests/LocalUnlockAcceptance.swift" -o "$task_app_dir/Contents/MacOS/LocalUnlockAcceptance"
cat > "$task_app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.kernpad.acceptance.localunlock</string>
<key>CFBundleExecutable</key><string>LocalUnlockAcceptance</string>
<key>CFBundleName</key><string>Kernpad 指纹测试</string>
<key>CFBundleDisplayName</key><string>Kernpad 指纹测试</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force --sign - --options runtime --entitlements "$task_source_dir/Entitlements.plist" "$task_app_dir"
codesign --verify --deep --strict "$task_app_dir"
printf 'Built isolated acceptance app: %s\n' "$task_app_dir"
